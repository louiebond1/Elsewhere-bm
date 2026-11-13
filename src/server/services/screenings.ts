import { and, eq, inArray } from 'drizzle-orm';
import { screenings, matches, candidates, workLogs, files, consentEvents, evidenceItems, roles } from '../db/schema';
import { conflict, invalid, notFound } from '../lib/errors';
import { prototype } from '../../config/prototype';
import { assessmentReady, autoPicksDetailed } from '../lib/matching-rules';
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
  if (existing && !['cancelled','declined','expired'].includes(existing.status)) throw conflict('SCREENING_EXISTS', 'A screening is already requested for this candidate.');
  if (existing) {
    const [u] = await ctx.tx.update(screenings).set({ status: 'invited', invitedAt:new Date(), inviteExpiresAt:new Date(Date.now()+48*3600000), respondedAt:null, outcome:null, selectionMode: mode, requestedByUserId: a.userId, scheduledAt: null, updatedAt: new Date() }).where(eq(screenings.id, existing.id)).returning();
    return u;
  }
  const [s] = await ctx.tx.insert(screenings).values({ datasetId: ctx.datasetId, roleId, candidateId, requestedByUserId: a.userId, selectionMode: mode, status: 'invited', invitedAt:new Date(), inviteExpiresAt:new Date(Date.now()+48*3600000) }).returning();
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
  const openInvites=await ctx.tx.select().from(screenings).where(and(eq(screenings.roleId,role.id),eq(screenings.status,'invited')));
  if ((await slotsLeft(ctx, role.id))-openInvites.filter(x=>x.inviteExpiresAt&&x.inviteExpiresAt>new Date()).length <= 0) throw conflict('INCLUDED_SCREENING_LIMIT', `This role has used its ${prototype.includedScreenings} included screenings. Further screening pricing is not agreed yet, so ask your consultant.`);
  const {ensureLegacyPublication,assertPublishedCandidate}=await import('./shortlists');await ensureLegacyPublication(ctx,role.id);await assertPublishedCandidate(ctx,role.id,candidateId,true);
  const s = await insertScreening(ctx, role.id, candidateId, 'manual');
  const [candidate]=await ctx.tx.select().from(candidates).where(eq(candidates.id,candidateId));if(candidate?.userId)await notify(ctx,[candidate.userId],{type:'screening_updated',subjectRefType:'screening',subjectRefId:s.id,safeTitle:`Screening invitation for ${role.title}. Please choose whether to take part.`},{inAppOnly:true});
  await notify(ctx, await consultantUserIds(ctx), { type: 'screening_updated', subjectRefType: 'screening', subjectRefId: s.id, safeTitle: `Screening invitation sent for ${role.title}` });
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

/**
 * BondMoran decides this person is not right for the job: the screening no longer counts, so the client's
 * screening coupon comes back and they can send someone else. Consultants only.
 */
export async function returnScreening(ctx: Ctx, screeningId: string, reason: string, reviewedEssential=false) {
  requireUser(ctx.actor, 'consultant');
  const [s] = await ctx.tx.select().from(screenings).where(and(eq(screenings.id, screeningId), eq(screenings.datasetId, ctx.datasetId))).for('update');
  if (!s) throw notFound();
  if(s.invitedAt&&!['completed','returned'].includes(s.status))throw conflict('SCREENING_OUTCOME_REQUIRED','Complete an accepted screening with a recorded pass or fail. An invitation can be cancelled without using a coupon.');
  if(s.outcome==='pass'&&!reviewedEssential)throw conflict('REVIEW_REQUIRED','A passed screening keeps its coupon unless BondMoran reviews a genuinely missed essential requirement.');
  if (s.status === 'returned') return s;
  if (s.status === 'cancelled') throw conflict('SCREENING_CANCELLED', 'This screening was already cancelled, so its coupon is already back.');
  const role = await roleForActor(ctx, s.roleId);
  const [u] = await ctx.tx.update(screenings).set({ status: 'returned', outcome:s.outcome?'fail':null, returnedReasonSafe: reason.trim().slice(0, 300) || 'Not right for this job', updatedAt: new Date() }).where(eq(screenings.id, s.id)).returning();
  await notify(ctx, await clientUserIds(ctx, role.clientId), { type: 'screening_updated', subjectRefType: 'role', subjectRefId: role.id, safeTitle: `Your screening coupon is back for ${role.title}: BondMoran didn't think one person was right` });
  await logActivity(ctx, { subjectType: 'screening', subjectId: s.id, action: 'screening.returned', clientId: role.clientId });
  return u;
}

async function autoPickCandidates(ctx: Ctx, roleId: string) {
  const role = await roleForActor(ctx, roleId);
  const offers=await ctx.tx.select().from(screenings).where(and(eq(screenings.roleId,roleId),eq(screenings.status,'invited')));
  const left = Math.max(0,(await slotsLeft(ctx, roleId))-offers.filter(s=>s.inviteExpiresAt&&s.inviteExpiresAt>new Date()).length);
  if(role.shortlistEnabled){const {disclosedPublication}=await import('./shortlists');const p=await disclosedPublication(ctx,roleId);const existing=await ctx.tx.select().from(screenings).where(eq(screenings.roleId,roleId));const taken=new Set(existing.filter(s=>!['cancelled','expired','declined'].includes(s.status)).map(s=>s.candidateId));const pool=(p?.payload.entries??[]).filter(e=>!taken.has(e.candidateId)).map(e=>({id:e.candidateId,publicRef:e.reference,eligibility:e.dto.eligibility??'eligible',score:e.metrics.working,coverageBps:Math.round(e.metrics.coverage*100),confidence:e.metrics.coverage<50?'low':'high',hasRelevantTag:e.metrics.coverage>0}));const detailed=autoPicksDetailed(pool,left);return {role,left,picks:detailed.picks,discoveryId:detailed.discoveryId,poolSize:pool.length};}
  const ms = await ctx.tx.select().from(matches).where(eq(matches.roleId, roleId));
  const existing = await ctx.tx.select({ c: screenings.candidateId, s: screenings.status }).from(screenings).where(eq(screenings.roleId, roleId));
  const taken = new Set(existing.filter((e) => e.s !== 'cancelled').map((e) => e.c));
  const crit = await criteriaFor(ctx, roleId);
  const roleTags = new Set(crit.flatMap((c) => c.evidenceTags));
  const pool = [];
  for (const m of ms) {
    if (!assessmentReady(m, role)) continue;
    if (m.eligibility === 'incompatible' || taken.has(m.candidateId)) continue;
    if (!(await discoveryState(ctx, m.candidateId)).discoverable || (await isBlockedForClient(ctx, m.candidateId, role.clientId))) continue;
    const [c] = await ctx.tx.select({ ref: candidates.publicRef, pv: candidates.latestProfileVersionId }).from(candidates).where(eq(candidates.id, m.candidateId));
    const ev = await validEvidenceForProfile(ctx, m.candidateId, c.pv);
    pool.push({ id: m.candidateId, eligibility: m.eligibility, score: m.score, coverageBps: m.coverageBps, publicRef: c.ref, confidence: m.confidence, hasRelevantTag: ev.some((e) => e.tags.some((t) => roleTags.has(t))) });
  }
  const detailed = autoPicksDetailed(pool, left);
  return { role, left, picks: detailed.picks, discoveryId: detailed.discoveryId, poolSize: pool.length };
}

export async function previewAutoPicks(ctx: Ctx, roleId: string) {
  const { role, left, picks, discoveryId } = await autoPickCandidates(ctx, roleId);
  // Only the one reserved slot is the discovery slot. Other low-evidence picks are ordinary top-ups.
  return { slotsLeft: left, picks: picks.map((p) => ({ ref: roleScopedRef(role.id, p.id), confidence: p.confidence, discoverySlot: p.id === discoveryId })), shortfall: Math.max(0, left - picks.length) };
}

export async function confirmAutoPicks(ctx: Ctx, roleId: string, refs: string[]) {
  const pre = await roleForActor(ctx, roleId);
  const ids = [];
  for (const r of refs) ids.push(await resolveRoleRef(ctx, roleId, r));
  await lockCandidates(ctx.tx, ids);
  const role = await roleForActor(ctx, pre.id, { lock: true });
  if (role.status !== 'open') throw conflict('ROLE_NOT_OPEN', 'This role is not open.');
  const invited=await ctx.tx.select().from(screenings).where(and(eq(screenings.roleId,roleId),eq(screenings.status,'invited')));
  if (ids.length > (await slotsLeft(ctx, roleId))-invited.filter(x=>x.inviteExpiresAt&&x.inviteExpiresAt>new Date()).length) throw conflict('INCLUDED_SCREENING_LIMIT', 'Not enough included screenings remain for this selection.');
  const out = [];
  for (const id of ids) {
    await assertScreenable(ctx, role, id);
    const {ensureLegacyPublication,assertPublishedCandidate}=await import('./shortlists');await ensureLegacyPublication(ctx,roleId);await assertPublishedCandidate(ctx,roleId,id,true);
    const invite=await insertScreening(ctx, roleId, id, 'automatic');out.push(invite);const [candidate]=await ctx.tx.select().from(candidates).where(eq(candidates.id,id));if(candidate?.userId)await notify(ctx,[candidate.userId],{type:'screening_updated',subjectRefType:'screening',subjectRefId:invite.id,safeTitle:`Screening invitation for ${role.title}. Please choose whether to take part.`},{inAppOnly:true});
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
  if (!['requested', 'accepted', 'scheduled'].includes(s.status)) throw conflict('SCREENING_NOT_OPEN', 'This screening cannot be scheduled.');
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
  if (!['requested', 'accepted', 'scheduled'].includes(s.status)) throw conflict('SCREENING_NOT_OPEN', 'This screening is not open.');
  if(s.invitedAt&&!input.outcome)throw invalid('Record whether the candidate meets the agreed role requirements: pass or fail.');
  const {assessmentPrivacySafe}=await import('./matching');if(!(await assessmentPrivacySafe(ctx,s.candidateId,{criteria:[{criterionId:'summary',level:'unknown',quote:'',evidenceIds:[],reasonSafe:input.summarySafe}]})))throw invalid('Keep the shared summary anonymous: remove names, employers and contact details.');
  const crit = await criteriaFor(ctx, s.roleId);
  if(input.outcome==='pass'&&crit.some(c=>c.importance==='essential'&&input.assessments.some(a=>a.criterionId===c.id&&a.level==='not_met')))throw invalid('A confirmed unmet essential requirement cannot be recorded as a pass.');
  const ids = new Set(input.assessments.map((x) => x.criterionId));
  if (crit.some((c) => !ids.has(c.id)) || ids.size !== crit.length) throw invalid('Record an observation or Unknown for every criterion.', { assessments: 'Every criterion needs an observation or Unknown' });
  const own = await ctx.tx.select({ id: evidenceItems.id }).from(evidenceItems).where(eq(evidenceItems.candidateId, s.candidateId));
  const ownIds = new Set(own.map((o) => o.id));
  if (input.assessments.some((x) => x.evidenceIds.some((e) => !ownIds.has(e)))) throw invalid('Evidence must belong to this candidate.');
  const [role] = await ctx.tx.select().from(roles).where(eq(roles.id, s.roleId));
  const [u] = await ctx.tx.update(screenings).set({ status: input.outcome==='fail'?'returned':'completed', returnedReasonSafe:input.outcome==='fail'?input.summarySafe:null, outcome:input.outcome??'pass', completedAt: ctx.now, consultantUserId: a.userId, notesPrivate: input.notesPrivate, summarySafe: input.summarySafe, criterionAssessments: input.assessments, updatedAt: new Date() }).where(eq(screenings.id, id)).returning();
  await ctx.tx.insert(workLogs).values({ datasetId: ctx.datasetId, consultantUserId: a.userId, clientId: role.clientId, roleId: role.id, screeningId: id, category: 'screening', minutes: input.minutes, workDate: businessDate(ctx), note: 'Screening call' });
  if(input.outcome==='fail')await notify(ctx,await clientUserIds(ctx,role.clientId),{type:'screening_updated',subjectRefType:'role',subjectRefId:role.id,safeTitle:`Your screening coupon is back for ${role.title}: agreed requirements were not met`},{inAppOnly:true});
  await recomputeRole(ctx, role.id);
  await notify(ctx, await clientUserIds(ctx, role.clientId), { type: 'screening_updated', subjectRefType: 'role', subjectRefId: role.id, safeTitle: `A screening was completed for ${role.title}` });
  await logActivity(ctx, { subjectType: 'screening', subjectId: id, action: input.outcome==='fail'?'screening.failed':'screening.passed', clientId: role.clientId, metadata: { minutes: input.minutes } });
  return u;
}

export async function screeningRecordings(ctx: Ctx, screeningId: string) {
  requireUser(ctx.actor, 'consultant');
  return ctx.tx.select({ id: files.id, bytes: files.bytes, mimeType: files.mimeType, createdAt: files.createdAt, state: files.uploadState }).from(files).where(and(eq(files.screeningId, screeningId), eq(files.purpose, 'screening_recording'), inArray(files.uploadState, ['ready', 'uploaded'])));
}

/** Job consent belongs to the candidate, independently of recording consent. Lock order matches requests. */
export async function respondToScreening(ctx:Ctx,id:string,accept:boolean){
 const a=requireUser(ctx.actor,'candidate');if(!a.candidateId)throw notFound();
 await lockCandidates(ctx.tx,[a.candidateId]);
 const [pre]=await ctx.tx.select().from(screenings).where(and(eq(screenings.id,id),eq(screenings.datasetId,ctx.datasetId),eq(screenings.candidateId,a.candidateId)));if(!pre)throw notFound();
 await ctx.tx.select().from(roles).where(eq(roles.id,pre.roleId)).for('update');
 const [s]=await ctx.tx.select().from(screenings).where(eq(screenings.id,id)).for('update');
 if((accept&&s.status==='accepted')||(!accept&&s.status==='declined'))return s;
 if(s.status!=='invited')throw conflict('INVITATION_NOT_OPEN','This invitation is no longer open.');
 if(!s.inviteExpiresAt||s.inviteExpiresAt<=new Date())throw conflict('INVITATION_EXPIRED','This invitation has expired. Your evidence and opportunity are unchanged.');
 if(accept&&(await slotsLeft(ctx,s.roleId))<=0)throw conflict('INCLUDED_SCREENING_LIMIT','All screening coupons are currently reserved. BondMoran can contact you when one becomes available.');
 const [role]=await ctx.tx.select().from(roles).where(eq(roles.id,s.roleId));if(!role||role.status!=='open')throw conflict('ROLE_NOT_OPEN','This role is no longer open.');
 const [u]=await ctx.tx.update(screenings).set({status:accept?'accepted':'declined',respondedAt:new Date(),updatedAt:new Date()}).where(eq(screenings.id,id)).returning();
 await ctx.tx.insert(consentEvents).values({datasetId:ctx.datasetId,candidateId:a.candidateId,kind:'screening_job',granted:accept,termsVersion:'screening-job-v1',actorUserId:a.userId,relatedScreeningId:id,eventAt:new Date()});
 await logActivity(ctx,{subjectType:'screening',subjectId:id,action:accept?'screening.accepted':'screening.declined'});
 await notify(ctx,await consultantUserIds(ctx),{type:'screening_updated',subjectRefType:'screening',subjectRefId:id,safeTitle:accept?'Screening accepted; a coupon is reserved':'A screening invitation was declined'});return u;
}
export async function myScreeningInvitations(ctx:Ctx){const a=requireUser(ctx.actor,'candidate');if(!a.candidateId)return [];return ctx.tx.select({id:screenings.id,title:roles.title,status:screenings.status,expiresAt:screenings.inviteExpiresAt}).from(screenings).innerJoin(roles,eq(roles.id,screenings.roleId)).where(and(eq(screenings.candidateId,a.candidateId),inArray(screenings.status,['invited','accepted','scheduled'])));}
export async function expireScreeningInvitations(ctx:Ctx){const rows=await ctx.tx.select().from(screenings).where(and(eq(screenings.datasetId,ctx.datasetId),eq(screenings.status,'invited')));for(const r of rows)if(r.inviteExpiresAt&&r.inviteExpiresAt<=new Date()){await ctx.tx.update(screenings).set({status:'expired',updatedAt:new Date()}).where(and(eq(screenings.id,r.id),eq(screenings.status,'invited')));await logActivity(ctx,{subjectType:'screening',subjectId:r.id,action:'screening.expired'});}}
export async function disputeScreeningPass(ctx:Ctx,id:string,reason:string){const a=requireUser(ctx.actor);if(a.userType==='candidate')throw notFound();const [s]=await ctx.tx.select().from(screenings).where(and(eq(screenings.id,id),eq(screenings.datasetId,ctx.datasetId)));if(!s||s.outcome!=='pass'||s.status!=='completed')throw notFound();await roleForActor(ctx,s.roleId);if(reason.trim().length<10)throw invalid('Explain which agreed essential requirement was missed.');await ctx.tx.update(screenings).set({disputeReason:reason.trim().slice(0,600)}).where(eq(screenings.id,id));await logActivity(ctx,{subjectType:'screening',subjectId:id,action:'screening.pass_disputed'});await notify(ctx,await consultantUserIds(ctx),{type:'screening_updated',subjectRefType:'screening',subjectRefId:id,safeTitle:'A passed screening needs an essential-requirement review'});}
export async function resolveScreeningDispute(ctx:Ctx,id:string,uphold:boolean,reason:string){requireUser(ctx.actor,'consultant');const s=await screeningForConsultant(ctx,id);if(!s.disputeReason)throw invalid('There is no essential-requirement dispute to review.');if(reason.trim().length<10)throw invalid('Record the reason for the review decision.');if(!uphold)await returnScreening(ctx,id,reason,true);await ctx.tx.update(screenings).set({disputeReason:null}).where(eq(screenings.id,id));await logActivity(ctx,{subjectType:'screening',subjectId:id,action:'screening.dispute_resolved',metadata:{uphold,reason:reason.trim().slice(0,600)}});}
