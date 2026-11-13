import 'server-only';
import { and, eq, inArray, max } from 'drizzle-orm';
import { onboardingAnswers, matches, roles, candidates, candidateIdentity, organisations, consentEvents } from '../db/schema';
import { desc } from 'drizzle-orm';
import { safeClaimProblems } from '../ai/validate';
import type { Ctx } from './context';
import { inferTags } from '../../lib/tags';
import { ONBOARDING_QUESTIONS } from '../../config/onboarding';

/** Practical details are for matching filters, not for interview answers. */
export const NOT_FOR_INTERVIEWS = new Set(['support_preference', 'environment_preference', 'why_move', 'salary', 'notice', 'location', 'work_mode', 'hours', 'right_to_work', 'gaps', 'not_interested', 'deal_breakers', 'questions_for_employers', 'employment_status']);
const QUESTION = new Map(ONBOARDING_QUESTIONS.map((q) => [q.key, q.text]));

/**
 * The candidate's approved mini-me answers, as material for their simulated interviews. Only what they
 * approved; identifying details are still caught when each interview is stored.
 */
export async function miniMeEvidence(ctx: Pick<Ctx, 'tx'>, candidateId: string) {
  // Newest first, so a fresh answer to an interview question wins over an older one.
  const rows = (await ctx.tx.select().from(onboardingAnswers).where(and(eq(onboardingAnswers.candidateId, candidateId), eq(onboardingAnswers.status, 'approved')))).sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime());
  return rows.map((r) => {
    const about = r.questionText ?? QUESTION.get(r.questionKey) ?? '';
    // Practical details (salary, notice...) only ever answer screening questions.
    return { id: `mm:${r.questionKey}`, safeClaim: r.answer, tags: inferTags(`${about} ${r.answer}`), strength: 'partial', key: r.questionKey.startsWith('extra:') ? null : r.questionKey, topic: r.questionText, practical: NOT_FOR_INTERVIEWS.has(r.questionKey) };
  });
}

/** Every mini-me item for these candidates, with when it last changed: what a re-interview check needs. */
export async function miniMeRows(ctx: Pick<Ctx, 'tx'>, candidateIds: string[]) {
  if (!candidateIds.length) return new Map<string, { key: string; topic: string | null; answer: string; updatedAt: Date }[]>();
  const rows = await ctx.tx.select({ c: onboardingAnswers.candidateId, key: onboardingAnswers.questionKey, topic: onboardingAnswers.questionText, answer: onboardingAnswers.answer, updatedAt: onboardingAnswers.updatedAt }).from(onboardingAnswers).where(and(inArray(onboardingAnswers.candidateId, candidateIds), eq(onboardingAnswers.status, 'approved')));
  const out = new Map<string, { key: string; topic: string | null; answer: string; updatedAt: Date }[]>();
  for (const r of rows) out.set(r.c, [...(out.get(r.c) ?? []), { key: r.key, topic: r.topic ?? QUESTION.get(r.key) ?? null, answer: r.answer, updatedAt: r.updatedAt }]);
  return out;
}

/** When each candidate last approved something in their mini-me, so their interviews can be redone. */
export async function miniMeUpdatedAt(ctx: Pick<Ctx, 'tx'>, candidateIds: string[]) {
  if (!candidateIds.length) return new Map<string, Date>();
  const rows = await ctx.tx.select({ c: onboardingAnswers.candidateId, at: max(onboardingAnswers.updatedAt) }).from(onboardingAnswers).where(and(inArray(onboardingAnswers.candidateId, candidateIds), eq(onboardingAnswers.status, 'approved'))).groupBy(onboardingAnswers.candidateId);
  return new Map(rows.filter((r) => r.at).map((r) => [r.c, r.at as Date]));
}

const COMPANY = /\b(ltd|limited|plc|inc|llp|gmbh)\b\.?/i;

/** Names and organisations that must never reach a client: theirs, anyone's in this dataset, any organisation. */
export async function identifyingStrings(ctx: Pick<Ctx, 'tx'>, candidateId: string) {
  const [c] = await ctx.tx.select({ ds: candidates.datasetId }).from(candidates).where(eq(candidates.id, candidateId));
  if (!c) return [];
  const [idn] = await ctx.tx.select({ n: candidateIdentity.fullName, e: candidateIdentity.currentEmployerLabel }).from(candidateIdentity).where(eq(candidateIdentity.candidateId, candidateId));
  const orgNames = (await ctx.tx.select({ n: organisations.displayName }).from(organisations).where(eq(organisations.datasetId, c.ds))).map((o) => o.n);
  const people = await ctx.tx.select({ n: candidateIdentity.fullName }).from(candidateIdentity).innerJoin(candidates, eq(candidates.id, candidateIdentity.candidateId)).where(eq(candidates.datasetId, c.ds));
  return [...(idn ? [idn.n, ...idn.n.split(/\s+/).filter((x) => x.length >= 3)] : []), ...(idn?.e ? [idn.e] : []), ...orgNames, ...people.map((p) => p.n).filter(Boolean)];
}

/**
 * Mini-me answers as matching evidence: everything they told it about their work (not salary, notice and the like),
 * minus any answer that names a person or organisation, or holds contact details. No one has to review it first:
 * the more they add, the more of a job's criteria it can cover, and the higher they rank.
 */
export async function miniMeMatchEvidence(ctx: Pick<Ctx, 'tx'>, candidateId: string) {
  const all = (await miniMeEvidence(ctx, candidateId)).filter((e) => !e.practical);
  if (!all.length) return [];
  const forbidden = await identifyingStrings(ctx, candidateId);
  return all.map((e) => {
    let claim = e.safeClaim;
    for (const name of [...forbidden].sort((a, b) => b.length - a.length)) {
      if (name.trim().length < 3) continue;
      claim = claim.replace(new RegExp(name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi'), '[name hidden]');
    }
    claim = claim.replace(/[\w.+-]+@[\w-]+\.[\w.-]+/g, '[email hidden]').replace(/(?:https?:\/\/|www\.)\S+/gi, '[link hidden]').replace(/(?:\+?\d[\s-]?){9,}/g, '[phone hidden]');
    return { ...e, safeClaim: claim };
  }).filter((e) => !safeClaimProblems(e.safeClaim, forbidden).length && !COMPANY.test(e.safeClaim))
    .map((e) => ({ id: e.id, safeClaim: e.safeClaim, tags: e.tags, strength: e.strength, uncertainty: null as string | null }));
}

/**
 * Visible from the moment they sign up: an active account with a published (possibly empty) anonymous profile.
 * Discovery still follows their own choice, and they can turn it off at any time.
 */
export async function ensureLive(ctx: Ctx, candidateId: string) {
  const [c] = await ctx.tx.select().from(candidates).where(eq(candidates.id, candidateId));
  if (!c || c.status === 'deleting' || c.status === 'deleted' || c.status === 'paused') return;
  if (c.status === 'onboarding') {
    const [consent] = await ctx.tx.select({ g: consentEvents.granted }).from(consentEvents).where(and(eq(consentEvents.candidateId, candidateId), eq(consentEvents.kind, 'discovery'))).orderBy(desc(consentEvents.eventAt), desc(consentEvents.createdAt)).limit(1);
    await ctx.tx.update(candidates).set({ status: 'active', discoveryEnabled: !!consent?.g, updatedAt: new Date() }).where(eq(candidates.id, candidateId));
  }
  const { rebuildProfile } = await import('./profiles');
  // Publishes a profile if they have none; otherwise this just refreshes their matches.
  if (!c.latestProfileVersionId) await rebuildProfile(ctx, candidateId);
  else {
    const { recomputeCandidate } = await import('./matching');
    await recomputeCandidate(ctx, candidateId);
  }
}

/** After they add or change something: refresh their matches, then (re)run their interviews for every live job they match. */
export async function refreshInterviews(ctx: Ctx, candidateId: string) {
  await ensureLive(ctx, candidateId);
  const { requestSimulations } = await import('./simulation');
  const live = await ctx.tx.select({ roleId: matches.roleId }).from(matches).innerJoin(roles, eq(roles.id, matches.roleId)).where(and(eq(matches.candidateId, candidateId), eq(roles.status, 'open')));
  for (const r of live) await requestSimulations(ctx, r.roleId);
  return live.length;
}
