import { and, eq, inArray, ne } from 'drizzle-orm';
import { roles, matches, candidates, candidateIdentity, organisations, simulatedInterviews, jobs } from '../db/schema';
import { compareMatches } from '../lib/matching-rules';
import { safeClaimProblems } from '../ai/validate';
import { runAi, aiMode, AiFailure } from '../ai';
import type { SimulationOutput } from '../ai/schemas';
import { withTx, readCtx, type BaseCtx, type Ctx } from './context';
import { criteriaFor } from './roles';
import { assessmentInput } from './matching';
import { enqueue } from './jobs';
import { clientMaySeeCandidateOnRole } from '../policies/privacy';

/**
 * Simulated interviews. For a live job, the best-matched candidates are "interviewed" using only their own
 * approved, anonymised examples, then scored for fit. The result is a prediction to help choose who to meet,
 * never something the person said, and a person always decides.
 */
/** Enough to fill the largest list (20) with a little spare. */
export const SIM_LIMIT = 22;
export const NOT_SHARED = 'They haven’t shared an example of this yet.';

type Crit = Awaited<ReturnType<typeof criteriaFor>>[number];
type Evidence = { id: string; safeClaim: string; tags: string[]; strength: string };
export type SimAnswer = { question: string; answer: string; evidenceIds: string[]; grounded: boolean };

/** Up to three questions from what matters most, plus one about the role's main goal. */
export function interviewQuestions(role: { title: string; outcomes: string[] }, crit: Crit[]) {
  const top = [...crit].sort((a, b) => b.weight - a.weight || a.ordinal - b.ordinal).slice(0, 3);
  const qs = top.map((c) => ({ text: `Tell me about a time you worked on ${c.label.toLowerCase()}. What did you do, and what happened?`, crit: c as Crit | null }));
  if (role.outcomes[0]) qs.push({ text: `In this job you would need to: ${role.outcomes[0].replace(/[.!]$/, '')}. How would you approach that?`, crit: null });
  return qs;
}

const STRENGTH: Record<string, number> = { specific: 1, partial: 0.6, assertion: 0.3 };

/** Demo mode: answers are the candidate's own approved examples, matched to each question by skill. */
export function demoSimulation(questions: ReturnType<typeof interviewQuestions>, evidence: Evidence[]): SimulationOutput & { built: SimAnswer[] } {
  const rank = (list: Evidence[]) => [...list].sort((a, b) => (STRENGTH[b.strength] ?? 0) - (STRENGTH[a.strength] ?? 0));
  const best = (tags: string[] | null) => rank(evidence.filter((e) => !tags || e.tags.some((t) => tags.includes(t))))[0];
  // Use each example once where possible, so answers don't repeat; fall back to the best fit if nothing else is left.
  const used = new Set<string>();
  const built: SimAnswer[] = questions.map((q) => {
    const fits = rank(evidence.filter((e) => !q.crit || e.tags.some((t) => q.crit!.evidenceTags.includes(t))));
    const e = fits.find((x) => !used.has(x.id)) ?? (q.crit ? fits[0] : undefined);
    if (!e) return { question: q.text, answer: NOT_SHARED, evidenceIds: [], grounded: false };
    used.add(e.id);
    return { question: q.text, answer: e.safeClaim, evidenceIds: [e.id], grounded: true };
  });
  const scored = questions.filter((q) => q.crit);
  const total = scored.reduce((a, q) => a + q.crit!.weight, 0) || 1;
  const got = scored.reduce((a, q) => { const e = best(q.crit!.evidenceTags); return a + q.crit!.weight * (e ? STRENGTH[e.strength] ?? 0 : 0); }, 0);
  const strong = scored.filter((q) => best(q.crit!.evidenceTags)).map((q) => q.crit!.label.toLowerCase());
  const missing = scored.filter((q) => !best(q.crit!.evidenceTags)).map((q) => q.crit!.label.toLowerCase());
  const summary = strong.length ? `Good examples of ${strong.join(' and ')}.${missing.length ? ` Nothing yet on ${missing.join(' or ')}.` : ''}` : 'Not much to go on yet. A phone screening would tell you more.';
  return { built, answers: [], fitScore: Math.round((got / total) * 100), summary, concerns: missing.slice(0, 3) };
}

/** The best-matched candidates this client may see, still needing a simulation for the current versions. */
export async function simulationTargets(ctx: Ctx, roleId: string) {
  const [role] = await ctx.tx.select().from(roles).where(eq(roles.id, roleId));
  if (!role || role.status !== 'open') return { role: role ?? null, targets: [] as { candidateId: string }[] };
  const ms = await ctx.tx.select().from(matches).where(and(eq(matches.roleId, roleId), ne(matches.eligibility, 'incompatible')));
  const refs = await ctx.tx.select({ id: candidates.id, ref: candidates.publicRef, pv: candidates.latestProfileVersionId }).from(candidates).where(inArray(candidates.id, ms.length ? ms.map((m) => m.candidateId) : ['00000000-0000-0000-0000-000000000000']));
  const info = new Map(refs.map((r) => [r.id, r]));
  const ranked = ms.map((m) => ({ m, publicRef: info.get(m.candidateId)?.ref ?? '', eligibility: m.eligibility, score: m.score, coverageBps: m.coverageBps })).sort(compareMatches);
  const existing = await ctx.tx.select().from(simulatedInterviews).where(eq(simulatedInterviews.roleId, roleId));
  const fresh = new Set(existing.filter((s) => s.roleVersion === role.roleVersion && s.profileVersionId === info.get(s.candidateId)?.pv).map((s) => s.candidateId));
  const targets: { candidateId: string }[] = [];
  let considered = 0;
  for (const r of ranked) {
    if (considered >= SIM_LIMIT) break;
    if (!(await clientMaySeeCandidateOnRole(ctx, { candidateId: r.m.candidateId, clientId: role.clientId, roleId, hasIntro: false }))) continue;
    considered++;
    if (!fresh.has(r.m.candidateId)) targets.push({ candidateId: r.m.candidateId });
  }
  return { role, targets };
}

/** Starts (or reuses) the background job for this role. Safe to call on every page view. */
export async function requestSimulations(ctx: Ctx, roleId: string) {
  const { role, targets } = await simulationTargets(ctx, roleId);
  if (!role || !targets.length) return { queued: false };
  await enqueue(ctx, 'simulate_interviews', roleId, `simulate:${roleId}:${role.roleVersion}:${Math.floor(Date.now() / 600000)}`);
  return { queued: true };
}

export async function simulationPending(ctx: Ctx, roleId: string) {
  const rows = await ctx.tx.select({ id: jobs.id }).from(jobs).where(and(eq(jobs.datasetId, ctx.datasetId), eq(jobs.kind, 'simulate_interviews'), eq(jobs.subjectId, roleId), inArray(jobs.status, ['queued', 'running'])));
  return rows.length > 0;
}

/** Validates and stores one simulation. Rejects foreign evidence ids and anything identifying; stale results are discarded. */
export async function storeSimulation(ctx: Ctx, a: { roleId: string; candidateId: string; roleVersion: number; profileVersionId: string; answers: SimAnswer[]; fitScore: number; summary: string; concerns: string[]; provider: 'fixture' | 'anthropic'; evidenceIds: string[] }) {
  const [role] = await ctx.tx.select().from(roles).where(eq(roles.id, a.roleId)).for('update');
  const [cand] = await ctx.tx.select().from(candidates).where(eq(candidates.id, a.candidateId));
  if (!role || !cand || cand.status === 'deleting' || cand.status === 'deleted') return { stored: false, reason: 'unavailable' };
  if (role.roleVersion !== a.roleVersion || cand.latestProfileVersionId !== a.profileVersionId) return { stored: false, reason: 'stale_discarded' };
  const [idn] = await ctx.tx.select({ n: candidateIdentity.fullName, e: candidateIdentity.currentEmployerLabel }).from(candidateIdentity).where(eq(candidateIdentity.candidateId, a.candidateId));
  const orgNames = (await ctx.tx.select({ n: organisations.displayName }).from(organisations).where(eq(organisations.datasetId, ctx.datasetId))).map((o) => o.n);
  // Any real person's name in this dataset (not only this candidate's) and any organisation name is blocked.
  const people = await ctx.tx.select({ n: candidateIdentity.fullName }).from(candidateIdentity).innerJoin(candidates, eq(candidates.id, candidateIdentity.candidateId)).where(eq(candidates.datasetId, ctx.datasetId));
  const forbidden = [...(idn ? [idn.n, ...idn.n.split(/\s+/).filter((x) => x.length >= 3)] : []), ...(idn?.e ? [idn.e] : []), ...orgNames, ...people.map((p) => p.n).filter(Boolean)];
  const allowed = new Set(a.evidenceIds);
  const answers = a.answers.map((x) => {
    const ids = x.evidenceIds.filter((i) => allowed.has(i));
    const ok = ids.length > 0 && x.answer.trim() && !safeClaimProblems(x.answer, forbidden).length;
    return ok ? { ...x, evidenceIds: ids, grounded: true } : { question: x.question, answer: NOT_SHARED, evidenceIds: [], grounded: false };
  });
  const clean = (t: string) => (safeClaimProblems(t, forbidden).length ? '' : t.trim());
  const summary = clean(a.summary) || (answers.some((x) => x.grounded) ? 'Has relevant examples for this job.' : 'Not much to go on yet.');
  const concerns = a.concerns.map(clean).filter(Boolean).slice(0, 3);
  const fitScore = Math.max(0, Math.min(100, Math.round(a.fitScore)));
  const row = { datasetId: ctx.datasetId, roleId: a.roleId, candidateId: a.candidateId, roleVersion: a.roleVersion, profileVersionId: a.profileVersionId, answers, fitScore, summarySafe: summary, concernsSafe: concerns, provider: a.provider };
  await ctx.tx.insert(simulatedInterviews).values(row).onConflictDoUpdate({ target: [simulatedInterviews.roleId, simulatedInterviews.candidateId], set: { ...row, updatedAt: new Date() } });
  return { stored: true };
}

/** Worker job: simulate each target. Live calls go through the budgeted runAi; if refused, demo simulation is used instead. */
export async function handleSimulateJob(base: BaseCtx, roleId: string) {
  const { role, targets } = await simulationTargets(readCtx(base), roleId);
  if (!role || !targets.length) return;
  const crit = await criteriaFor(readCtx(base), roleId);
  const questions = interviewQuestions({ title: role.title, outcomes: role.outcomes }, crit);
  let live = aiMode() === 'live';
  for (const t of targets) {
    const prep = await assessmentInput(readCtx(base), roleId, t.candidateId);
    if (!prep || !prep.profileVersionId) continue;
    const evidence = prep.input.evidence;
    const demo = demoSimulation(questions, evidence);
    let result = { answers: demo.built, fitScore: demo.fitScore, summary: demo.summary, concerns: demo.concerns, provider: 'fixture' as 'fixture' | 'anthropic' };
    if (live && evidence.length) {
      try {
        const input = { role: { title: role.title, outcomes: role.outcomes }, questions: questions.map((q) => q.text), examples: evidence.map((e) => ({ id: e.id, text: e.safeClaim, tags: e.tags })) };
        const res = await runAi({ task: 'simulate', datasetId: base.datasetId, roleId, candidateId: t.candidateId, input }, (p) => p.simulateInterview(input));
        const out = res.output;
        result = {
          answers: questions.map((q, i) => { const a = out.answers.find((x) => x.questionIndex === i); return { question: q.text, answer: a?.answer ?? NOT_SHARED, evidenceIds: a?.evidenceIds ?? [], grounded: !!a?.evidenceIds.length }; }),
          fitScore: out.fitScore, summary: out.summary, concerns: out.concerns, provider: res.provider,
        };
      } catch (e) {
        if (!(e instanceof AiFailure)) throw e;
        if (e.code === 'monthly_budget' || e.code === 'daily_budget') live = false; // stop paid calls for the rest of this job
      }
    }
    await withTx(base, (ctx) => storeSimulation(ctx, { roleId, candidateId: t.candidateId, roleVersion: prep.roleVersion, profileVersionId: prep.profileVersionId!, ...result, evidenceIds: evidence.map((e) => e.id) }));
  }
}

/** Ranked simulations for the role page: best fit first. */
export async function simulationsForRole(ctx: Ctx, roleId: string) {
  const rows = await ctx.tx.select().from(simulatedInterviews).where(eq(simulatedInterviews.roleId, roleId));
  const [role] = await ctx.tx.select({ v: roles.roleVersion }).from(roles).where(eq(roles.id, roleId));
  return new Map(rows.filter((r) => r.roleVersion === role?.v).map((r) => [r.candidateId, r]));
}
