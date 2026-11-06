import { and, desc, eq, inArray, ne } from 'drizzle-orm';
import { candidates, evidenceItems, matches, profileVersions, rankingAdjustments, roles, screenings } from '../db/schema';
import { eligibilityFor, combinedScore, confidenceFor, type Level } from '../lib/matching-rules';
import { fixtureProvider } from '../ai/providers/fixture';
import { permittedCandidateIdsForClient } from '../policies/privacy';
import { criteriaFor } from './roles';
import type { Ctx } from './context';

export async function validEvidenceForProfile(ctx: Pick<Ctx, 'tx'>, candidateId: string, profileVersionId: string | null) {
  if (!profileVersionId) return [];
  const [pv] = await ctx.tx.select().from(profileVersions).where(eq(profileVersions.id, profileVersionId));
  if (!pv || pv.reviewState !== 'approved' || !pv.evidenceIds.length) return [];
  const ev = await ctx.tx.select().from(evidenceItems).where(and(eq(evidenceItems.candidateId, candidateId), inArray(evidenceItems.id, pv.evidenceIds)));
  return ev.filter((e) => (e.reviewState === 'candidate_approved' || e.reviewState === 'consultant_verified') && e.anonymityReview === 'approved' && !!e.safeClaim);
}

export async function latestAdjustment(ctx: Pick<Ctx, 'tx'>, roleId: string, candidateId: string) {
  const [a] = await ctx.tx.select().from(rankingAdjustments).where(and(eq(rankingAdjustments.roleId, roleId), eq(rankingAdjustments.candidateId, candidateId))).orderBy(desc(rankingAdjustments.createdAt)).limit(1);
  return a ?? null;
}

type CriterionResult = { criterionId: string; aiLevel: Level; evidenceIds: string[]; humanLevel: Level | null; reasonSafe: string };

/** Deterministic pair computation. Fixture assessment inline; live AI results are applied by the worker. */
async function computePair(ctx: Ctx, role: typeof roles.$inferSelect, crit: Awaited<ReturnType<typeof criteriaFor>>, cand: typeof candidates.$inferSelect) {
  const evidence = await validEvidenceForProfile(ctx, cand.id, cand.latestProfileVersionId);
  const el = eligibilityFor(role, cand);
  const assess = await fixtureProvider.assessCriteria({
    criteria: crit.map((c) => ({ criterionId: c.id, label: c.label, description: c.description, evidenceTags: c.evidenceTags })),
    evidence: evidence.map((e) => ({ id: e.id, safeClaim: e.safeClaim!, tags: e.tags, strength: e.strength, uncertainty: e.uncertainty })),
  });
  const [scr] = await ctx.tx.select().from(screenings).where(and(eq(screenings.roleId, role.id), eq(screenings.candidateId, cand.id), eq(screenings.status, 'completed')));
  const human = scr ? new Map((scr.criterionAssessments as { criterionId: string; level: Level }[]).map((a) => [a.criterionId, a.level])) : null;
  const ai = new Map(assess.output.criteria.map((c) => [c.criterionId, c.level as Level]));
  const adj = await latestAdjustment(ctx, role.id, cand.id);
  const weights = crit.map((c) => ({ criterionId: c.id, weight: c.weight }));
  const s = combinedScore({ criteria: weights, ai, human, adjustment: adj?.adjustment ?? 0 });
  const results: CriterionResult[] = assess.output.criteria.map((c) => ({ criterionId: c.criterionId, aiLevel: c.level as Level, evidenceIds: c.evidenceIds, humanLevel: human?.get(c.criterionId) ?? null, reasonSafe: c.reasonSafe }));
  const unknownLabels = crit.filter((c) => (ai.get(c.id) ?? 'unknown') === 'unknown').map((c) => c.label);
  const known = crit.filter((c) => ['specific', 'partial'].includes(ai.get(c.id) ?? 'unknown')).map((c) => c.label.toLowerCase());
  const rationale = known.length ? `Approved evidence relates to ${known.join(', ')}.${unknownLabels.length ? ` Not enough evidence yet for ${unknownLabels.join(', ').toLowerCase()}.` : ''}` : 'Not enough evidence yet for this role. A conversation could show more.';
  return {
    datasetId: ctx.datasetId, roleId: role.id, candidateId: cand.id, profileVersionId: cand.latestProfileVersionId!, roleVersion: role.roleVersion,
    eligibility: el.eligibility, incompatibilityReason: el.reason, score: s.score, aiScore: s.aiScore, humanScore: s.humanScore, coverageBps: Math.round(s.coverage * 10000),
    confidence: confidenceFor(s.coverage), criterionResults: results, rationaleSafe: rationale, missingEvidence: unknownLabels, provider: 'fixture' as const, stale: false, computedAt: new Date(),
  };
}

/** Recomputes every permitted pair for one role. Non-permitted candidates have their cache row removed. */
export async function recomputeRole(ctx: Ctx, roleId: string) {
  const [role] = await ctx.tx.select().from(roles).where(eq(roles.id, roleId));
  if (!role || role.status === 'draft') return;
  const crit = await criteriaFor(ctx, roleId);
  const permitted = await permittedCandidateIdsForClient(ctx, role.clientId);
  const all = await ctx.tx.select().from(candidates).where(and(eq(candidates.datasetId, ctx.datasetId), ne(candidates.status, 'deleted')));
  const rows = [];
  const removeIds: string[] = [];
  for (const cand of all) {
    if (!permitted.has(cand.id) || !cand.latestProfileVersionId) { removeIds.push(cand.id); continue; }
    rows.push(await computePair(ctx, role, crit, cand));
  }
  if (removeIds.length) await ctx.tx.delete(matches).where(and(eq(matches.roleId, roleId), inArray(matches.candidateId, removeIds)));
  for (const r of rows) {
    await ctx.tx.insert(matches).values(r).onConflictDoUpdate({ target: [matches.roleId, matches.candidateId], set: { ...r, updatedAt: new Date() } });
  }
}

/** Targeted refresh: only this candidate's pairs across active roles. */
export async function recomputeCandidate(ctx: Ctx, candidateId: string) {
  const rs = await ctx.tx.select().from(roles).where(and(eq(roles.datasetId, ctx.datasetId), ne(roles.status, 'draft')));
  const [cand] = await ctx.tx.select().from(candidates).where(eq(candidates.id, candidateId));
  for (const role of rs) {
    const permitted = cand && cand.latestProfileVersionId ? await permittedCandidateIdsForClient(ctx, role.clientId) : new Set<string>();
    if (!cand || !permitted.has(candidateId)) {
      await ctx.tx.delete(matches).where(and(eq(matches.roleId, role.id), eq(matches.candidateId, candidateId)));
      continue;
    }
    const r = await computePair(ctx, role, await criteriaFor(ctx, role.id), cand);
    await ctx.tx.insert(matches).values(r).onConflictDoUpdate({ target: [matches.roleId, matches.candidateId], set: { ...r, updatedAt: new Date() } });
  }
}

export async function recomputeAll(ctx: Ctx) {
  const rs = await ctx.tx.select({ id: roles.id }).from(roles).where(and(eq(roles.datasetId, ctx.datasetId), ne(roles.status, 'draft')));
  for (const r of rs) await recomputeRole(ctx, r.id);
}
