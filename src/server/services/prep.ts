import { and, eq } from 'drizzle-orm';
import { z } from 'zod';
import { introductions, pipelineEntries, matches, roles } from '../db/schema';
import { notFound, conflict } from '../lib/errors';
import { requireUser, type Ctx } from './context';
import { criteriaFor } from './roles';
import { validEvidenceForProfile } from './matching';
import { candidates } from '../db/schema';
import { activeGrant } from '../policies/privacy';
import { logActivity } from './audit';

const prepSchema = z.object({ discussionPoints: z.array(z.object({ text: z.string().min(3).max(400), evidenceIds: z.array(z.string()).max(3) })).max(3), questions: z.array(z.string().min(3).max(300)).max(5) });

async function introForViewer(ctx: Ctx, id: string) {
  const a = requireUser(ctx.actor);
  const [i] = await ctx.tx.select().from(introductions).where(and(eq(introductions.id, id), eq(introductions.datasetId, ctx.datasetId)));
  if (!i || !i.acceptedAt) throw notFound();
  if (a.userType === 'candidate' && i.candidateId !== a.candidateId) throw notFound();
  if (a.userType === 'client') {
    if (i.clientId !== a.clientId) throw notFound();
    if (!(await activeGrant(ctx, { candidateId: i.candidateId, clientId: i.clientId, roleId: i.roleId }))) throw notFound();
  }
  if (i.state !== 'accepted' && a.userType !== 'consultant') throw notFound();
  return i;
}

/** Shared preparation: the same safe text for candidate and client. Never private consultant notes. */
export async function prepFor(ctx: Ctx, introId: string) {
  const i = await introForViewer(ctx, introId);
  const [role] = await ctx.tx.select({ title: roles.title }).from(roles).where(eq(roles.id, i.roleId));
  const [pe] = await ctx.tx.select().from(pipelineEntries).where(eq(pipelineEntries.introductionId, i.id));
  const [cand] = await ctx.tx.select({ pv: candidates.latestProfileVersionId }).from(candidates).where(eq(candidates.id, i.candidateId));
  const ev = await validEvidenceForProfile(ctx, i.candidateId, cand?.pv ?? null);
  const evidence = ev.map((e) => ({ id: e.id, claim: e.safeClaim! }));
  if (pe?.interviewPrep) {
    const saved = pe.interviewPrep as { discussionPoints: { text: string; evidenceIds: string[] }[]; questions: string[]; preparedAt: string };
    return { roleTitle: role.title, ...saved, evidence: evidence.filter((e) => saved.discussionPoints.some((d) => d.evidenceIds.includes(e.id))), custom: true };
  }
  const crit = await criteriaFor(ctx, i.roleId);
  const [m] = await ctx.tx.select().from(matches).where(and(eq(matches.roleId, i.roleId), eq(matches.candidateId, i.candidateId)));
  const results = (m?.criterionResults as { criterionId: string; evidenceIds: string[] }[] | undefined) ?? [];
  const points = crit.slice(0, 3).map((c) => {
    const ids = (results.find((r) => r.criterionId === c.id)?.evidenceIds ?? []).filter((x) => evidence.some((e) => e.id === x)).slice(0, 1);
    return ids.length ? { text: `${c.label}: ${evidence.find((e) => e.id === ids[0])!.claim}`, evidenceIds: ids } : null;
  }).filter(Boolean) as { text: string; evidenceIds: string[] }[];
  return { roleTitle: role.title, discussionPoints: points, questions: crit.slice(0, 3).map((c) => `Tell us about an example of ${c.label.toLowerCase()}.`), evidence, custom: false, preparedAt: null };
}

export async function savePrep(ctx: Ctx, introId: string, raw: unknown) {
  const a = requireUser(ctx.actor, 'consultant');
  const input = prepSchema.parse(raw);
  const [pe] = await ctx.tx.select().from(pipelineEntries).where(eq(pipelineEntries.introductionId, introId)).for('update');
  if (!pe) throw notFound();
  const [i] = await ctx.tx.select().from(introductions).where(eq(introductions.id, introId));
  const [cand] = await ctx.tx.select({ pv: candidates.latestProfileVersionId }).from(candidates).where(eq(candidates.id, i.candidateId));
  const valid = new Set((await validEvidenceForProfile(ctx, i.candidateId, cand?.pv ?? null)).map((e) => e.id));
  if (input.discussionPoints.some((d) => d.evidenceIds.some((e) => !valid.has(e)))) throw conflict('INVALID_EVIDENCE', 'Use only the candidate’s approved evidence.');
  await ctx.tx.update(pipelineEntries).set({ interviewPrep: { ...input, preparedByUserId: a.userId, preparedAt: ctx.now.toISOString() }, updatedAt: new Date() }).where(eq(pipelineEntries.id, pe.id));
  await logActivity(ctx, { subjectType: 'introduction', subjectId: introId, action: 'prep.updated' });
  return {};
}
