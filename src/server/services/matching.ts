import { PROMPT_VERSION } from '../ai/prompts';
import { cheapModel } from '../ai/providers/anthropic';
import { createHash } from 'node:crypto';
import { candidateIdentity, organisations } from '../db/schema';
import { validateAssessment, safeClaimProblems } from '../ai/validate';
import type { AssessmentOutput } from '../ai/schemas';
import { and, desc, eq, inArray, ne } from 'drizzle-orm';
import { candidates, evidenceItems, matches, profileVersions, rankingAdjustments, roles, screenings } from '../db/schema';
import { ASSESSMENT_VERSION, eligibilityFor, combinedScore, confidenceFor, type Level } from '../lib/matching-rules';
import { fixtureProvider } from '../ai/providers/fixture';
import { aiMode } from '../ai';
import { enqueue } from './jobs';
import { permittedCandidateIdsForClient, discoveryState, isBlockedForClient } from '../policies/privacy';
import { miniMeMatchEvidence, miniMeUpdatedAt } from './mini-me';
import { criteriaFor } from './roles';
import type { Ctx } from './context';

export async function validEvidenceForProfile(ctx: Pick<Ctx, 'tx'>, candidateId: string, profileVersionId: string | null) {
  if (!profileVersionId) return [];
  const [pv] = await ctx.tx.select().from(profileVersions).where(eq(profileVersions.id, profileVersionId));
  if (!pv || pv.reviewState !== 'approved' || !pv.evidenceIds.length) return [];
  const ev = await ctx.tx.select().from(evidenceItems).where(and(eq(evidenceItems.candidateId, candidateId), inArray(evidenceItems.id, pv.evidenceIds)));
  return ev.filter((e) => (e.reviewState === 'candidate_approved' || e.reviewState === 'consultant_verified') && e.anonymityReview === 'approved' && !!e.safeClaim);
}

/** Everything a match may use: approved profile examples plus what their mini-me knows (identifiers removed). */
export async function matchEvidence(ctx: Pick<Ctx, 'tx'>, candidateId: string, profileVersionId: string | null) {
  return [...(await validEvidenceForProfile(ctx, candidateId, profileVersionId)), ...(await miniMeMatchEvidence(ctx, candidateId))];
}

/** Until they've told us their job preferences, nothing rules a job out: it's flagged to discuss instead. */
function eligibilityOf(role: typeof roles.$inferSelect, cand: typeof candidates.$inferSelect) {
  if (cand.preferencesConfirmed) return eligibilityFor(role, cand);
  // Age is asked on its own, so it still applies before their job preferences are set.
  if (role.requires18 && cand.over18 === false) return { eligibility: 'incompatible' as const, reason: 'under_18' };
  return { eligibility: 'needs_clarification' as const, reason: 'preferences_not_set' };
}

export async function latestAdjustment(ctx: Pick<Ctx, 'tx'>, roleId: string, candidateId: string) {
  const [a] = await ctx.tx.select().from(rankingAdjustments).where(and(eq(rankingAdjustments.roleId, roleId), eq(rankingAdjustments.candidateId, candidateId))).orderBy(desc(rankingAdjustments.createdAt)).limit(1);
  return a ?? null;
}

const evidenceHash = (evidence: { id: string; safeClaim: string | null }[]) => createHash('sha256').update(JSON.stringify(evidence.map((e) => [e.id, e.safeClaim]).sort((a, b) => String(a[0]).localeCompare(String(b[0]))))).digest('hex');

export type CriterionResult = { criterionId: string; aiLevel: Level; evidenceIds: string[]; humanLevel: Level | null; reasonSafe: string; quote?: string; followUp?: string | null };

/** Deterministic pair computation. Fixture assessment inline; live AI results are applied by the worker. */
async function computePair(ctx: Ctx, role: typeof roles.$inferSelect, crit: Awaited<ReturnType<typeof criteriaFor>>, cand: typeof candidates.$inferSelect) {
  const evidence = await matchEvidence(ctx, cand.id, cand.latestProfileVersionId);
  const el = eligibilityOf(role, cand);
  const miniAt = (await miniMeUpdatedAt(ctx, [cand.id])).get(cand.id);
  // Reuse a live AI assessment while the profile and role versions are unchanged (cache key: profile, role, prompt, model).
  const [prev] = await ctx.tx.select().from(matches).where(and(eq(matches.roleId, role.id), eq(matches.candidateId, cand.id)));
  const validIds = new Set(evidence.map((e) => e.id));
  const prevResults = (prev?.criterionResults as CriterionResult[] | undefined) ?? [];
  const reuse = !!prev && prev.provider === 'anthropic' && prev.assessmentVersion === `${ASSESSMENT_VERSION}:${PROMPT_VERSION}:${cheapModel()}:${evidenceHash(evidence)}` && !prev.stale && prev.profileVersionId === cand.latestProfileVersionId && prev.roleVersion === role.roleVersion
    && !(miniAt && miniAt > prev.computedAt)
    && crit.every((c) => prevResults.some((r) => r.criterionId === c.id)) && prevResults.every((r) => r.evidenceIds.every((id) => validIds.has(id)));
  const assess = reuse
    ? { output: { criteria: prevResults.map((r) => ({ criterionId: r.criterionId, level: r.aiLevel, evidenceIds: r.evidenceIds, reasonSafe: r.reasonSafe, quote: r.quote ?? '', followUp: r.followUp ?? null })) } }
    : await fixtureProvider.assessCriteria({
        criteria: crit.map((c) => ({ criterionId: c.id, label: c.label, description: c.description, evidenceTags: c.evidenceTags })),
        evidence: evidence.map((e) => ({ id: e.id, safeClaim: e.safeClaim!, tags: e.tags, strength: e.strength, uncertainty: e.uncertainty })),
      });
  const awaitingAi = role.rubricApprovedVersion === role.roleVersion && !reuse && aiMode() === 'live' && el.eligibility !== 'incompatible' && evidence.length > 0;
  const [scr] = await ctx.tx.select().from(screenings).where(and(eq(screenings.roleId, role.id), eq(screenings.candidateId, cand.id), eq(screenings.status, 'completed')));
  const human = scr ? new Map((scr.criterionAssessments as { criterionId: string; level: Level }[]).map((a) => [a.criterionId, a.level])) : null;
  const ai = new Map(assess.output.criteria.map((c) => [c.criterionId, c.level as Level]));
  const adj = await latestAdjustment(ctx, role.id, cand.id);
  const weights = crit.map((c) => ({ criterionId: c.id, weight: c.weight }));
  const s = combinedScore({ criteria: weights, ai, human, adjustment: adj?.adjustment ?? 0 });
  const results: CriterionResult[] = assess.output.criteria.map((c) => ({ criterionId: c.criterionId, aiLevel: c.level as Level, evidenceIds: c.evidenceIds, humanLevel: human?.get(c.criterionId) ?? null, reasonSafe: c.reasonSafe, quote: c.quote, followUp: c.followUp ?? null }));
  const effective = new Map(ai);
  for (const [id, level] of human ?? []) if (level !== 'unknown') effective.set(id, level);
  const unknownLabels = crit.filter((c) => (effective.get(c.id) ?? 'unknown') === 'unknown').map((c) => c.label);
  const known = crit.filter((c) => ['specific', 'partial', 'clear', 'strong', 'related'].includes(effective.get(c.id) ?? 'unknown')).map((c) => c.label.toLowerCase());
  const rationale = known.length ? `Their examples relate to ${known.join(', ')}.${unknownLabels.length ? ` Not enough evidence yet for ${unknownLabels.join(', ').toLowerCase()}.` : ''}` : 'Not enough evidence yet for this role. A conversation could show more.';
  return { awaitingAi, row: {
    datasetId: ctx.datasetId, roleId: role.id, candidateId: cand.id, profileVersionId: cand.latestProfileVersionId!, roleVersion: role.roleVersion,
    eligibility: el.eligibility, incompatibilityReason: el.reason, score: !reuse && aiMode() === 'live' ? 0 : s.score, aiScore: s.aiScore, humanScore: s.humanScore, coverageBps: Math.round(s.coverage * 10000),
    confidence: confidenceFor(s.coverage), criterionResults: results, rationaleSafe: rationale, missingEvidence: unknownLabels, assessmentVersion: reuse ? `${ASSESSMENT_VERSION}:${PROMPT_VERSION}:${cheapModel()}:${evidenceHash(evidence)}` : null, provider: reuse ? ('anthropic' as const) : ('fixture' as const), stale: false, computedAt: new Date(),
  } };
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
  for (const { row } of rows) {
    await ctx.tx.insert(matches).values(row).onConflictDoUpdate({ target: [matches.roleId, matches.candidateId], set: { ...row, updatedAt: new Date() } });
  }
  if (rows.some((r) => r.awaitingAi)) await queueAssessment(ctx, roleId);
  // Everyone eligible for a live job is interviewed in the background, without anyone opening the job page.
  if (role.status === 'open') { const { requestSimulations } = await import('./simulation'); await requestSimulations(ctx, roleId); }
}

/** One deduplicated live-assessment job per role and minute. Only stale pairs are sent to the model. */
export async function queueAssessment(ctx: Ctx, roleId: string) {
  await enqueue(ctx, 'assess_match', roleId, `assess:${roleId}:${Math.floor(Date.now() / 60000)}`);
}

/** Targeted refresh: only this candidate's pairs across active roles. */
export async function recomputeCandidate(ctx: Ctx, candidateId: string) {
  const rs = await ctx.tx.select().from(roles).where(and(eq(roles.datasetId, ctx.datasetId), ne(roles.status, 'draft')));
  const [cand] = await ctx.tx.select().from(candidates).where(eq(candidates.id, candidateId));
  // Checked once for this candidate, then per client for blocks: no need to look at everyone else.
  const discoverable = !!cand && !!cand.latestProfileVersionId && (await discoveryState(ctx, candidateId)).discoverable;
  for (const role of rs) {
    const allowed = discoverable && !(await isBlockedForClient(ctx, candidateId, role.clientId));
    if (!cand || !allowed) {
      await ctx.tx.delete(matches).where(and(eq(matches.roleId, role.id), eq(matches.candidateId, candidateId)));
      continue;
    }
    const { row, awaitingAi } = await computePair(ctx, role, await criteriaFor(ctx, role.id), cand);
    await ctx.tx.insert(matches).values(row).onConflictDoUpdate({ target: [matches.roleId, matches.candidateId], set: { ...row, updatedAt: new Date() } });
    if (awaitingAi) await queueAssessment(ctx, role.id);
    // Newly eligible (e.g. they just signed up): interview them for this live job.
    if (role.status === 'open' && row.eligibility !== 'incompatible') { const { requestSimulations } = await import('./simulation'); await requestSimulations(ctx, role.id); }
  }
}

export async function recomputeAll(ctx: Ctx) {
  const rs = await ctx.tx.select({ id: roles.id }).from(roles).where(and(eq(roles.datasetId, ctx.datasetId), ne(roles.status, 'draft')));
  for (const r of rs) await recomputeRole(ctx, r.id);
}


/** Inputs for an AI assessment: criterion text and approved, anonymity-reviewed claims only. No names. */
export async function assessmentInput(ctx: Pick<Ctx, 'tx'>, roleId: string, candidateId: string) {
  const [cand] = await ctx.tx.select().from(candidates).where(eq(candidates.id, candidateId));
  const [role] = await ctx.tx.select().from(roles).where(eq(roles.id, roleId));
  if (!cand || !role || role.rubricApprovedVersion !== role.roleVersion) return null;
  const crit = await criteriaFor(ctx as Ctx, roleId);
  const evidence = await matchEvidence(ctx, candidateId, cand.latestProfileVersionId);
  return {
    evidenceFingerprint: evidenceHash(evidence),
    profileVersionId: cand.latestProfileVersionId,
    roleVersion: role.roleVersion,
    input: {
      criteria: crit.map((c) => ({ criterionId: c.id, label: c.label, description: c.description, evidenceTags: c.evidenceTags })),
      evidence: evidence.map((e) => ({ id: e.id, safeClaim: e.safeClaim!, tags: e.tags, strength: e.strength, uncertainty: e.uncertainty })),
    },
  };
}

/**
 * Validates and stores an AI assessment for one pair. Rejects foreign evidence, missing or
 * duplicate criteria, identifying reasons, and results computed for an older profile or role version.
 */
export async function applyAssessment(ctx: Ctx, args: { roleId: string; candidateId: string; profileVersionId: string | null; roleVersion: number; evidenceFingerprint?: string; output: AssessmentOutput }) {
  const [role] = await ctx.tx.select().from(roles).where(eq(roles.id, args.roleId)).for('update');
  const [cand] = await ctx.tx.select().from(candidates).where(eq(candidates.id, args.candidateId));
  if (!role || !cand || cand.status === 'deleting' || cand.status === 'deleted') return { applied: false, reason: 'unavailable' as const };
  if (role.rubricApprovedVersion !== role.roleVersion || cand.latestProfileVersionId !== args.profileVersionId || role.roleVersion !== args.roleVersion) return { applied: false, reason: 'stale_discarded' as const };
  const crit = await criteriaFor(ctx, args.roleId);
  const evidence = await matchEvidence(ctx, args.candidateId, cand.latestProfileVersionId);
  if (args.evidenceFingerprint && args.evidenceFingerprint !== evidenceHash(evidence)) return { applied: false, reason: 'stale_discarded' as const };
  const v = validateAssessment(args.output, crit.map((c) => c.id), evidence.map((e) => e.id), evidence);
  if (!v.ok) return { applied: false, reason: v.reason };
  const [idn] = await ctx.tx.select({ n: candidateIdentity.fullName, e: candidateIdentity.currentEmployerLabel }).from(candidateIdentity).where(eq(candidateIdentity.candidateId, args.candidateId));
  const orgNames = (await ctx.tx.select({ n: organisations.displayName }).from(organisations).where(eq(organisations.datasetId, ctx.datasetId))).map((o) => o.n);
  const forbidden = [...(idn ? [idn.n, ...idn.n.split(/\s+/).filter((x) => x.length >= 3)] : []), ...(idn?.e ? [idn.e] : []), ...orgNames];
  if (args.output.criteria.some((c) => safeClaimProblems(c.reasonSafe + ' ' + (c.followUp ?? ''), forbidden).length)) return { applied: false, reason: 'identifying_reason' as const };
  const [prev] = await ctx.tx.select().from(matches).where(and(eq(matches.roleId, args.roleId), eq(matches.candidateId, args.candidateId)));
  if (!prev) return { applied: false, reason: 'no_match' as const };
  const [scr] = await ctx.tx.select().from(screenings).where(and(eq(screenings.roleId, args.roleId), eq(screenings.candidateId, args.candidateId), eq(screenings.status, 'completed')));
  const human = scr ? new Map((scr.criterionAssessments as { criterionId: string; level: Level }[]).map((a) => [a.criterionId, a.level])) : null;
  const ai = new Map(args.output.criteria.map((c) => [c.criterionId, c.level as Level]));
  const adj = await latestAdjustment(ctx, args.roleId, args.candidateId);
  const s = combinedScore({ criteria: crit.map((c) => ({ criterionId: c.id, weight: c.weight })), ai, human, adjustment: adj?.adjustment ?? 0 });
  const results: CriterionResult[] = args.output.criteria.map((c) => ({ criterionId: c.criterionId, aiLevel: c.level as Level, evidenceIds: c.evidenceIds, humanLevel: human?.get(c.criterionId) ?? null, reasonSafe: c.reasonSafe, quote: c.quote, followUp: c.followUp ?? null }));
  const effective = new Map(ai);
  for (const [id, level] of human ?? []) if (level !== 'unknown') effective.set(id, level);
  const unknown = crit.filter((c) => (effective.get(c.id) ?? 'unknown') === 'unknown').map((c) => c.label);
  const known = crit.filter((c) => ['specific', 'partial', 'clear', 'strong', 'related'].includes(effective.get(c.id) ?? 'unknown')).map((c) => c.label.toLowerCase());
  await ctx.tx.update(matches).set({
    criterionResults: results, aiScore: s.aiScore, humanScore: s.humanScore, score: s.score, coverageBps: Math.round(s.coverage * 10000), confidence: confidenceFor(s.coverage),
    missingEvidence: unknown, rationaleSafe: known.length ? `Their examples relate to ${known.join(', ')}.${unknown.length ? ` Not enough evidence yet for ${unknown.join(', ').toLowerCase()}.` : ''}` : 'Not enough evidence yet for this role. A conversation could show more.',
    assessmentVersion: `${ASSESSMENT_VERSION}:${PROMPT_VERSION}:${cheapModel()}:${evidenceHash(evidence)}`, provider: 'anthropic', stale: false, computedAt: new Date(), updatedAt: new Date(),
  }).where(eq(matches.id, prev.id));
  return { applied: true as const, reason: null };
}

/** Pairs on a role that still need a live assessment. */
export async function pairsAwaitingAssessment(ctx: Pick<Ctx, 'tx'>, roleId: string) {
  const rows = await ctx.tx.select({ candidateId: matches.candidateId, provider: matches.provider, assessmentVersion: matches.assessmentVersion, stale: matches.stale, eligibility: matches.eligibility }).from(matches).where(eq(matches.roleId, roleId));
  return rows.filter((r) => (r.provider !== 'anthropic' || !r.assessmentVersion?.startsWith(`${ASSESSMENT_VERSION}:`) || r.stale) && r.eligibility !== 'incompatible').map((r) => r.candidateId);
}

