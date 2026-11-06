import { and, asc, desc, eq, inArray, ne } from 'drizzle-orm';
import { conversations, checkInQuestions, checkInAnswers, evidenceItems, files, candidates } from '../db/schema';
import { conflict, invalid, notFound } from '../lib/errors';
import { TOPIC_BANK, TOPIC_SEQUENCE, PROMPT_VERSION } from '../ai/prompts';
import { aiMode } from '../ai';
import { prototype } from '../../config/prototype';
import { lockCandidates, type Ctx } from './context';
import { candidateIdOf } from './candidates';
import { enqueue } from './jobs';
import { logActivity } from './audit';

const MAX_CORE = 6;
const MAX_CLARIFY = 2;
const MAX_CHECKIN = 3;

async function convForCandidate(ctx: Ctx, conversationId: string, lock = false) {
  const id = candidateIdOf(ctx);
  const q = ctx.tx.select().from(conversations).where(and(eq(conversations.id, conversationId), eq(conversations.candidateId, id)));
  const [c] = lock ? await q.for('update') : await q;
  if (!c) throw notFound();
  return c;
}

/** The server decides topic and session length. The model only phrases the question. */
async function nextTopic(ctx: Ctx, conv: typeof conversations.$inferSelect): Promise<string | null> {
  const qs = await ctx.tx.select().from(checkInQuestions).where(eq(checkInQuestions.conversationId, conv.id));
  const max = conv.kind === 'initial_screening' ? MAX_CORE + MAX_CLARIFY : MAX_CHECKIN;
  if (qs.length >= max) return null;
  const asked = new Set(qs.map((q) => q.topic));
  const approved = await ctx.tx.select({ tags: evidenceItems.tags, strength: evidenceItems.strength }).from(evidenceItems).where(and(eq(evidenceItems.candidateId, conv.candidateId), inArray(evidenceItems.reviewState, ['candidate_approved', 'consultant_verified'])));
  const hasSpecific = approved.some((e) => e.strength === 'specific');
  for (const t of TOPIC_SEQUENCE) {
    if (asked.has(t)) continue;
    if (t === 'outcome' && hasSpecific) continue; // already supported by an approved specific example
    return t;
  }
  const clarifications = qs.filter((q) => q.topic === 'clarification').length;
  if (conv.kind === 'initial_screening' && clarifications < MAX_CLARIFY) return 'clarification';
  return null;
}

/** Saves the next question before it is displayed. Fixture mode uses the topic bank; live phrasing runs in the request with a bank fallback. */
async function addQuestion(ctx: Ctx, conv: typeof conversations.$inferSelect) {
  const topic = await nextTopic(ctx, conv);
  if (!topic) return null;
  let text = TOPIC_BANK[topic];
  let reason = 'A specific example helps employers understand what you did.';
  if (aiMode() === 'live') {
    // Live phrasing is requested by the route after commit (no network call while locks are held).
    reason = 'live_pending';
  }
  const [{ n }] = [{ n: conv.questionCount }];
  const [q] = await ctx.tx.insert(checkInQuestions).values({ datasetId: ctx.datasetId, conversationId: conv.id, ordinal: n + 1, questionText: text, topic: topic as never, reason }).returning();
  await ctx.tx.update(conversations).set({ questionCount: n + 1, updatedAt: new Date() }).where(eq(conversations.id, conv.id));
  return q;
}

export async function startConversation(ctx: Ctx, kind: 'initial_screening' | 'check_in') {
  const id = candidateIdOf(ctx);
  await lockCandidates(ctx.tx, [id]);
  const [active] = await ctx.tx.select().from(conversations).where(and(eq(conversations.candidateId, id), eq(conversations.kind, kind), ne(conversations.status, 'completed')));
  if (active) {
    if (active.status === 'paused') await ctx.tx.update(conversations).set({ status: 'active', updatedAt: new Date() }).where(eq(conversations.id, active.id));
    return active;
  }
  if (kind === 'initial_screening') {
    const [done] = await ctx.tx.select({ id: conversations.id }).from(conversations).where(and(eq(conversations.candidateId, id), eq(conversations.kind, 'initial_screening')));
    if (done) throw conflict('INITIAL_DONE', 'Your first conversation is complete. Start a check-in to add more.');
  }
  const [cv] = await ctx.tx.select({ id: files.id }).from(files).where(and(eq(files.candidateId, id), eq(files.purpose, 'cv'), eq(files.uploadState, 'ready'))).orderBy(desc(files.createdAt)).limit(1);
  const [conv] = await ctx.tx.insert(conversations).values({ datasetId: ctx.datasetId, candidateId: id, kind, status: 'active', initialCvFileId: cv?.id ?? null, provider: aiMode() === 'live' ? 'anthropic' : 'fixture', promptVersion: PROMPT_VERSION }).returning();
  await addQuestion(ctx, conv);
  await logActivity(ctx, { subjectType: 'conversation', subjectId: conv.id, action: 'conversation.started', metadata: { kind } });
  return conv;
}

export async function getConversation(ctx: Ctx, conversationId: string) {
  const conv = await convForCandidate(ctx, conversationId);
  const qs = await ctx.tx.select().from(checkInQuestions).where(eq(checkInQuestions.conversationId, conv.id)).orderBy(asc(checkInQuestions.ordinal));
  const ans = qs.length ? await ctx.tx.select().from(checkInAnswers).where(and(inArray(checkInAnswers.questionId, qs.map((q) => q.id)), eq(checkInAnswers.status, 'submitted'))) : [];
  return { conversation: conv, questions: qs.map((q) => ({ ...q, answer: ans.find((a) => a.questionId === q.id) ?? null })) };
}

/** Each Send saves the answer before the next question is requested. A retry never creates a second answer. */
export async function submitAnswer(ctx: Ctx, conversationId: string, questionId: string, body: string) {
  if (!body.trim()) throw invalid('Write an answer or choose Skip question.');
  if (body.length > prototype.maxAnswerChars) throw invalid(`Answers can be up to ${prototype.maxAnswerChars} characters.`);
  const conv = await convForCandidate(ctx, conversationId, true);
  if (conv.status === 'completed') throw conflict('CONVERSATION_COMPLETE', 'This conversation is complete.');
  const [q] = await ctx.tx.select().from(checkInQuestions).where(and(eq(checkInQuestions.id, questionId), eq(checkInQuestions.conversationId, conv.id))).for('update');
  if (!q) throw notFound();
  const [existing] = await ctx.tx.select().from(checkInAnswers).where(and(eq(checkInAnswers.questionId, q.id), eq(checkInAnswers.status, 'submitted')));
  if (existing) {
    if (existing.body === body) return { answer: existing, next: await currentUnanswered(ctx, conv.id) };
    await ctx.tx.update(checkInAnswers).set({ status: 'withdrawn', updatedAt: new Date() }).where(eq(checkInAnswers.id, existing.id));
    await ctx.tx.update(evidenceItems).set({ reviewState: 'superseded', updatedAt: new Date() }).where(and(eq(evidenceItems.sourceAnswerId, existing.id), ne(evidenceItems.reviewState, 'rejected')));
  }
  const [a] = await ctx.tx.insert(checkInAnswers).values({ datasetId: ctx.datasetId, questionId: q.id, candidateId: conv.candidateId, body, status: 'submitted', submittedAt: ctx.now, replacesAnswerId: existing?.id ?? null }).returning();
  await ctx.tx.update(checkInQuestions).set({ state: 'answered', updatedAt: new Date() }).where(eq(checkInQuestions.id, q.id));
  const next = (await currentUnanswered(ctx, conv.id)) ?? (await addQuestion(ctx, conv));
  return { answer: a, next };
}

async function currentUnanswered(ctx: Ctx, conversationId: string) {
  const [q] = await ctx.tx.select().from(checkInQuestions).where(and(eq(checkInQuestions.conversationId, conversationId), eq(checkInQuestions.state, 'unanswered'))).orderBy(asc(checkInQuestions.ordinal)).limit(1);
  return q ?? null;
}

export async function skipQuestion(ctx: Ctx, conversationId: string, questionId: string) {
  const conv = await convForCandidate(ctx, conversationId, true);
  await ctx.tx.update(checkInQuestions).set({ state: 'skipped', updatedAt: new Date() }).where(and(eq(checkInQuestions.id, questionId), eq(checkInQuestions.conversationId, conv.id), eq(checkInQuestions.state, 'unanswered')));
  return (await currentUnanswered(ctx, conv.id)) ?? (await addQuestion(ctx, conv));
}

export async function pauseConversation(ctx: Ctx, conversationId: string) {
  const conv = await convForCandidate(ctx, conversationId, true);
  if (conv.status === 'active') await ctx.tx.update(conversations).set({ status: 'paused', updatedAt: new Date() }).where(eq(conversations.id, conv.id));
}

/** Finish queues one deduplicated profile-building job from submitted answers only. */
export async function finishConversation(ctx: Ctx, conversationId: string) {
  const conv = await convForCandidate(ctx, conversationId, true);
  const qs = await ctx.tx.select({ id: checkInQuestions.id }).from(checkInQuestions).where(eq(checkInQuestions.conversationId, conv.id));
  const ans = qs.length ? await ctx.tx.select({ id: checkInAnswers.id }).from(checkInAnswers).where(and(inArray(checkInAnswers.questionId, qs.map((q) => q.id)), eq(checkInAnswers.status, 'submitted'))) : [];
  if (!ans.length) throw invalid('Answer at least one question before finishing.');
  await ctx.tx.update(conversations).set({ status: 'completed', completedAt: ctx.now, updatedAt: new Date() }).where(eq(conversations.id, conv.id));
  const [cand] = await ctx.tx.select().from(candidates).where(eq(candidates.id, conv.candidateId));
  const job = await enqueue(ctx, 'build_profile', conv.candidateId, `build_profile:${conv.id}`, { conversationId: conv.id });
  await logActivity(ctx, { subjectType: 'conversation', subjectId: conv.id, action: 'conversation.finished', metadata: { answers: ans.length } });
  return { jobId: job.id, candidateRef: cand.publicRef };
}
