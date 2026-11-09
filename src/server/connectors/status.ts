import 'server-only';
import { and, eq, inArray } from 'drizzle-orm';
import { conversations, checkInQuestions, checkInAnswers } from '../db/schema';
import type { Ctx } from '../services/context';
import { myConnections, issuer } from './oauth';

/** What the candidate needs to see about their own AI helper: is it connected, and is anything waiting for them. */
export async function aiHelperStatus(ctx: Ctx) {
  const candidateId = (ctx.actor as { candidateId: string }).candidateId;
  const convs = await ctx.tx.select({ id: conversations.id }).from(conversations).where(and(eq(conversations.candidateId, candidateId), eq(conversations.status, 'active')));
  const qs = convs.length ? await ctx.tx.select({ id: checkInQuestions.id, conversationId: checkInQuestions.conversationId, text: checkInQuestions.questionText }).from(checkInQuestions).where(and(inArray(checkInQuestions.conversationId, convs.map((c) => c.id)), eq(checkInQuestions.state, 'unanswered'))) : [];
  const drafts = qs.length ? await ctx.tx.select({ questionId: checkInAnswers.questionId }).from(checkInAnswers).where(and(inArray(checkInAnswers.questionId, qs.map((q) => q.id)), eq(checkInAnswers.status, 'draft'), eq(checkInAnswers.assistance, 'candidate_declared_ai'))) : [];
  const drafted = new Set(drafts.map((d) => d.questionId));
  const waiting = qs.filter((q) => drafted.has(q.id)).map((q) => ({ questionId: q.id, conversationId: q.conversationId, question: q.text }));
  const connections = await myConnections(ctx);
  return { connectorUrl: `${issuer()}/mcp`, connections, unanswered: qs.length, waiting };
}
