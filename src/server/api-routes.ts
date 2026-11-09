import 'server-only';
/**
 * Command and query handlers. Every handler receives an authenticated viewer and
 * server-derived client or candidate scope. No generic PATCH endpoints exist.
 */
import type { NextRequest } from 'next/server';
import { z } from 'zod';
import { AppError } from './lib/errors';
import { idempotent, parse } from './http';
import { withTx, readCtx, type BaseCtx } from './services/context';
import type { Viewer } from './auth';
import * as roles from './services/roles';
import * as intros from './services/intros';
import * as hires from './services/hires';
import * as screens from './services/screenings';
import * as cands from './services/candidates';
import * as convs from './services/conversations';
import * as filesSvc from './services/files';
import * as contracts from './services/contracts';
import * as checkout from './services/checkout';
import * as hiring from './services/hiring-assistant';
import { enqueue } from './services/jobs';
import { roleScopedRef } from './dto/refs';
import { notify, logActivity, clientUserIds } from './services/audit';
import * as S from './db/schema';
import { and, eq, desc, isNull } from 'drizzle-orm';
import { activateInput, closeInput, reopenInput, introRequestInput, hireInput, outsideHireInput, departureInput, replacementRequestInput, contractInput, grantInput, reversalInput, checkoutInput, screeningRequestInput, screeningCompleteInput, adjustmentInput, workLogInput, answerInput, preferencesInput } from './services/inputs';
import { prepFor, savePrep } from './services/prep';
import { runAi, aiMode } from './ai';
import { questionOutput, assessmentOutput } from './ai/schemas';
import { validateAssessment } from './ai/validate';
import { assessmentInput, applyAssessment } from './services/matching';
import { TOPIC_BANK } from './ai/prompts';
import { db } from './db/client';
import { recomputeRole } from './services/matching';
import { DEFAULT_OFFER } from './services/demo';

type H = (a: { req: NextRequest; viewer: Viewer; base: BaseCtx; p: Record<string, string>; body: unknown }) => Promise<unknown>;
type R = { method: 'GET' | 'POST'; path: string; types?: Array<'candidate' | 'client' | 'consultant'>; h: H; raw?: boolean };

/** A replayed idempotent request returns the stored reference; give callers the same shape as the first response. */
const unwrapRef = async (_c: unknown, r: unknown) => (r && typeof r === 'object' && 'ref' in r ? (r as { ref: unknown }).ref : r);
const pounds = (n: number) => BigInt(n) * 100n;
const T = <X>(base: BaseCtx, fn: Parameters<typeof withTx<X>>[1]) => withTx(base, fn);

/** Live phrasing of the next question happens after commit, outside any lock. The bank question stays if it fails. */
async function phraseQuestion(viewer: Viewer, base: BaseCtx, q: { id: string; topic: string; reason: string | null } | null) {
  if (!q || q.reason !== 'live_pending' || aiMode() !== 'live') return;
  try {
    const recent = await db().select({ body: S.checkInAnswers.body }).from(S.checkInAnswers).where(and(eq(S.checkInAnswers.candidateId, viewer.actor.candidateId!), eq(S.checkInAnswers.status, 'submitted'))).orderBy(desc(S.checkInAnswers.submittedAt)).limit(3);
    const res = await runAi({ task: 'question', datasetId: base.datasetId, userId: viewer.actor.userId, candidateId: viewer.actor.candidateId, input: recent }, (p) => p.nextQuestion({ topic: q.topic, recentMessages: recent.reverse().map((r) => ({ role: 'user' as const, text: r.body })), evidenceSummary: [] }));
    const out = questionOutput.safeParse(res.output);
    const ok = out.success && out.data.topic === q.topic && (out.data.question.match(/\?/g)?.length ?? 0) <= 1 && !/(religio|medical|health|age|nationality|pregnan|family)/i.test(out.data.question);
    await db().update(S.checkInQuestions).set({ questionText: ok ? out.data!.question : TOPIC_BANK[q.topic], reason: ok ? out.data!.reason : null }).where(eq(S.checkInQuestions.id, q.id));
  } catch {
    await db().update(S.checkInQuestions).set({ reason: null }).where(eq(S.checkInQuestions.id, q.id));
  }
}

export const ROUTES: R[] = [
  // ---------- candidate ----------
  { method: 'POST', path: 'candidate/preferences', types: ['candidate'], h: ({ base, body }) => T(base, (c) => cands.updatePreferences(c, parse(preferencesInput, body))) },
  { method: 'POST', path: 'candidate/discovery', types: ['candidate'], h: ({ base, body }) => T(base, (c) => cands.setDiscovery(c, parse(z.object({ enabled: z.boolean() }), body).enabled)) },
  { method: 'POST', path: 'candidate/insights', types: ['candidate'], h: ({ base, body }) => T(base, (c) => cands.setAggregateInsights(c, parse(z.object({ granted: z.boolean() }), body).granted)) },
  { method: 'POST', path: 'candidate/employer', types: ['candidate'], h: ({ base, body }) => T(base, (c) => cands.setCurrentEmployer(c, body)) },
  { method: 'POST', path: 'candidate/blocks', types: ['candidate'], h: ({ base, body }) => T(base, (c) => cands.addBlock(c, parse(z.object({ organisationId: z.string().uuid() }), body).organisationId)) },
  { method: 'POST', path: 'candidate/blocks/remove', types: ['candidate'], h: ({ base, body }) => T(base, (c) => cands.removeBlock(c, parse(z.object({ organisationId: z.string().uuid() }), body).organisationId)) },
  { method: 'POST', path: 'candidate/evidence/approve', types: ['candidate'], h: ({ base, body }) => T(base, (c) => cands.approveEvidence(c, parse(z.object({ evidenceIds: z.array(z.string().uuid()).min(1).max(20) }), body).evidenceIds)) },
  { method: 'POST', path: 'candidate/evidence/revise', types: ['candidate'], h: async ({ base, body }) => ({ id: (await T(base, (c) => cands.reviseEvidence(c, body))).id }) },
  { method: 'POST', path: 'candidate/evidence/withdraw', types: ['candidate'], h: ({ base, body }) => T(base, (c) => cands.withdrawEvidence(c, parse(z.object({ evidenceId: z.string().uuid() }), body).evidenceId)) },
  { method: 'POST', path: 'candidate/delete', types: ['candidate'], h: ({ base, body }) => { const b = parse(z.object({ password: z.string().max(200), confirm: z.string().max(20) }), body); return T(base, (c) => cands.requestDeletion(c, b.password, b.confirm)); } },
  { method: 'POST', path: 'candidate/load-fictional-cv', types: ['candidate'], h: async ({ base }) => {
    const { CANDIDATES, cvText } = await import('../../fixtures/candidates');
    const { generateCvPdf } = await import('./services/demo-seed');
    const fx = CANDIDATES.find((x) => x.code === 'C40')!;
    const bytes = await generateCvPdf(cvText(fx, 'candidate.c40@example.test'));
    const r = await T(base, (c) => filesSvc.uploadCv(c, { filename: 'Ravi-Das-CV.pdf', mime: 'application/pdf', bytes }));
    return { fileId: r.file.id, jobId: r.jobId };
  } },
  // ---------- conversations ----------
  { method: 'POST', path: 'conversations/start', types: ['candidate'], h: async ({ base, body, viewer }) => {
    const kind = parse(z.object({ kind: z.enum(['initial_screening', 'check_in']) }), body).kind;
    const conv = await T(base, (c) => convs.startConversation(c, kind));
    const [q] = await db().select().from(S.checkInQuestions).where(and(eq(S.checkInQuestions.conversationId, conv.id), eq(S.checkInQuestions.state, 'unanswered')));
    await phraseQuestion(viewer, base, q ?? null);
    return { id: conv.id };
  } },
  { method: 'POST', path: 'conversations/:id/answers', types: ['candidate'], h: async ({ base, body, p, viewer }) => {
    const b = parse(answerInput, body);
    const r = await T(base, (c) => convs.submitAnswer(c, p.id, b.questionId, b.body));
    await phraseQuestion(viewer, base, r.next);
    return { answerId: r.answer.id, nextQuestionId: r.next?.id ?? null };
  } },
  { method: 'POST', path: 'conversations/:id/skip', types: ['candidate'], h: async ({ base, body, p, viewer }) => { const n = await T(base, (c) => convs.skipQuestion(c, p.id, parse(z.object({ questionId: z.string().uuid() }), body).questionId)); await phraseQuestion(viewer, base, n); return { nextQuestionId: n?.id ?? null }; } },
  { method: 'POST', path: 'conversations/:id/pause', types: ['candidate'], h: ({ base, p }) => T(base, (c) => convs.pauseConversation(c, p.id)) },
  { method: 'POST', path: 'conversations/:id/finish', types: ['candidate'], h: async ({ base, p }) => {
    const r = await T(base, async (c) => {
      const out = await convs.finishConversation(c, p.id);
      const [ds] = await c.tx.select({ code: S.datasets.scenarioCode }).from(S.datasets).where(eq(S.datasets.id, c.datasetId));
      if (ds?.code === 'S23') await c.tx.update(S.jobs).set({ payload: { conversationId: p.id, simulateFailureOnce: true } }).where(eq(S.jobs.id, out.jobId));
      return out;
    });
    return { jobId: r.jobId };
  } },
  { method: 'POST', path: 'conversations/retry-profile', types: ['candidate'], h: async ({ base, body, viewer }) => {
    const jobId = parse(z.object({ jobId: z.string().uuid() }), body).jobId;
    return T(base, async (c) => {
      const [j] = await c.tx.select().from(S.jobs).where(and(eq(S.jobs.id, jobId), eq(S.jobs.subjectId, viewer.actor.candidateId!)));
      if (!j) throw new AppError('NOT_FOUND', 404, 'Not found.');
      await enqueue(c, j.kind, j.subjectId, j.dedupeKey);
      return { jobId: j.id };
    });
  } },
  // ---------- files ----------
  { method: 'POST', path: 'files/upload', types: ['candidate'], raw: true, h: async ({ req, base }) => {
    const form = await req.formData();
    const f = form.get('file');
    if (!(f instanceof File)) throw new AppError('VALIDATION', 400, 'Choose a file to upload.');
    if (f.size > 5242880) throw new AppError('FILE_TOO_LARGE', 400, 'CVs can be up to 5 MB.');
    const bytes = Buffer.from(await f.arrayBuffer());
    const r = await T(base, (c) => filesSvc.uploadCv(c, { filename: f.name, mime: f.type, bytes }));
    return { fileId: r.file.id, jobId: r.jobId };
  } },
  { method: 'POST', path: 'files/paste', types: ['candidate'], h: async ({ base, body }) => ({ fileId: (await T(base, (c) => filesSvc.pasteCvText(c, parse(z.object({ text: z.string().max(30000) }), body).text))).id }) },
  { method: 'POST', path: 'files/:id/confirm', types: ['candidate'], h: ({ base, p }) => T(base, (c) => filesSvc.confirmCvText(c, p.id)) },
  { method: 'POST', path: 'files/:id/delete', types: ['candidate'], h: ({ base, p }) => T(base, (c) => filesSvc.deleteCv(c, p.id)) },
  { method: 'GET', path: 'files/:id/download', types: ['candidate', 'consultant'], h: async ({ base, p }) => {
    const f = await filesSvc.fileForDownload(readCtx(base), p.id);
    return new Response(new Uint8Array(f.bytes), { headers: { 'Content-Type': f.mime, 'Content-Disposition': `inline; filename="${f.filename}"`, 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff' } });
  } },
  // ---------- roles ----------
  { method: 'POST', path: 'roles/draft', types: ['client', 'consultant'], h: async ({ base, body }) => ({ id: (await T(base, (c) => roles.createDraftRole(c, body))).id }) },
  { method: 'POST', path: 'roles/:id/update-brief', types: ['client', 'consultant'], h: async ({ base, body, p }) => ({ id: (await T(base, (c) => roles.updateRoleBrief(c, p.id, body))).id }) },
  { method: 'POST', path: 'roles/:id/structure', types: ['client', 'consultant'], h: async ({ base, body, p }) => {
    const brief = parse(z.object({ brief: z.string().max(8000), title: z.string().max(120) }), body);
    await roles.roleForActor(readCtx(base), p.id);
    const res = await runAi({ task: 'role', datasetId: base.datasetId, roleId: p.id, input: brief }, (pr) => pr.structureRole(brief));
    return { draft: res.output, provider: res.provider };
  } },
  { method: 'POST', path: 'roles/:id/activate', types: ['client', 'consultant'], h: ({ req, base, body, p }) => idempotent(req, base, `roles/${p.id}/activate`, body, (c, k) => roles.activateRole(c, p.id, { ...parse(activateInput, body), idempotencyKey: k })) },
  { method: 'POST', path: 'roles/:id/close', types: ['client', 'consultant'], h: ({ req, base, body, p }) => idempotent(req, base, `roles/${p.id}/close`, body, (c) => roles.closeRole(c, p.id, parse(closeInput, body).reason)) },
  { method: 'POST', path: 'roles/:id/reopen', types: ['client', 'consultant'], h: ({ req, base, body, p }) => idempotent(req, base, `roles/${p.id}/reopen`, body, (c, k) => roles.reopenRole(c, p.id, { ...parse(reopenInput, body), idempotencyKey: k })) },
  { method: 'POST', path: 'roles/:id/upgrade', types: ['client', 'consultant'], h: ({ req, base, body, p }) => idempotent(req, base, `roles/${p.id}/upgrade`, body, (c) => roles.upgradeSearch(c, p.id).then((r) => r.role)) },
  { method: 'POST', path: 'roles/:id/confirm-new-vacancy', types: ['consultant'], h: ({ base, body, p }) => T(base, (c) => roles.confirmNewVacancy(c, p.id, parse(z.object({ reason: z.string().min(5).max(300) }), body).reason)) },
  { method: 'GET', path: 'roles/:id/charges', types: ['client', 'consultant'], h: ({ base, p }) => roles.roleCharges(readCtx(base), p.id) },
  // ---------- introductions ----------
  { method: 'POST', path: 'intros/request', types: ['client', 'consultant'], h: async ({ req, base, body }) => { const b = parse(introRequestInput, body); return idempotent(req, base, 'intros/request', body, (c, k) => intros.requestIntroduction(c, { ...b, idempotencyKey: k }).then((i) => ({ id: i.id }))); } },
  { method: 'POST', path: 'intros/:id/accept', types: ['candidate'], h: ({ req, base, body, p }) => idempotent(req, base, `intros/${p.id}/accept`, body, (c, k) => intros.acceptIntroduction(c, p.id, k).then((i) => ({ id: i.id }))) },
  { method: 'POST', path: 'intros/:id/decline', types: ['candidate'], h: ({ req, base, body, p }) => idempotent(req, base, `intros/${p.id}/decline`, body, (c) => intros.declineIntroduction(c, p.id).then((i) => ({ id: i.id }))) },
  { method: 'POST', path: 'intros/:id/withdraw', types: ['candidate'], h: ({ req, base, body, p }) => idempotent(req, base, `intros/${p.id}/withdraw`, body, (c) => intros.withdrawIntroduction(c, p.id).then((i) => ({ id: i.id }))) },
  { method: 'POST', path: 'intros/:id/cancel', types: ['client', 'consultant'], h: ({ req, base, body, p }) => idempotent(req, base, `intros/${p.id}/cancel`, body, (c) => intros.cancelIntroduction(c, p.id).then((i) => ({ id: i.id }))) },
  { method: 'POST', path: 'intros/:id/stage', types: ['client', 'consultant'], h: ({ base, body, p }) => { const b = parse(z.object({ stage: z.enum(['introduced', 'interview', 'offer', 'rejected']), note: z.string().max(1000).optional() }), body); return T(base, (c) => hires.setPipelineStage(c, p.id, b.stage, b.note)); } },
  { method: 'GET', path: 'intros/:id/prep', types: ['candidate', 'client', 'consultant'], h: ({ base, p }) => prepFor(readCtx(base), p.id) },
  { method: 'POST', path: 'intros/:id/prep', types: ['consultant'], h: ({ base, body, p }) => T(base, (c) => savePrep(c, p.id, body)) },
  { method: 'GET', path: 'intros/:id/hire-preview', types: ['client', 'consultant'], h: ({ base, p }) => hires.hirePreview(readCtx(base), p.id) },
  // ---------- screenings ----------
  { method: 'POST', path: 'screenings/request', types: ['client', 'consultant'], h: ({ req, base, body }) => idempotent(req, base, 'screenings/request', body, (c) => screens.requestScreening(c, parse(screeningRequestInput, body)).then((s) => ({ id: s.id }))) },
  { method: 'POST', path: 'screenings/auto-picks/preview', types: ['client', 'consultant'], h: ({ base, body }) => screens.previewAutoPicks(readCtx(base), parse(z.object({ roleId: z.string().uuid() }), body).roleId) },
  { method: 'POST', path: 'screenings/auto-picks/confirm', types: ['client', 'consultant'], h: ({ req, base, body }) => { const b = parse(z.object({ roleId: z.string().uuid(), refs: z.array(z.string()).min(1).max(5) }), body); return idempotent(req, base, 'screenings/auto-picks/confirm', body, (c) => screens.confirmAutoPicks(c, b.roleId, b.refs).then((r) => ({ count: String(r.length) }))); } },
  { method: 'POST', path: 'screenings/:id/cancel', types: ['client', 'consultant'], h: ({ base, p }) => T(base, (c) => screens.cancelScreening(c, p.id).then(() => ({}))) },
  { method: 'POST', path: 'screenings/:id/schedule', types: ['consultant'], h: ({ base, body, p }) => T(base, (c) => screens.scheduleScreening(c, p.id, new Date(parse(z.object({ scheduledAt: z.string().datetime({ local: true }).or(z.string().datetime()) }), body).scheduledAt)).then(() => ({}))) },
  { method: 'POST', path: 'screenings/:id/consent', types: ['consultant'], h: ({ base, p }) => T(base, (c) => screens.recordRecordingConsent(c, p.id)) },
  { method: 'POST', path: 'screenings/:id/complete', types: ['consultant'], h: ({ base, body, p }) => T(base, (c) => screens.completeScreening(c, p.id, parse(screeningCompleteInput, body)).then(() => ({}))) },
  { method: 'POST', path: 'screenings/:id/upload-recording', types: ['consultant'], raw: true, h: async ({ req, base, p }) => {
    const form = await req.formData();
    const f = form.get('file');
    if (!(f instanceof File)) throw new AppError('VALIDATION', 400, 'Choose a recording.');
    if (f.size > 26214400) throw new AppError('FILE_TOO_LARGE', 400, 'Recordings can be up to 25 MB.');
    const bytes = Buffer.from(await f.arrayBuffer());
    const r = await T(base, (c) => filesSvc.uploadRecording(c, p.id, { filename: f.name, mime: f.type, bytes }));
    return { id: r.id };
  } },
  // ---------- hires ----------
  { method: 'POST', path: 'hires/record', types: ['client', 'consultant'], h: async ({ req, base, body }) => { const b = parse(hireInput, body); return idempotent(req, base, 'hires/record', body, (c, k) => hires.recordHire(c, { introductionId: b.introductionId, acceptedOfferDate: b.acceptedOfferDate, startDate: b.startDate, salaryPence: pounds(b.salaryPounds), idempotencyKey: k }).then((r) => ({ hire: r.hire, existing: r.existing }))); } },
  { method: 'POST', path: 'hires/outside', types: ['consultant'], h: async ({ req, base, body }) => { const b = parse(outsideHireInput, body); return idempotent(req, base, 'hires/outside', body, (c, k) => hires.recordOutsideHire(c, { clientId: b.clientId, introductionId: b.introductionId, acceptedOfferDate: b.acceptedOfferDate, startDate: b.startDate, salaryPence: pounds(b.salaryPounds), idempotencyKey: k }).then((r) => ({ hire: r.hire, existing: r.existing }))); } },
  { method: 'POST', path: 'hires/:id/departure', types: ['client', 'consultant'], h: async ({ base, body, p }) => ({ id: (await T(base, (c) => hires.recordDeparture(c, p.id, parse(departureInput, body)))).id }) },
  { method: 'POST', path: 'hires/:id/replacement-request', types: ['client', 'consultant'], h: async ({ base, body, p }) => { const rc = await T(base, (c) => hires.requestReplacement(c, p.id, parse(replacementRequestInput, body).reason)); return { id: rc.id, eligibility: rc.eligibility, status: rc.status }; } },
  { method: 'POST', path: 'replacements/:id/approve', types: ['consultant'], h: async ({ base, p }) => { const rc = await T(base, (c) => hires.approveReplacement(c, p.id)); return { id: rc.id, replacementRoleId: rc.replacementRoleId }; } },
  { method: 'POST', path: 'replacements/:id/decline', types: ['consultant'], h: async ({ base, p }) => ({ id: (await T(base, (c) => hires.declineReplacement(c, p.id))).id }) },
  // ---------- consultant ----------
  { method: 'POST', path: 'consultant/clients', types: ['consultant'], h: async ({ base, body }) => {
    const b = parse(z.object({ name: z.string().min(2).max(120), domain: z.string().max(120).optional(), contactName: z.string().min(2).max(120), contactEmail: z.string().email().max(200), consultantUserId: z.string().uuid() }), body);
    return T(base, async (c) => {
      const [org] = await c.tx.insert(S.organisations).values({ datasetId: c.datasetId, legalName: b.name, displayName: b.name, canonicalDomain: b.domain?.toLowerCase() || null, isClient: true }).returning();
      await c.tx.insert(S.organisationAliases).values({ datasetId: c.datasetId, organisationId: org.id, aliasNormalized: b.name.toLowerCase(), aliasType: 'name' }).onConflictDoNothing();
      const [cl] = await c.tx.insert(S.clients).values({ datasetId: c.datasetId, organisationId: org.id, consultantUserId: b.consultantUserId, contactName: b.contactName, contactEmail: b.contactEmail, status: 'onboarding' }).returning();
      await c.tx.insert(S.clientOnboarding).values({ datasetId: c.datasetId, clientId: cl.id });
      // The client contact gets a fictional login that uses the shared demo password.
      const email = b.contactEmail.trim().toLowerCase();
      const [taken] = await c.tx.select({ id: S.users.id }).from(S.users).where(and(eq(S.users.datasetId, c.datasetId), eq(S.users.emailNormalized, email)));
      if (taken) throw new AppError('EMAIL_IN_USE', 409, 'That contact email already has an account in this demo.', { contactEmail: 'Already in use' });
      const pw = process.env.DEMO_LOGIN_PASSWORD;
      if (!pw) throw new AppError('CONFIG', 503, 'The demo login password is not configured.');
      const argon2 = await import('argon2');
      const [u] = await c.tx.insert(S.users).values({ datasetId: c.datasetId, emailNormalized: email, passwordHash: await argon2.hash(pw, { type: argon2.argon2id }), userType: 'client', displayName: b.contactName }).returning();
      await c.tx.insert(S.clientMemberships).values({ datasetId: c.datasetId, clientId: cl.id, userId: u.id, membershipRole: 'owner' });
      await c.tx.insert(S.wallets).values({ datasetId: c.datasetId, clientId: cl.id }).onConflictDoNothing();
      await logActivity(c, { subjectType: 'client', subjectId: cl.id, action: 'client.created', clientId: cl.id });
      return { id: cl.id };
    });
  } },
  { method: 'POST', path: 'consultant/organisations', types: ['consultant'], h: ({ base, body }) => {
    const b = parse(z.object({ name: z.string().trim().min(2).max(120), domain: z.string().trim().max(120).optional() }), body);
    return T(base, async (c) => {
      const [dup] = await c.tx.select({ id: S.organisationAliases.id }).from(S.organisationAliases).where(and(eq(S.organisationAliases.datasetId, c.datasetId), eq(S.organisationAliases.aliasNormalized, b.name.toLowerCase())));
      if (dup) throw new AppError('ORG_EXISTS', 409, 'An organisation with that name already exists.');
      const [org] = await c.tx.insert(S.organisations).values({ datasetId: c.datasetId, legalName: b.name, displayName: b.name, canonicalDomain: b.domain?.toLowerCase() || null, isClient: false }).returning();
      await c.tx.insert(S.organisationAliases).values({ datasetId: c.datasetId, organisationId: org.id, aliasNormalized: b.name.toLowerCase(), aliasType: 'name' });
      if (b.domain) await c.tx.insert(S.organisationAliases).values({ datasetId: c.datasetId, organisationId: org.id, aliasNormalized: b.domain.toLowerCase().replace(/^https?:\/\//, '').replace(/^www\./, ''), aliasType: 'domain' }).onConflictDoNothing();
      return { id: org.id };
    });
  } },
  { method: 'POST', path: 'consultant/onboarding/:id', types: ['consultant'], h: ({ base, body, p }) => {
    const b = parse(z.object({ introStatus: z.enum(['not_booked', 'booked', 'completed']), trainingStatus: z.enum(['not_booked', 'booked', 'completed']), trainingMode: z.enum(['online', 'in_person']).nullable(), interviewTrainingDone: z.boolean(), processDesignDone: z.boolean(), jobSpecsDone: z.boolean(), assessmentTrainingDone: z.boolean(), hiringBrief: z.string().max(4000).nullable() }), body);
    return T(base, (c) => c.tx.update(S.clientOnboarding).set({ ...b, completedAt: b.trainingStatus === 'completed' ? c.now : null, updatedAt: new Date() }).where(eq(S.clientOnboarding.clientId, p.id)).then(() => ({})));
  } },
  { method: 'POST', path: 'consultant/contracts', types: ['consultant'], h: async ({ base, body }) => ({ id: (await T(base, (c) => contracts.createContractDraft(c, parse(contractInput, body)))).id }) },
  { method: 'POST', path: 'consultant/contracts/:id/activate', types: ['consultant'], h: ({ req, base, body, p }) => idempotent(req, base, `contracts/${p.id}/activate`, body, (c) => contracts.activateContract(c, p.id).then((k) => ({ id: k.id }))) },
  { method: 'POST', path: 'consultant/grants', types: ['consultant'], h: async ({ req, base, body }) => { const b = parse(grantInput, body); return idempotent(req, base, 'consultant/grants', body, (c, k) => hires.grantCredits(c, { ...b, idempotencyKey: k }).then((t) => ({ id: t.id }))); } },
  { method: 'POST', path: 'consultant/reversals', types: ['consultant'], h: async ({ req, base, body }) => { const b = parse(reversalInput, body); return idempotent(req, base, 'consultant/reversals', body, (c, k) => hires.reverseTransaction(c, { ...b, idempotencyKey: k }).then((t) => ({ id: t.id }))); } },
  { method: 'POST', path: 'consultant/evidence/anonymity-review', types: ['consultant'], h: ({ base, body }) => { const b = parse(z.object({ evidenceId: z.string().uuid(), decision: z.enum(['approved', 'rejected']), safeClaim: z.string().max(400).optional() }), body); return T(base, (c) => cands.anonymityReview(c, b.evidenceId, b.decision, b.safeClaim)); } },
  { method: 'POST', path: 'consultant/resolve-employer', types: ['consultant'], h: ({ base, body }) => { const b = parse(z.object({ candidateId: z.string().uuid(), organisationId: z.string().uuid() }), body); return T(base, (c) => cands.resolveEmployer(c, b.candidateId, b.organisationId)); } },
  { method: 'POST', path: 'consultant/ranking-adjustment', types: ['consultant'], h: ({ base, body, viewer }) => {
    const b = parse(adjustmentInput, body);
    return T(base, async (c) => {
      const own = await c.tx.select({ id: S.evidenceItems.id }).from(S.evidenceItems).where(eq(S.evidenceItems.candidateId, b.candidateId));
      if (b.evidenceIds.some((e) => !own.some((o) => o.id === e))) throw new AppError('VALIDATION', 400, 'Evidence must belong to this candidate.');
      await roles.roleForActor(c, b.roleId);
      await c.tx.insert(S.rankingAdjustments).values({ datasetId: c.datasetId, roleId: b.roleId, candidateId: b.candidateId, consultantUserId: viewer.actor.userId, adjustment: b.adjustment, reasonPrivate: b.reason, evidenceIds: b.evidenceIds });
      await recomputeRole(c, b.roleId);
      await logActivity(c, { subjectType: 'role', subjectId: b.roleId, action: 'ranking.adjusted', metadata: { adjustment: b.adjustment } });
      return {};
    });
  } },
  { method: 'POST', path: 'consultant/matches/review', types: ['consultant'], h: async ({ base, body, viewer }) => {
    const b = parse(z.object({ roleId: z.string().uuid(), candidateId: z.string().uuid() }), body);
    await roles.roleForActor(readCtx(base), b.roleId);
    const prepared = await assessmentInput(readCtx(base), b.roleId, b.candidateId);
    if (!prepared || !prepared.input.evidence.length) throw new AppError('NO_EVIDENCE', 409, 'This candidate has no approved evidence to review.');
    const res = await runAi({ task: 'assess', datasetId: base.datasetId, userId: viewer.actor.userId, roleId: b.roleId, candidateId: b.candidateId, input: prepared.input }, (p) => p.assessCriteria(prepared.input, { review: true }));
    const v = validateAssessment(res.output, prepared.input.criteria.map((c) => c.criterionId), prepared.input.evidence.map((e) => e.id));
    if (!v.ok) throw new AppError('REVIEW_INVALID', 422, `The review did not pass validation (${v.reason.replace(/_/g, ' ')}). Nothing was changed.`);
    return { proposal: res.output, provider: res.provider, model: res.usage.modelId, profileVersionId: prepared.profileVersionId, roleVersion: prepared.roleVersion };
  } },
  { method: 'POST', path: 'consultant/matches/apply-review', types: ['consultant'], h: async ({ base, body }) => {
    const b = parse(z.object({ roleId: z.string().uuid(), candidateId: z.string().uuid(), profileVersionId: z.string().uuid().nullable(), roleVersion: z.number().int(), proposal: assessmentOutput }), body);
    const r = await T(base, async (c) => { await roles.roleForActor(c, b.roleId); const out = await applyAssessment(c, { roleId: b.roleId, candidateId: b.candidateId, profileVersionId: b.profileVersionId, roleVersion: b.roleVersion, output: b.proposal }); if (out.applied) await logActivity(c, { subjectType: 'role', subjectId: b.roleId, action: 'ranking.ai_review_applied' }); return out; });
    if (!r.applied) throw new AppError('REVIEW_NOT_APPLIED', 409, r.reason === 'stale_discarded' ? 'The profile or role changed since the review. Run it again.' : `Not applied: ${String(r.reason).replace(/_/g, ' ')}.`);
    return { applied: true };
  } },
  { method: 'POST', path: 'consultant/work-logs', types: ['consultant'], h: ({ base, body, viewer }) => { const b = parse(workLogInput, body); return T(base, (c) => c.tx.insert(S.workLogs).values({ datasetId: c.datasetId, consultantUserId: viewer.actor.userId, clientId: b.clientId, roleId: b.roleId ?? null, category: b.category, minutes: b.minutes, workDate: b.workDate, note: b.note ?? null }).then(() => ({}))); } },
  { method: 'POST', path: 'consultant/jobs/:id/retry', types: ['consultant'], h: ({ base, p }) => T(base, async (c) => { const [j] = await c.tx.select().from(S.jobs).where(and(eq(S.jobs.id, p.id), eq(S.jobs.datasetId, c.datasetId))); if (!j) throw new AppError('NOT_FOUND', 404, 'Not found.'); await enqueue(c, j.kind, j.subjectId, j.dedupeKey); return {}; }) },
  // ---------- notifications and support ----------
  { method: 'GET', path: 'notifications', h: ({ base, viewer }) => readCtx(base).tx.select({ id: S.notifications.id, type: S.notifications.type, title: S.notifications.safeTitle, ref: S.notifications.subjectRefType, refId: S.notifications.subjectRefId, readAt: S.notifications.readAt, createdAt: S.notifications.createdAt }).from(S.notifications).where(eq(S.notifications.recipientUserId, viewer.actor.userId)).orderBy(desc(S.notifications.createdAt)).limit(30) },
  { method: 'POST', path: 'notifications/:id/read', h: ({ base, p, viewer }) => T(base, (c) => c.tx.update(S.notifications).set({ readAt: new Date() }).where(and(eq(S.notifications.id, p.id), eq(S.notifications.recipientUserId, viewer.actor.userId))).then(() => ({}))) },
  { method: 'POST', path: 'notifications/read-all', h: ({ base, viewer }) => T(base, (c) => c.tx.update(S.notifications).set({ readAt: new Date() }).where(and(eq(S.notifications.recipientUserId, viewer.actor.userId), isNull(S.notifications.readAt))).then(() => ({}))) },
  { method: 'POST', path: 'notifications/support-request', types: ['client'], h: ({ base, body, viewer }) => {
    const b = parse(z.object({ category: z.enum(['role', 'training', 'credits', 'candidate', 'other']), message: z.string().min(3).max(2000) }), body);
    return T(base, async (c) => {
      const [cl] = await c.tx.select().from(S.clients).where(eq(S.clients.id, viewer.actor.clientId!));
      await notify(c, [cl.consultantUserId], { type: 'system', subjectRefType: 'client', subjectRefId: cl.id, safeTitle: `Support request (${b.category}) from a client` });
      await logActivity(c, { subjectType: 'client', subjectId: cl.id, action: 'support.requested', clientId: cl.id, metadata: { category: b.category } });
      return { saved: true };
    });
  } },
  // ---------- hiring assistant (client) ----------
  { method: 'POST', path: 'client/hiring/message', types: ['client'], h: async ({ base, body, viewer }) => {
    const b = parse(z.object({ conversationId: z.string().uuid().nullable().default(null), text: z.string().trim().min(1, 'Type a message').max(2000) }), body);
    const p = await hiring.prepareTurn(readCtx(base), b.conversationId);
    let r: hiring.TurnResult;
    if (aiMode() === 'live') {
      const input = hiring.liveInput(p, b.text);
      const res = await runAi({ task: 'hiring', datasetId: base.datasetId, userId: viewer.actor.userId, input }, (pr) => pr.hiringTurn(input));
      r = hiring.liveResult(p, res.output, res.provider);
    } else r = hiring.demoTurn(p, b.text);
    return T(base, (c) => hiring.commitTurn(c, p, b.text, r));
  } },
  { method: 'POST', path: 'client/hiring/:id/save', types: ['client'], h: async ({ base, p }) => ({ id: (await T(base, (c) => hiring.saveAsDraft(c, p.id))).id }) },
  { method: 'POST', path: 'client/hiring/:id/start-over', types: ['client'], h: ({ base, p }) => T(base, (c) => hiring.startOver(c, p.id)) },
  { method: 'POST', path: 'client/hiring/:id/remove', types: ['client'], h: ({ base, body, p }) => { const b = parse(z.object({ list: z.enum(['mustHaves', 'niceToHaves', 'outcomes', 'teachable']), index: z.number().int().min(0).max(10) }), body); return T(base, (c) => hiring.removeItem(c, p.id, b.list, b.index)); } },
  { method: 'POST', path: 'client/hiring/forget', types: ['client'], h: ({ base, body }) => T(base, (c) => hiring.forgetFact(c, parse(z.object({ factId: z.string().uuid() }), body).factId)) },
  // ---------- demo checkout (no money is taken; no payment provider) ----------
  { method: 'POST', path: 'credits/checkout', types: ['client'], h: ({ req, base, body }) => { const b = parse(checkoutInput, body); return idempotent(req, base, 'credits/checkout', body, (c) => checkout.createCheckout(c, b).then((r) => ({ id: r.id })), unwrapRef); } },
  { method: 'POST', path: 'credits/checkout/:id/succeed', types: ['client'], h: ({ req, base, body, p }) => idempotent(req, base, `credits/checkout/${p.id}/succeed`, body, (c) => checkout.simulateSuccess(c, p.id).then((r) => ({ id: r.id })), unwrapRef) },
  { method: 'POST', path: 'credits/checkout/:id/decline', types: ['client'], h: ({ req, base, body, p }) => idempotent(req, base, `credits/checkout/${p.id}/decline`, body, (c) => checkout.simulateDecline(c, p.id).then((r) => ({ id: r.id })), unwrapRef) },
  { method: 'POST', path: 'credits/checkout/:id/cancel', types: ['client'], h: ({ req, base, body, p }) => idempotent(req, base, `credits/checkout/${p.id}/cancel`, body, (c) => checkout.cancelCheckout(c, p.id).then((r) => ({ id: r.id })), unwrapRef) },
  { method: 'POST', path: 'notifications/request-credits', types: ['client'], h: ({ base, viewer }) => T(base, async (c) => {
    const [cl] = await c.tx.select().from(S.clients).where(eq(S.clients.id, viewer.actor.clientId!));
    await notify(c, [cl.consultantUserId], { type: 'credit_low', subjectRefType: 'client', subjectRefId: cl.id, safeTitle: 'A client asked for more credits' });
    return { saved: true };
  }) },
  { method: 'POST', path: 'notifications/onboarding-preference', types: ['client'], h: ({ base, body, viewer }) => { const b = parse(z.object({ mode: z.enum(['online', 'in_person']) }), body); return T(base, async (c) => { await c.tx.update(S.clientOnboarding).set({ trainingMode: b.mode, updatedAt: new Date() }).where(eq(S.clientOnboarding.clientId, viewer.actor.clientId!)); const [cl] = await c.tx.select().from(S.clients).where(eq(S.clients.id, viewer.actor.clientId!)); await notify(c, [cl.consultantUserId], { type: 'system', subjectRefType: 'client', subjectRefId: cl.id, safeTitle: 'A client updated their training preference' }); return {}; }); } },
  // ---------- jobs ----------
  { method: 'GET', path: 'jobs/:id', h: ({ base, p, viewer }) => readCtx(base).tx.select({ id: S.jobs.id, status: S.jobs.status, errorCode: S.jobs.errorCode, subjectId: S.jobs.subjectId, kind: S.jobs.kind }).from(S.jobs).where(and(eq(S.jobs.id, p.id), eq(S.jobs.datasetId, base.datasetId))).then(([j]) => {
    if (!j) throw new AppError('NOT_FOUND', 404, 'Not found.');
    if (viewer.actor.userType === 'candidate' && j.subjectId !== viewer.actor.candidateId && !(j.kind === 'extract_cv')) throw new AppError('NOT_FOUND', 404, 'Not found.');
    if (viewer.actor.userType === 'client') throw new AppError('NOT_FOUND', 404, 'Not found.');
    return { id: j.id, status: j.status, errorCode: j.errorCode };
  }) },
];

export function matchRoute(method: string, segs: string[]) {
  for (const r of ROUTES) {
    if (r.method !== method) continue;
    const parts = r.path.split('/');
    if (parts.length !== segs.length) continue;
    const p: Record<string, string> = {};
    let ok = true;
    for (let i = 0; i < parts.length; i++) {
      if (parts[i].startsWith(':')) p[parts[i].slice(1)] = decodeURIComponent(segs[i]);
      else if (parts[i] !== segs[i]) { ok = false; break; }
    }
    if (ok) return { r, p };
  }
  return null;
}

export { roleScopedRef, clientUserIds, DEFAULT_OFFER };
