import { and, eq, inArray, ne, sql } from 'drizzle-orm';
import * as argon2 from 'argon2';
import { users, candidates, candidateIdentity, consentEvents, candidateBlocks, organisations, organisationAliases, evidenceItems, introductions, identityGrants, sessions, screenings, matches, pipelineEntries, checkInAnswers, conversations, files, profileVersions, aiRuns, jobs, hires } from '../db/schema';
import { AppError, conflict, invalid, notFound } from '../lib/errors';
import { lockCandidates, requireUser, type Ctx } from './context';
import { logActivity, notify, consultantUserIds } from './audit';
import { rebuildProfile } from './profiles';
import { recomputeCandidate } from './matching';
import { releaseHoldIfUnneeded } from './roles';
import { enqueue } from './jobs';
import { safeClaimProblems } from '../ai/validate';
import { signupInput, preferencesInput, employerInput, evidenceReviseInput } from './inputs';
import { storage } from './storage';

export const TERMS_VERSION = 'prototype-terms-v1';

export function candidateIdOf(ctx: Ctx) {
  const a = requireUser(ctx.actor, 'candidate');
  if (!a.candidateId) throw notFound();
  return a.candidateId;
}

export async function signupCandidate(ctx: Ctx, raw: unknown) {
  const input = signupInput.parse(raw);
  const email = input.email.trim().toLowerCase();
  const [dup] = await ctx.tx.select({ id: users.id }).from(users).where(and(eq(users.datasetId, ctx.datasetId), eq(users.emailNormalized, email)));
  if (dup) throw conflict('EMAIL_IN_USE', 'Those details could not be used. Try a different fictional email address.');
  const [{ n }] = (await ctx.tx.execute(sql`select count(*)::int as n from candidates where dataset_id = ${ctx.datasetId}`)).rows as { n: number }[];
  const [user] = await ctx.tx.insert(users).values({ datasetId: ctx.datasetId, emailNormalized: email, passwordHash: await argon2.hash(input.password, { type: argon2.argon2id }), userType: 'candidate', displayName: null }).returning();
  const [cand] = await ctx.tx.insert(candidates).values({
    datasetId: ctx.datasetId, userId: user.id, publicRef: `CAND-${String(n + 1).padStart(3, '0')}`, status: 'onboarding', discoveryEnabled: false, employerResolutionStatus: 'not_supplied',
    preferredRoleFamilies: input.roleFamilies, region: input.region, workModes: input.workModes, minSalaryPence: input.minSalaryPounds ? BigInt(input.minSalaryPounds) * 100n : null, noticeWeeks: input.noticeWeeks, workAuthorisation: 'unknown',
  }).returning();
  await ctx.tx.insert(candidateIdentity).values({ datasetId: ctx.datasetId, candidateId: cand.id, fullName: input.fullName, email });
  const consent = (kind: 'terms' | 'ai_processing' | 'discovery' | 'aggregate_insights', granted: boolean) => ({ datasetId: ctx.datasetId, candidateId: cand.id, kind, granted, termsVersion: TERMS_VERSION, actorUserId: user.id, eventAt: ctx.now });
  await ctx.tx.insert(consentEvents).values([consent('terms', true), consent('ai_processing', true), consent('discovery', input.wantsDiscovery), consent('aggregate_insights', input.aggregateInsights)]);
  await logActivity(ctx, { subjectType: 'candidate', subjectId: cand.id, action: 'candidate.signed_up' });
  return { user, candidate: cand, wantsDiscovery: input.wantsDiscovery };
}

export async function updatePreferences(ctx: Ctx, raw: unknown) {
  const id = candidateIdOf(ctx);
  const input = preferencesInput.parse(raw);
  await lockCandidates(ctx.tx, [id]);
  await ctx.tx.update(candidates).set({ region: input.region, workModes: input.workModes, preferredRoleFamilies: input.roleFamilies, minSalaryPence: input.minSalaryPounds ? BigInt(input.minSalaryPounds) * 100n : null, noticeWeeks: input.noticeWeeks, workAuthorisation: input.workAuthorisation, experienceBand: input.experienceBand, updatedAt: new Date() }).where(eq(candidates.id, id));
  await recomputeCandidate(ctx, id);
  await logActivity(ctx, { subjectType: 'candidate', subjectId: id, action: 'candidate.preferences_updated' });
}

/** Cancels pending requests for a candidate, optionally limited to some clients, releasing unused holds. */
async function cancelPendingFor(ctx: Ctx, candidateId: string, clientIds?: string[]) {
  const pend = await ctx.tx.select().from(introductions).where(and(eq(introductions.candidateId, candidateId), eq(introductions.state, 'pending')));
  const targets = clientIds ? pend.filter((p) => clientIds.includes(p.clientId)) : pend;
  for (const p of targets) {
    await ctx.tx.update(introductions).set({ state: 'cancelled', respondedAt: ctx.now, updatedAt: new Date() }).where(eq(introductions.id, p.id));
    await releaseHoldIfUnneeded(ctx, p.roleId);
  }
  return targets.length;
}

export async function setDiscovery(ctx: Ctx, enabled: boolean) {
  const id = candidateIdOf(ctx);
  const a = requireUser(ctx.actor);
  await lockCandidates(ctx.tx, [id]);
  const [cand] = await ctx.tx.select().from(candidates).where(eq(candidates.id, id));
  let cancelled = 0;
  const status = enabled ? (cand.status === 'paused' ? 'active' : cand.status) : cand.status === 'active' ? 'paused' : cand.status;
  await ctx.tx.update(candidates).set({ discoveryEnabled: enabled, status, updatedAt: new Date() }).where(eq(candidates.id, id));
  await ctx.tx.insert(consentEvents).values({ datasetId: ctx.datasetId, candidateId: id, kind: 'discovery', granted: enabled, termsVersion: TERMS_VERSION, actorUserId: a.userId, eventAt: ctx.now });
  if (!enabled) cancelled = await cancelPendingFor(ctx, id);
  await recomputeCandidate(ctx, id);
  await logActivity(ctx, { subjectType: 'candidate', subjectId: id, action: enabled ? 'candidate.discovery_on' : 'candidate.discovery_off' });
  return { cancelledPending: cancelled };
}

export async function setAggregateInsights(ctx: Ctx, granted: boolean) {
  const id = candidateIdOf(ctx);
  const a = requireUser(ctx.actor);
  await ctx.tx.insert(consentEvents).values({ datasetId: ctx.datasetId, candidateId: id, kind: 'aggregate_insights', granted, termsVersion: TERMS_VERSION, actorUserId: a.userId, eventAt: ctx.now });
}

const normAlias = (s: string) => s.trim().toLowerCase().replace(/^https?:\/\//, '').replace(/^www\./, '').replace(/\/+$/, '');

/** Employer selection. Exact canonical alias matches resolve; anything else pauses discovery for consultant review. */
export async function setCurrentEmployer(ctx: Ctx, raw: unknown) {
  const id = candidateIdOf(ctx);
  const a = requireUser(ctx.actor);
  const input = employerInput.parse(raw);
  await lockCandidates(ctx.tx, [id]);
  let orgId: string | null = null;
  let status: 'resolved' | 'unresolved' | 'not_employed' = 'not_employed';
  let label: string | null = null;
  if (input.mode === 'organisation') {
    const [o] = await ctx.tx.select().from(organisations).where(and(eq(organisations.id, input.organisationId), eq(organisations.datasetId, ctx.datasetId)));
    if (!o) throw notFound();
    orgId = o.id; status = 'resolved'; label = o.displayName;
  } else if (input.mode === 'typed') {
    const [al] = await ctx.tx.select().from(organisationAliases).where(and(eq(organisationAliases.datasetId, ctx.datasetId), eq(organisationAliases.aliasNormalized, normAlias(input.label))));
    if (al) { orgId = al.organisationId; status = 'resolved'; } else { status = 'unresolved'; }
    label = input.label;
  }
  await ctx.tx.update(candidates).set({ currentOrganisationId: orgId, employerResolutionStatus: status, updatedAt: new Date() }).where(eq(candidates.id, id));
  await ctx.tx.update(candidateIdentity).set({ currentEmployerLabel: label, updatedAt: new Date() }).where(eq(candidateIdentity.candidateId, id));
  await ctx.tx.delete(candidateBlocks).where(and(eq(candidateBlocks.candidateId, id), eq(candidateBlocks.reason, 'current_employer')));
  if (orgId) await addBlockInternal(ctx, id, orgId, 'current_employer', a.userId);
  if (status === 'unresolved') await notify(ctx, await consultantUserIds(ctx), { type: 'system', subjectRefType: 'candidate', subjectRefId: id, safeTitle: 'A candidate employer needs confirmation' });
  await recomputeCandidate(ctx, id);
  await logActivity(ctx, { subjectType: 'candidate', subjectId: id, action: 'candidate.employer_set', metadata: { resolution: status } });
  return { status };
}

/** Consultants resolve organisation identity; only the candidate controls hiding. */
export async function resolveEmployer(ctx: Ctx, candidateId: string, organisationId: string) {
  requireUser(ctx.actor, 'consultant');
  await lockCandidates(ctx.tx, [candidateId]);
  const [c] = await ctx.tx.select().from(candidates).where(and(eq(candidates.id, candidateId), eq(candidates.datasetId, ctx.datasetId)));
  if (!c) throw notFound();
  await ctx.tx.update(candidates).set({ currentOrganisationId: organisationId, employerResolutionStatus: 'resolved', updatedAt: new Date() }).where(eq(candidates.id, candidateId));
  await ctx.tx.delete(candidateBlocks).where(and(eq(candidateBlocks.candidateId, candidateId), eq(candidateBlocks.reason, 'current_employer')));
  await addBlockInternal(ctx, candidateId, organisationId, 'current_employer', c.userId);
  await recomputeCandidate(ctx, candidateId);
}

async function addBlockInternal(ctx: Ctx, candidateId: string, organisationId: string, reason: 'current_employer' | 'candidate_choice', by: string) {
  await ctx.tx.insert(candidateBlocks).values({ datasetId: ctx.datasetId, candidateId, organisationId, includeGroup: true, reason, createdByUserId: by }).onConflictDoNothing();
  // Stronger than discovery-off: cancel pending, revoke grants and remove views for the blocked group now.
  const { clients } = await import('../db/schema');
  const all = await ctx.tx.select({ id: clients.id }).from(clients).where(eq(clients.datasetId, ctx.datasetId));
  const { isBlockedForClient } = await import('../policies/privacy');
  const blocked: string[] = [];
  for (const cl of all) if (await isBlockedForClient(ctx, candidateId, cl.id)) blocked.push(cl.id);
  if (blocked.length) {
    await cancelPendingFor(ctx, candidateId, blocked);
    await ctx.tx.update(identityGrants).set({ revokedAt: ctx.now, revocationReason: 'employer_block', updatedAt: new Date() }).where(and(eq(identityGrants.candidateId, candidateId), inArray(identityGrants.clientId, blocked), sql`revoked_at is null`));
    await ctx.tx.delete(matches).where(and(eq(matches.candidateId, candidateId), inArray(matches.roleId, sql`(select id from roles where client_id in (${sql.join(blocked.map((b) => sql`${b}::uuid`), sql`, `)}))`)));
  }
}

export async function addBlock(ctx: Ctx, organisationId: string) {
  const id = candidateIdOf(ctx);
  const a = requireUser(ctx.actor);
  await lockCandidates(ctx.tx, [id]);
  const [o] = await ctx.tx.select().from(organisations).where(and(eq(organisations.id, organisationId), eq(organisations.datasetId, ctx.datasetId)));
  if (!o) throw notFound();
  await addBlockInternal(ctx, id, organisationId, 'candidate_choice', a.userId);
  await logActivity(ctx, { subjectType: 'candidate', subjectId: id, action: 'candidate.block_added' });
}

export async function removeBlock(ctx: Ctx, organisationId: string) {
  const id = candidateIdOf(ctx);
  await lockCandidates(ctx.tx, [id]);
  await ctx.tx.delete(candidateBlocks).where(and(eq(candidateBlocks.candidateId, id), eq(candidateBlocks.organisationId, organisationId), eq(candidateBlocks.reason, 'candidate_choice')));
  await recomputeCandidate(ctx, id);
}

async function forbiddenStrings(ctx: Ctx, candidateId: string) {
  const [idn] = await ctx.tx.select().from(candidateIdentity).where(eq(candidateIdentity.candidateId, candidateId));
  const out: string[] = [];
  if (idn) {
    out.push(idn.fullName, ...idn.fullName.split(/\s+/).filter((p) => p.length >= 3), idn.email);
    if (idn.currentEmployerLabel) out.push(idn.currentEmployerLabel);
  }
  const orgs = await ctx.tx.select({ n: organisations.displayName, l: organisations.legalName }).from(organisations).where(eq(organisations.datasetId, ctx.datasetId));
  for (const o of orgs) out.push(o.n, o.l);
  return out;
}

export async function evidenceForCandidate(ctx: Ctx, candidateId: string, evidenceId: string) {
  const [e] = await ctx.tx.select().from(evidenceItems).where(and(eq(evidenceItems.id, evidenceId), eq(evidenceItems.candidateId, candidateId))).for('update');
  if (!e) throw notFound();
  return e;
}

/** Candidate approves draft items for matching. Each needs a client-safe claim and at least one tag. */
export async function approveEvidence(ctx: Ctx, evidenceIds: string[]) {
  const id = candidateIdOf(ctx);
  const a = requireUser(ctx.actor);
  await lockCandidates(ctx.tx, [id]);
  const forbidden = await forbiddenStrings(ctx, id);
  for (const eid of evidenceIds) {
    const e = await evidenceForCandidate(ctx, id, eid);
    if (e.reviewState !== 'draft') continue;
    if (!e.safeClaim || !e.tags.length) throw invalid('Add a client-safe summary and at least one skill tag before approving.', { [eid]: 'Edit this item first' });
    const problems = safeClaimProblems(e.safeClaim, forbidden);
    if (problems.length) throw invalid(`The client-safe summary needs changing: ${problems.join('; ')}.`, { [eid]: problems.join('; ') });
    await ctx.tx.update(evidenceItems).set({ reviewState: 'candidate_approved', approvedByUserId: a.userId, approvedAt: ctx.now, updatedAt: new Date() }).where(eq(evidenceItems.id, eid));
  }
  await notify(ctx, await consultantUserIds(ctx), { type: 'profile_ready', subjectRefType: 'candidate', subjectRefId: id, safeTitle: 'Candidate evidence ready for anonymity review' });
  await rebuildProfile(ctx, id);
  await logActivity(ctx, { subjectType: 'candidate', subjectId: id, action: 'evidence.approved', metadata: { count: evidenceIds.length } });
}

/** Editing creates a new revision; the old one is superseded and stops appearing to clients immediately. */
export async function reviseEvidence(ctx: Ctx, raw: unknown) {
  const id = candidateIdOf(ctx);
  const a = requireUser(ctx.actor);
  const input = evidenceReviseInput.parse(raw);
  await lockCandidates(ctx.tx, [id]);
  const old = await evidenceForCandidate(ctx, id, input.evidenceId);
  if (old.reviewState === 'superseded' || old.reviewState === 'rejected') throw conflict('EVIDENCE_NOT_CURRENT', 'This evidence item is no longer current.');
  const problems = safeClaimProblems(input.safeClaim, await forbiddenStrings(ctx, id));
  if (problems.length) throw invalid(`The client-safe summary needs changing: ${problems.join('; ')}.`, { safeClaim: problems.join('; ') });
  await ctx.tx.update(evidenceItems).set({ reviewState: 'superseded', updatedAt: new Date() }).where(eq(evidenceItems.id, old.id));
  const [n] = await ctx.tx.insert(evidenceItems).values({
    datasetId: ctx.datasetId, candidateId: id, sourceKind: 'candidate_edit', sourceQuotePrivate: input.claim, claimPrivate: input.claim, safeClaim: input.safeClaim, tags: input.tags, outcomeText: old.outcomeText, uncertainty: input.uncertainty,
    strength: old.strength === 'specific' ? 'partial' : old.strength, reviewState: 'candidate_approved', anonymityReview: 'pending', approvedByUserId: a.userId, approvedAt: ctx.now, supersedesId: old.id, provider: old.provider,
  }).returning();
  await ctx.tx.update(matches).set({ stale: true }).where(eq(matches.candidateId, id));
  await rebuildProfile(ctx, id);
  await notify(ctx, await consultantUserIds(ctx), { type: 'profile_ready', subjectRefType: 'candidate', subjectRefId: id, safeTitle: 'Edited candidate evidence needs anonymity review' });
  await logActivity(ctx, { subjectType: 'evidence', subjectId: n.id, action: 'evidence.revised' });
  return n;
}

export async function withdrawEvidence(ctx: Ctx, evidenceId: string) {
  const id = candidateIdOf(ctx);
  await lockCandidates(ctx.tx, [id]);
  await evidenceForCandidate(ctx, id, evidenceId);
  await ctx.tx.update(evidenceItems).set({ reviewState: 'rejected', updatedAt: new Date() }).where(eq(evidenceItems.id, evidenceId));
  await rebuildProfile(ctx, id);
  await logActivity(ctx, { subjectType: 'evidence', subjectId: evidenceId, action: 'evidence.withdrawn' });
}

/** Consultant anonymity review of a candidate-approved safe claim. */
export async function anonymityReview(ctx: Ctx, evidenceId: string, decision: 'approved' | 'rejected', safeClaimEdit?: string) {
  requireUser(ctx.actor, 'consultant');
  const [e] = await ctx.tx.select().from(evidenceItems).where(and(eq(evidenceItems.id, evidenceId), eq(evidenceItems.datasetId, ctx.datasetId)));
  if (!e) throw notFound();
  await lockCandidates(ctx.tx, [e.candidateId]);
  const claim = safeClaimEdit?.trim() || e.safeClaim;
  if (decision === 'approved') {
    if (!claim) throw invalid('There is no client-safe summary to approve.');
    const problems = safeClaimProblems(claim, await forbiddenStrings(ctx, e.candidateId));
    if (problems.length) throw invalid(`Remove identifying detail first: ${problems.join('; ')}.`);
  }
  await ctx.tx.update(evidenceItems).set({ anonymityReview: decision, safeClaim: claim, updatedAt: new Date() }).where(eq(evidenceItems.id, evidenceId));
  await rebuildProfile(ctx, e.candidateId);
  const [c] = await ctx.tx.select().from(candidates).where(eq(candidates.id, e.candidateId));
  if (decision === 'approved' && c.status === 'onboarding' && c.latestProfileVersionId) {
    const [consent] = (await ctx.tx.execute(sql`select granted from consent_events where candidate_id = ${c.id} and kind = 'discovery' order by event_at desc, created_at desc limit 1`)).rows as { granted: boolean }[];
    await ctx.tx.update(candidates).set({ status: 'active', discoveryEnabled: !!consent?.granted, updatedAt: new Date() }).where(eq(candidates.id, c.id));
    await recomputeCandidate(ctx, c.id);
  }
  await notify(ctx, [c.userId], { type: 'profile_ready', subjectRefType: 'candidate', subjectRefId: c.id, safeTitle: decision === 'approved' ? 'Part of your profile was approved for matching' : 'An evidence item needs changes before employers can see it' });
  await logActivity(ctx, { subjectType: 'evidence', subjectId: evidenceId, action: `evidence.anonymity_${decision}` });
}

/**
 * Deletion: immediate revocation in one transaction, then a worker purges private content.
 * Financial records keep only opaque references.
 */
export async function requestDeletion(ctx: Ctx, password: string, confirmText: string) {
  const id = candidateIdOf(ctx);
  const a = requireUser(ctx.actor);
  if (confirmText !== 'DELETE') throw invalid('Type DELETE to confirm.', { confirm: 'Type DELETE' });
  const [u] = await ctx.tx.select().from(users).where(eq(users.id, a.userId));
  if (!u || !(await argon2.verify(u.passwordHash, password).catch(() => false))) throw new AppError('BAD_PASSWORD', 400, 'Your current password is needed to delete your profile.', { password: 'Password did not match' });
  await lockCandidates(ctx.tx, [id]);
  await ctx.tx.update(candidates).set({ status: 'deleting', discoveryEnabled: false, deletedAt: ctx.now, updatedAt: new Date() }).where(eq(candidates.id, id));
  await cancelPendingFor(ctx, id);
  const accepted = await ctx.tx.select().from(introductions).where(and(eq(introductions.candidateId, id), eq(introductions.state, 'accepted')));
  for (const i of accepted) {
    await ctx.tx.update(introductions).set({ state: 'withdrawn', withdrawnAt: ctx.now, updatedAt: new Date() }).where(eq(introductions.id, i.id));
    await ctx.tx.update(pipelineEntries).set({ stage: 'withdrawn', updatedAt: new Date() }).where(eq(pipelineEntries.introductionId, i.id));
  }
  await ctx.tx.update(identityGrants).set({ revokedAt: ctx.now, revocationReason: 'deletion', updatedAt: new Date() }).where(and(eq(identityGrants.candidateId, id), sql`revoked_at is null`));
  await ctx.tx.update(screenings).set({ status: 'cancelled', updatedAt: new Date() }).where(and(eq(screenings.candidateId, id), inArray(screenings.status, ['requested', 'scheduled'])));
  await ctx.tx.delete(matches).where(eq(matches.candidateId, id));
  await ctx.tx.update(jobs).set({ status: 'cancelled', updatedAt: new Date() }).where(and(eq(jobs.subjectId, id), inArray(jobs.status, ['queued'])));
  await ctx.tx.update(sessions).set({ revokedAt: new Date() }).where(eq(sessions.userId, a.userId));
  const job = await enqueue(ctx, 'delete_candidate', id, `delete:${id}`);
  await logActivity(ctx, { subjectType: 'candidate', subjectId: id, action: 'candidate.deletion_requested' });
  return { jobId: job.id };
}

/** Worker step. Removes private content and object bytes; keeps an opaque tombstone for finance. */
export async function purgeCandidate(ctx: Ctx, candidateId: string) {
  const [c] = await ctx.tx.select().from(candidates).where(eq(candidates.id, candidateId));
  if (!c || (c.status !== 'deleting' && c.status !== 'deleted')) return { done: true };
  const fl = await ctx.tx.select().from(files).where(eq(files.candidateId, candidateId));
  const scr = await ctx.tx.select({ id: screenings.id }).from(screenings).where(eq(screenings.candidateId, candidateId));
  const recs = scr.length ? await ctx.tx.select().from(files).where(inArray(files.screeningId, scr.map((s) => s.id))) : [];
  for (const f of [...fl, ...recs]) {
    if (f.uploadState === 'deleted') continue;
    await storage().delete(f.objectKey); // throws on failure so the job retries; completion is never claimed early
    await ctx.tx.update(files).set({ uploadState: 'deleted', extractedTextPrivate: null, originalFilename: 'deleted', deletedAt: new Date(), candidateId: null, updatedAt: new Date() }).where(eq(files.id, f.id));
  }
  if (scr.length) await ctx.tx.update(screenings).set({ notesPrivate: null, summarySafe: null, criterionAssessments: [] }).where(inArray(screenings.id, scr.map((s) => s.id)));
  await ctx.tx.delete(evidenceItems).where(eq(evidenceItems.candidateId, candidateId));
  await ctx.tx.update(candidates).set({ latestProfileVersionId: null }).where(eq(candidates.id, candidateId));
  await ctx.tx.delete(profileVersions).where(eq(profileVersions.candidateId, candidateId));
  await ctx.tx.delete(checkInAnswers).where(eq(checkInAnswers.candidateId, candidateId));
  await ctx.tx.delete(conversations).where(eq(conversations.candidateId, candidateId));
  await ctx.tx.delete(candidateIdentity).where(eq(candidateIdentity.candidateId, candidateId));
  await ctx.tx.delete(candidateBlocks).where(eq(candidateBlocks.candidateId, candidateId));
  await ctx.tx.update(introductions).set({ messageToCandidate: '' }).where(eq(introductions.candidateId, candidateId));
  await ctx.tx.update(aiRuns).set({ candidateId: null, inputHash: null }).where(eq(aiRuns.candidateId, candidateId));
  await ctx.tx.update(hires).set({ candidateId: null }).where(eq(hires.candidateId, candidateId));
  await ctx.tx.update(users).set({ emailNormalized: `deleted+${c.userId}@tombstone.invalid`, passwordHash: 'deleted', status: 'deleted', displayName: null }).where(eq(users.id, c.userId));
  await ctx.tx.update(candidates).set({ status: 'deleted', preferredRoleFamilies: [], workModes: [], minSalaryPence: null, noticeWeeks: null, currentOrganisationId: null, updatedAt: new Date() }).where(eq(candidates.id, candidateId));
  await logActivity(ctx, { subjectType: 'candidate', subjectId: candidateId, action: 'candidate.deleted' });
  return { done: true };
}

export async function candidateSelf(ctx: Ctx) {
  const id = candidateIdOf(ctx);
  const [c] = await ctx.tx.select().from(candidates).where(eq(candidates.id, id));
  const [idn] = await ctx.tx.select().from(candidateIdentity).where(eq(candidateIdentity.candidateId, id));
  const ev = await ctx.tx.select().from(evidenceItems).where(and(eq(evidenceItems.candidateId, id), ne(evidenceItems.reviewState, 'superseded')));
  const [pv] = c.latestProfileVersionId ? await ctx.tx.select().from(profileVersions).where(eq(profileVersions.id, c.latestProfileVersionId)) : [];
  return { candidate: c, identity: idn ?? null, evidence: ev, profile: pv ?? null };
}
