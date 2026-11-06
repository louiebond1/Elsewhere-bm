import { and, eq, inArray } from 'drizzle-orm';
import { screenings, matches, candidates, workLogs, files, consentEvents, evidenceItems, roles } from '../db/schema';
import { conflict, invalid, notFound } from '../lib/errors';
import { prototype } from '../../config/prototype';
import { autoPicks } from '../lib/matching-rules';
import { lockCandidates, requireUser, type Ctx } from './context';
import { roleForActor, roleCounters, criteriaFor } from './roles';
import { resolveRoleRef } from './intros';
import { discoveryState, isBlockedForClient } from '../policies/privacy';
import { logActivity, notify, clientUserIds, consultantUserIds } from './audit';
import { recomputeRole, validEvidenceForProfile } from './matching';
import { businessDate } from './contracts';
import { roleScopedRef } from '../dto/refs';
import { screeningCompleteInput } from './inputs';
import type { z } from 'zod';

async function slotsLeft(ctx: Ctx, roleId: string) {
  const c = await roleCounters(ctx, roleId);
  return prototype.includedScreenings - c.screeningsUsed;
}

async function insertScreening(ctx: Ctx, roleId: string, candidateId: string, mode: 'manual' | 'automatic') {
  const a = requireUser(ctx.actor);
  const [existing] = await ctx.tx.select().from(screenings).where(and(eq(screenings.roleId, roleId), eq(screenings.candidateId, candidateId))).for('update');
  if (existing && existing.status !== 'cancelled') throw conflict('SCREENING_EXISTS', 'A screening is already requested for this candidate.');
  if (existing) {
    const [u] = await ctx.tx.update(screenings).set({ status: 'requested', selectionMode: mode, requestedByUserId: a.userId, scheduledAt: null, updatedAt: new Date() }).where(eq(screenings.id, existing.id)).returning();
    return u;
  }
  const [s] = await ctx.tx.insert(screenings).values({ datasetId: ctx.datasetId, roleId, candidateId, requestedByUserId: a.userId, selectionMode: mode, status: 'requested' }).returning();
  return s;
}

async function assertScreenable(ctx: Ctx, role: typeof roles.$inferSelect, candidateId: string) {
  if (!(await discoveryState(ctx, candidateId)).discoverable || (await isBlockedForClient(ctx, candidateId, role.clientId))) throw notFound();
  const [m] = await ctx.tx.select().from(matches).where(and(eq(matches.roleId, role.id), eq(matches.candidateId, candidateId)));
  if (!m || m.eligibility === 'incompatible') throw notFound();
}

export async function requestScreening(ctx: Ctx, input: { roleId: string; candidateRef: string }) {
  const pre = await roleForActor(ctx, input.roleId);
  const candidateId = await resolveRoleRef(ctx, input.roleId, input.candidateRef);
  await lockCandidates(ctx.tx, [candidateId]);
  const role = await roleForActor(ctx, pre.id, { lock: true });
  if (role.status !== 'open') throw conflict('ROLE_NOT_OPEN', 'This role is not open.');
  await assertScreenable(ctx, role, candidateId);
  if ((await slotsLeft(ctx, role.id)) <= 0) throw conflict('INCLUDED_SCREENING_LIMIT', `This role has used its ${prototype.includedScreenings} included screenings. Further screening pricing is not agreed yet, so ask your consultant.`);
  const s = await insertScreening(ctx, role.id, candidateId, 'manual');
  await notify(ctx, await consultantUserIds(ctx), { type: 'screening_updated', subjectRefType: 'screening', subjectRefId: s.id, safeTitle: `Screening requested for ${role.title}` });
  await logActivity(ctx, { subjectType: 'screening', subjectId: s.id, action: 'screening.requested', clientId: role.clientId });
  return s;
}

export async function cancelScreening(ctx: Ctx, screeningId: string) {
  const a = requireUser(ctx.actor);
  const [s] = await ctx.tx.select().from(screenings).where(and(eq(screenings.id, screeningId), eq(screenings.datasetId, ctx.datasetId))).for('update');
  if (!s) throw notFound();
  await roleForActor(ctx, s.roleId);
  if (a.userType === 'candidate') throw notFound();
  if (s.status === 'completed') throw conflict('SCREENING_COMPLETED', 'A completed screening cannot be cancelled to reclaim a slot.');
  if (s.status === 'cancelled') return s;
  const [u] = await ctx.tx.update(screenings).set({ status: 'cancelled', updatedAt: new Date() }).where(eq(screenings.id, s.id)).returning();
  await logActivity(ctx, { subjectType: 'screening', subjectId: s.id, action: 'screening.cancelled' });
  return u;
}

async function autoPickCandidates(ctx: Ctx, roleId: string) {
  const role = await roleForActor(ctx, roleId);
  const left = await slotsLeft(ctx, roleId);
  const ms = await ctx.tx.select().from(matches).where(eq(matches.roleId, roleId));
  const existing = await ctx.tx.select({ c: screenings.candidateId, s: screenings.status }).from(screenings).where(eq(screenings.roleId, roleId));
  const taken = new Set(existing.filter((e) => e.s !== 'cancelled').map((e) => e.c));
  const crit = await criteriaFor(ctx, roleId);
  const roleTags = new Set(crit.flatMap((c) => c.evidenceTags));
  const pool = [];
  for (const m of ms) {
    if (m.eligibility === 'incompatible' || taken.has(m.candidateId)) continue;
    if (!(await discoveryState(ctx, m.candidateId)).discoverable || (await isBlockedForClient(ctx, m.candidateId, role.clientId))) continue;
    const [c] = await ctx.tx.select({ ref: candidates.publicRef, pv: candidates.latestProfileVersionId }).from(candidates).where(eq(candidates.id, m.candidateId));
    const ev = await validEvidenceForProfile(ctx, m.candidateId, c.pv);
    pool.push({ id: m.candidateId, eligibility: m.eligibility, score: m.score, coverageBps: m.coverageBps, publicRef: c.ref, confidence: m.confidence, hasRelevantTag: ev.some((e) => e.tags.some((t) => roleTags.has(t))) });
  }
  return { role, left, picks: autoPicks(pool, left), poolSize: pool.length };
}

export async function previewAutoPicks(ctx: Ctx, roleId: string) {
  const { role, left, picks } = await autoPickCandidates(ctx, roleId);
  return { slotsLeft: left, picks: picks.map((p) => ({ ref: roleScopedRef(role.id, p.id), confidence: p.confidence, discoverySlot: p.confidence === 'low' || p.eligibility === 'needs_clarification' })), shortfall: Math.max(0, left - picks.length) };
}

export async function confirmAutoPicks(ctx: Ctx, roleId: string, refs: string[]) {
  const pre = await roleForActor(ctx, roleId);
  const ids = [];
  for (const r of refs) ids.push(await resolveRoleRef(ctx, roleId, r));
  await lockCandidates(ctx.tx, ids);
  const role = await roleForActor(ctx, pre.id, { lock: true });
  if (role.status !== 'open') throw conflict('ROLE_NOT_OPEN', 'This role is not open.');
  if (ids.length > (await slotsLeft(ctx, roleId))) throw conflict('INCLUDED_SCREENING_LIMIT', 'Not enough included screenings remain for this selection.');
  const out = [];
  for (const id of ids) {
    await assertScreenable(ctx, role, id);
    out.push(await insertScreening(ctx, roleId, id, 'automatic'));
  }
  await notify(ctx, await consultantUserIds(ctx), { type: 'screening_updated', subjectRefType: 'role', subjectRefId: roleId, safeTitle: `${out.length} screenings requested for ${role.title}` });
  await logActivity(ctx, { subjectType: 'role', subjectId: roleId, action: 'screening.auto_confirmed', clientId: role.clientId, metadata: { count: out.length } });
  return out;
}

async function screeningForConsultant(ctx: Ctx, id: string, lock = false) {
  requireUser(ctx.actor, 'consultant');
  const q = ctx.tx.select().from(screenings).where(and(eq(screenings.id, id), eq(screenings.datasetId, ctx.datasetId)));
  const [s] = lock ? await q.for('update') : await q;
  if (!s) throw notFound();
  return s;
}

export async function scheduleScreening(ctx: Ctx, id: string, scheduledAt: Date) {
  const a = requireUser(ctx.actor, 'consultant');
  const s = await screeningForConsultant(ctx, id, true);
  if (!['requested', 'scheduled'].includes(s.status)) throw conflict('SCREENING_NOT_OPEN', 'This screening cannot be scheduled.');
  const [u] = await ctx.tx.update(screenings).set({ status: 'scheduled', scheduledAt, consultantUserId: a.userId, updatedAt: new Date() }).where(eq(screenings.id, id)).returning();
  await logActivity(ctx, { subjectType: 'screening', subjectId: id, action: 'screening.scheduled' });
  return u;
}

export async function recordRecordingConsent(ctx: Ctx, id: string) {
  const a = requireUser(ctx.actor, 'consultant');
  const s = await screeningForConsultant(ctx, id, true);
  await ctx.tx.update(screenings).set({ recordingConsentAt: ctx.now, updatedAt: new Date() }).where(eq(screenings.id, id));
  await ctx.tx.insert(consentEvents).values({ datasetId: ctx.datasetId, candidateId: s.candidateId, kind: 'screening_recording', granted: true, termsVersion: 'recording-v1', actorUserId: a.userId, relatedScreeningId: id, eventAt: ctx.now });
}

export async function completeScreening(ctx: Ctx, id: string, raw: z.infer<typeof screeningCompleteInput>) {
  const a = requireUser(ctx.actor, 'consultant');
  const input = screeningCompleteInput.parse(raw);
  const s = await screeningForConsultant(ctx, id, true);
  if (!['requested', 'scheduled'].includes(s.status)) throw conflict('SCREENING_NOT_OPEN', 'This screening is not open.');
  const crit = await criteriaFor(ctx, s.roleId);
  const ids = new Set(input.assessments.map((x) => x.criterionId));
  if (crit.some((c) => !ids.has(c.id)) || ids.size !== crit.length) throw invalid('Record an observation or Unknown for every criterion.', { assessments: 'Every criterion needs an observation or Unknown' });
  const own = await ctx.tx.select({ id: evidenceItems.id }).from(evidenceItems).where(eq(evidenceItems.candidateId, s.candidateId));
  const ownIds = new Set(own.map((o) => o.id));
  if (input.assessments.some((x) => x.evidenceIds.some((e) => !ownIds.has(e)))) throw invalid('Evidence must belong to this candidate.');
  const [role] = await ctx.tx.select().from(roles).where(eq(roles.id, s.roleId));
  const [u] = await ctx.tx.update(screenings).set({ status: 'completed', completedAt: ctx.now, consultantUserId: a.userId, notesPrivate: input.notesPrivate, summarySafe: input.summarySafe, criterionAssessments: input.assessments, updatedAt: new Date() }).where(eq(screenings.id, id)).returning();
  await ctx.tx.insert(workLogs).values({ datasetId: ctx.datasetId, consultantUserId: a.userId, clientId: role.clientId, roleId: role.id, screeningId: id, category: 'screening', minutes: input.minutes, workDate: businessDate(ctx), note: 'Screening call' });
  await recomputeRole(ctx, role.id);
  await notify(ctx, await clientUserIds(ctx, role.clientId), { type: 'screening_updated', subjectRefType: 'role', subjectRefId: role.id, safeTitle: `A screening was completed for ${role.title}` });
  await logActivity(ctx, { subjectType: 'screening', subjectId: id, action: 'screening.completed', clientId: role.clientId, metadata: { minutes: input.minutes } });
  return u;
}

export async function screeningRecordings(ctx: Ctx, screeningId: string) {
  requireUser(ctx.actor, 'consultant');
  return ctx.tx.select({ id: files.id, bytes: files.bytes, mimeType: files.mimeType, createdAt: files.createdAt, state: files.uploadState }).from(files).where(and(eq(files.screeningId, screeningId), eq(files.purpose, 'screening_recording'), inArray(files.uploadState, ['ready', 'uploaded'])));
}
