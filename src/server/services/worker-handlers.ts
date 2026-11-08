import { and, eq, inArray, lte } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import { db } from '../db/client';
import { jobs, files, checkInQuestions, checkInAnswers, conversations, candidates, evidenceItems, introductions, contracts, roles } from '../db/schema';
import { runAi, AiFailure } from '../ai';
import { validateExtraction } from '../ai/validate';
import { extractPdfText, extractDocxText, ExtractionError } from '../lib/extract';
import { storage } from './storage';
import { withTx, getActiveDataset, type BaseCtx } from './context';
import { claimJob } from './jobs';
import { purgeCandidate } from './candidates';
import { notify } from './audit';
import { releaseHoldIfUnneeded } from './roles';
import { londonDateOf } from '../lib/dates';
import { reconcileWallet } from './ledger';
import { assessmentInput, applyAssessment, pairsAwaitingAssessment } from './matching';
import { profileVersions } from '../db/schema';
import { aiRuns } from '../db/schema';
import { handleSendEmail } from '../email';

type JobRow = NonNullable<Awaited<ReturnType<typeof claimJob>>>;

async function handleExtractCv(base: BaseCtx, job: JobRow) {
  const [f] = await db().select().from(files).where(eq(files.id, job.subject_id!));
  if (!f || f.uploadState === 'deleted') return;
  const bytes = await storage().get(f.objectKey);
  let text: string | null = null;
  let err: string | null = null;
  try {
    if (!bytes) throw new ExtractionError('unreadable');
    text = f.mimeType === 'application/pdf' ? await extractPdfText(bytes) : await extractDocxText(bytes);
  } catch (e) {
    err = e instanceof ExtractionError ? e.code : 'unreadable';
  }
  await withTx(base, async (ctx) => {
    const [cur] = await ctx.tx.select().from(files).where(eq(files.id, f.id)).for('update');
    if (!cur || cur.uploadState === 'deleted') return;
    await ctx.tx.update(files).set({ uploadState: err ? 'failed' : 'ready', extractedTextPrivate: text, extractionErrorCode: err, updatedAt: new Date() }).where(eq(files.id, f.id));
  });
}

async function handleBuildProfile(base: BaseCtx, job: JobRow) {
  const candidateId = job.subject_id!;
  const conversationId = String(job.payload.conversationId ?? '');
  if (job.payload.simulateFailureOnce && job.attempts === 1) throw new AiFailure('timeout', 'Demo responses: simulated timeout', false);
  const [cand] = await db().select().from(candidates).where(eq(candidates.id, candidateId));
  if (!cand || cand.status === 'deleting' || cand.status === 'deleted') return;
  const qs = await db().select({ id: checkInQuestions.id }).from(checkInQuestions).where(eq(checkInQuestions.conversationId, conversationId));
  const ans = qs.length ? await db().select().from(checkInAnswers).where(and(inArray(checkInAnswers.questionId, qs.map((q) => q.id)), eq(checkInAnswers.status, 'submitted'))) : [];
  const sources: { id: string; kind: 'cv' | 'answer'; text: string }[] = ans.map((a) => ({ id: a.id, kind: 'answer' as const, text: a.body }));
  const [conv] = await db().select().from(conversations).where(eq(conversations.id, conversationId));
  if (conv?.initialCvFileId) {
    const [cv] = await db().select().from(files).where(eq(files.id, conv.initialCvFileId));
    if (cv?.extractedTextPrivate && cv.textConfirmedAt) sources.push({ id: cv.id, kind: 'cv', text: cv.extractedTextPrivate });
  }
  if (!sources.length) return;
  const res = await runAi({ task: 'extract', datasetId: base.datasetId, candidateId, jobId: job.id, input: sources }, (p) => p.extractEvidence({ sources }));
  const v = validateExtraction(res.output, sources);
  await withTx(base, async (ctx) => {
    const [c] = await ctx.tx.select().from(candidates).where(eq(candidates.id, candidateId)).for('update');
    if (!c || c.status === 'deleting' || c.status === 'deleted') return;
    const stillSubmitted = new Set((await ctx.tx.select({ id: checkInAnswers.id }).from(checkInAnswers).where(and(eq(checkInAnswers.candidateId, candidateId), eq(checkInAnswers.status, 'submitted')))).map((r) => r.id));
    const existing = await ctx.tx.select({ a: evidenceItems.sourceAnswerId, f: evidenceItems.sourceFileId }).from(evidenceItems).where(eq(evidenceItems.candidateId, candidateId));
    const done = new Set(existing.flatMap((e) => [e.a, e.f]).filter(Boolean));
    for (const it of v.accepted) {
      const src = sources.find((s) => s.id === it.sourceId)!;
      if (src.kind === 'answer' && !stillSubmitted.has(src.id)) continue; // stale: answer changed since
      if (done.has(src.id)) continue; // idempotent retry
      await ctx.tx.insert(evidenceItems).values({ datasetId: ctx.datasetId, candidateId, sourceKind: src.kind, sourceAnswerId: src.kind === 'answer' ? src.id : null, sourceFileId: src.kind === 'cv' ? src.id : null, sourceQuotePrivate: it.quote, claimPrivate: it.claim, safeClaim: it.safeClaim || null, tags: it.tags, outcomeText: it.outcome, uncertainty: it.uncertainty, strength: it.strength, reviewState: 'draft', anonymityReview: 'pending', provider: res.provider });
    }
    for (const cf of v.conflicts) {
      await ctx.tx.insert(evidenceItems).values({ datasetId: ctx.datasetId, candidateId, sourceKind: 'answer', sourceAnswerId: sources.find((s) => s.kind === 'answer' && cf.sourceIds.includes(s.id))?.id ?? null, sourceQuotePrivate: '', claimPrivate: `Conflict to clarify: ${cf.description}`, safeClaim: null, tags: [], uncertainty: cf.description, strength: 'assertion', reviewState: 'draft', anonymityReview: 'pending', provider: res.provider });
    }
    await notify(ctx, [c.userId], { type: 'profile_ready', subjectRefType: 'candidate', subjectRefId: candidateId, safeTitle: 'Your draft evidence is ready to review' });
  });
}

/** Expires due pending intros and contracts on the business clock. */
async function handleExpiry(base: BaseCtx) {
  await withTx(base, async (ctx) => {
    const due = await ctx.tx.select().from(introductions).where(and(eq(introductions.datasetId, ctx.datasetId), eq(introductions.state, 'pending'), lte(introductions.expiresAt, ctx.now)));
    for (const d of due) {
      await ctx.tx.update(introductions).set({ state: 'expired', updatedAt: new Date() }).where(eq(introductions.id, d.id));
      await releaseHoldIfUnneeded(ctx, d.roleId);
    }
    const today = londonDateOf(ctx.now);
    const exp = await ctx.tx.select().from(contracts).where(and(eq(contracts.datasetId, ctx.datasetId), eq(contracts.status, 'active')));
    for (const c of exp.filter((x) => x.endDate < today)) {
      await ctx.tx.update(contracts).set({ status: 'expired', updatedAt: new Date() }).where(eq(contracts.id, c.id));
      const rs = await ctx.tx.select({ id: roles.id }).from(roles).where(eq(roles.clientId, c.clientId));
      for (const r of rs) {
        await ctx.tx.update(introductions).set({ state: 'cancelled', updatedAt: new Date() }).where(and(eq(introductions.roleId, r.id), eq(introductions.state, 'pending')));
        await releaseHoldIfUnneeded(ctx, r.id, true);
      }
    }
  });
}

/** Live assessment for a role: one model call per pair awaiting it, outside any lock, then a validated write. */
async function handleAssessRole(base: BaseCtx, job: JobRow) {
  const roleId = job.subject_id!;
  const pending = await pairsAwaitingAssessment({ tx: db() }, roleId);
  let failures = 0;
  for (const candidateId of pending.slice(0, 40)) {
    const prepared = await assessmentInput({ tx: db() }, roleId, candidateId);
    if (!prepared || !prepared.input.evidence.length) continue;
    try {
      const res = await runAi({ task: 'assess', datasetId: base.datasetId, roleId, candidateId, jobId: job.id, input: prepared.input }, (p) => p.assessCriteria(prepared.input));
      const out = await withTx(base, (ctx) => applyAssessment(ctx, { roleId, candidateId, profileVersionId: prepared.profileVersionId, roleVersion: prepared.roleVersion, output: res.output }));
      if (!out.applied && out.reason === 'stale_discarded') await db().insert(aiRuns).values({ datasetId: base.datasetId, jobId: job.id, roleId, candidateId, task: 'assess', provider: res.provider, modelId: res.usage.modelId, promptVersion: 'prompts-v1', outcome: 'stale_discarded' });
    } catch (e) {
      failures++;
      // Budget or authentication problems stop the job; the deterministic result stays in place.
      if (e instanceof AiFailure && ['daily_budget', 'auth', 'model_unavailable'].includes(e.code)) throw e;
    }
  }
  if (failures && failures === pending.length) throw new AiFailure('assessment_failed', 'No assessments could be completed.', true);
}

/** Live developmental feedback, stored separately from the immutable approved profile content. */
async function handleFeedback(base: BaseCtx, job: JobRow) {
  const pvId = String(job.payload.profileVersionId ?? '');
  const [pv] = await db().select().from(profileVersions).where(eq(profileVersions.id, pvId));
  if (!pv || pv.reviewState !== 'approved') return;
  const ev = (await db().select().from(evidenceItems).where(and(eq(evidenceItems.candidateId, pv.candidateId), inArray(evidenceItems.id, pv.evidenceIds)))).filter((e) => e.safeClaim);
  const input = { evidence: ev.map((e) => ({ id: e.id, safeClaim: e.safeClaim!, tags: e.tags, strength: e.strength })) };
  const res = await runAi({ task: 'feedback', datasetId: base.datasetId, candidateId: pv.candidateId, jobId: job.id, input }, (p) => p.feedback(input));
  const ids = new Set(ev.map((e) => e.id));
  // Every strength must cite this profile's own evidence; anything else is dropped rather than repaired.
  const strengths = res.output.strengths.filter((x) => x.evidenceIds.length && x.evidenceIds.every((i) => ids.has(i)));
  await withTx(base, async (ctx) => {
    const [cur] = await ctx.tx.select({ s: profileVersions.reviewState }).from(profileVersions).where(eq(profileVersions.id, pvId)).for('update');
    if (cur?.s !== 'approved') return;
    await ctx.tx.update(profileVersions).set({ feedbackLive: { strengths, gaps: res.output.gaps, nextQuestion: res.output.nextQuestion, provider: res.provider, model: res.usage.modelId } }).where(eq(profileVersions.id, pvId));
  });
}

export async function runJob(base: BaseCtx, job: JobRow) {
  switch (job.kind) {
    case 'extract_cv': return handleExtractCv(base, job);
    case 'build_profile': return handleBuildProfile(base, job);
    case 'delete_candidate': return withTx(base, (ctx) => purgeCandidate(ctx, job.subject_id!).then(() => undefined));
    case 'expire_intros': return handleExpiry(base);
    case 'assess_match': return handleAssessRole(base, job);
    case 'generate_feedback': return handleFeedback(base, job);
    case 'send_email': return handleSendEmail(base, job.subject_id!);
    case 'reconcile_wallet': return withTx(base, (ctx) => reconcileWallet(ctx, job.subject_id!).then(() => undefined));
    default: return;
  }
}

/** Claims and runs one job. Returns false when the queue is empty. */
export async function processOne(workerId: string): Promise<boolean> {
  const ds = await getActiveDataset();
  if (!ds || ds.maintenance) return false;
  const job = await claimJob(db(), workerId, ds.id);
  if (!job) return false;
  const base: BaseCtx = { datasetId: ds.id, generation: ds.generation, now: ds.businessNow ?? new Date(), actor: { kind: 'system', label: 'worker' } };
  try {
    await runJob(base, job);
    await db().update(jobs).set({ status: 'succeeded', lockedBy: null, leaseExpiresAt: null, errorCode: null, updatedAt: new Date() }).where(eq(jobs.id, job.id));
  } catch (e) {
    const code = e instanceof AiFailure ? e.code : e instanceof ExtractionError ? e.code : 'job_error';
    const retryable = e instanceof AiFailure ? e.retryable : !(e instanceof ExtractionError);
    const again = retryable && job.attempts < 3;
    await db().update(jobs).set({ status: again ? 'queued' : 'failed', availableAt: new Date(Date.now() + job.attempts * 5000 + Math.floor(Math.random() * 1000)), lockedBy: null, leaseExpiresAt: null, errorCode: code, updatedAt: new Date() }).where(eq(jobs.id, job.id));
    if (process.env.LOG_LEVEL === 'debug') console.error(`[worker] job ${job.kind} failed: ${code}`);
  }
  return true;
}

/** Test and demo helper: drain the queue in this process. */
export async function drainJobs(max = 50) {
  const id = `inline-${randomUUID()}`;
  for (let i = 0; i < max; i++) if (!(await processOne(id))) break;
}
