import 'server-only';
import { and, eq, inArray } from 'drizzle-orm';
import { conversations, checkInQuestions, checkInAnswers } from '../db/schema';
import { requireUser, type Ctx } from '../services/context';
import { notFound } from '../lib/errors';
import { isUuid } from '../lib/ids';
import { myConnections, providerName } from './oauth';

/** Which AI the candidate has connected (most recent first), or null. */
export async function connectedAi(ctx: Ctx) {
  const c = await myConnections(ctx);
  return c.length ? providerName(c[0].name) : null;
}

async function ownQuestion(ctx: Ctx, questionId: string) {
  const a = requireUser(ctx.actor, 'candidate');
  if (!isUuid(questionId)) throw notFound();
  const [q] = await ctx.tx.select({ q: checkInQuestions, c: conversations }).from(checkInQuestions).innerJoin(conversations, eq(conversations.id, checkInQuestions.conversationId)).where(eq(checkInQuestions.id, questionId));
  if (!q || q.c.candidateId !== (a as { candidateId?: string }).candidateId) throw notFound();
  return q;
}

/** The AI draft waiting on one question, if any. Never the submitted answer. */
export async function questionDraft(ctx: Ctx, questionId: string) {
  const q = await ownQuestion(ctx, questionId);
  const [d] = await ctx.tx.select().from(checkInAnswers).where(and(eq(checkInAnswers.questionId, q.q.id), eq(checkInAnswers.status, 'draft')));
  return {
    answered: q.q.state !== 'unanswered',
    draft: d ? { body: d.body, provider: d.aiProvider ?? 'your AI', updatedAt: d.updatedAt.toISOString() } : null,
    connected: await connectedAi(ctx),
  };
}

/** Discard: the draft goes; whatever the person typed is untouched. */
export async function discardDraft(ctx: Ctx, questionId: string) {
  const q = await ownQuestion(ctx, questionId);
  await ctx.tx.update(checkInAnswers).set({ status: 'withdrawn', updatedAt: new Date() }).where(and(eq(checkInAnswers.questionId, q.q.id), eq(checkInAnswers.status, 'draft')));
  return { discarded: true };
}

/** For the header inbox: AI drafts waiting for this person to check. */
export async function draftsWaiting(ctx: Ctx) {
  const a = requireUser(ctx.actor, 'candidate');
  const candidateId = (a as { candidateId?: string }).candidateId;
  if (!candidateId) return 0;
  const convs = await ctx.tx.select({ id: conversations.id }).from(conversations).where(and(eq(conversations.candidateId, candidateId), eq(conversations.status, 'active')));
  if (!convs.length) return 0;
  const qs = await ctx.tx.select({ id: checkInQuestions.id }).from(checkInQuestions).where(and(inArray(checkInQuestions.conversationId, convs.map((c) => c.id)), eq(checkInQuestions.state, 'unanswered')));
  if (!qs.length) return 0;
  const d = await ctx.tx.select({ id: checkInAnswers.id }).from(checkInAnswers).where(and(inArray(checkInAnswers.questionId, qs.map((q) => q.id)), eq(checkInAnswers.status, 'draft')));
  return d.length;
}
