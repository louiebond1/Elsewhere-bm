import 'server-only';
import { and, asc, desc, eq, inArray } from 'drizzle-orm';
import { conversations, checkInQuestions, checkInAnswers, evidenceItems, candidates } from '../db/schema';
import { prototype } from '../../config/prototype';
import { withTx, type BaseCtx, type Ctx } from '../services/context';
import { logActivity } from '../services/audit';
import { rateLimitHit } from '../auth';
import { isUuid } from '../lib/ids';

/**
 * The connector endpoint for a candidate's own AI assistant (Claude or ChatGPT), speaking MCP over HTTP
 * (JSON responses, stateless). Three narrow tools, all limited to the signed-in candidate's own data.
 * Nothing here submits: drafts wait for the candidate to check them and press Send in Elsewhere.
 */
export const PROTOCOL_VERSIONS = ['2025-06-18', '2025-03-26', '2024-11-05'];
const INSTRUCTIONS = 'You are helping a job seeker with their Elsewhere profile. Use get_my_unanswered_questions, then help them answer in their own words with real examples: what they did and what happened. Use what you genuinely know about them, but never invent experience, employers, names, numbers or dates; ask them if unsure. Save each answer with save_draft_answer. Drafts are not sent: the person checks and sends them in Elsewhere. Do not include anyone else\'s personal details.';

type Tool = { name: string; description: string; scope: string; inputSchema: Record<string, unknown>; annotations: Record<string, unknown> };
const TOOLS: Tool[] = [
  { name: 'get_my_unanswered_questions', scope: 'questions:read', description: 'List the questions this person has not answered yet in Elsewhere, with any draft already saved for each.', inputSchema: { type: 'object', properties: {}, additionalProperties: false }, annotations: { readOnlyHint: true, title: 'My unanswered questions' } },
  { name: 'get_my_profile', scope: 'profile:read', description: 'Get this person\'s own approved examples and job preferences in Elsewhere, to avoid repeating what they have already said.', inputSchema: { type: 'object', properties: {}, additionalProperties: false }, annotations: { readOnlyHint: true, title: 'My profile' } },
  { name: 'save_draft_answer', scope: 'drafts:write', description: 'Save a draft answer to one unanswered question. It is NOT sent: the person reviews it and presses Send in Elsewhere. Saving again replaces the previous draft for that question.', inputSchema: { type: 'object', properties: { question_id: { type: 'string', description: 'The id from get_my_unanswered_questions' }, answer: { type: 'string', description: `The answer, in the person's own words, up to ${prototype.maxAnswerChars} characters.` } }, required: ['question_id', 'answer'], additionalProperties: false }, annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, title: 'Save a draft answer' } },
];

type Rpc = { jsonrpc?: string; id?: string | number | null; method?: string; params?: Record<string, unknown> };
const ok = (id: Rpc['id'], result: unknown) => ({ jsonrpc: '2.0', id: id ?? null, result });
const fail = (id: Rpc['id'], code: number, message: string) => ({ jsonrpc: '2.0', id: id ?? null, error: { code, message } });
const text = (t: string, structured?: unknown, isError = false) => ({ content: [{ type: 'text', text: t }], ...(structured !== undefined ? { structuredContent: structured } : {}), ...(isError ? { isError: true } : {}) });

async function unanswered(ctx: Ctx) {
  const candidateId = (ctx.actor as { candidateId: string }).candidateId;
  const convs = await ctx.tx.select().from(conversations).where(and(eq(conversations.candidateId, candidateId), eq(conversations.status, 'active')));
  if (!convs.length) return [];
  const qs = await ctx.tx.select().from(checkInQuestions).where(and(inArray(checkInQuestions.conversationId, convs.map((c) => c.id)), eq(checkInQuestions.state, 'unanswered'))).orderBy(asc(checkInQuestions.ordinal));
  const drafts = qs.length ? await ctx.tx.select().from(checkInAnswers).where(and(inArray(checkInAnswers.questionId, qs.map((q) => q.id)), eq(checkInAnswers.status, 'draft'))).orderBy(desc(checkInAnswers.updatedAt)) : [];
  return qs.map((q) => ({ question_id: q.id, question: q.questionText, topic: q.topic, conversation: convs.find((c) => c.id === q.conversationId)?.kind === 'initial_screening' ? 'first conversation' : 'check-in', draft: drafts.find((d) => d.questionId === q.id)?.body ?? null }));
}

async function profile(ctx: Ctx) {
  const candidateId = (ctx.actor as { candidateId: string }).candidateId;
  const [c] = await ctx.tx.select().from(candidates).where(eq(candidates.id, candidateId));
  const ev = await ctx.tx.select({ claim: evidenceItems.claimPrivate, tags: evidenceItems.tags, state: evidenceItems.reviewState }).from(evidenceItems).where(and(eq(evidenceItems.candidateId, candidateId), inArray(evidenceItems.reviewState, ['candidate_approved', 'consultant_verified'])));
  return { approved_examples: ev.map((e) => ({ example: e.claim, skills: e.tags })), preferences: { role_families: c?.preferredRoleFamilies ?? [], work_modes: c?.workModes ?? [], minimum_salary_pounds: c?.minSalaryPence ? Number(c.minSalaryPence) / 100 : null } };
}

async function saveDraft(ctx: Ctx, args: Record<string, unknown>) {
  const candidateId = (ctx.actor as { candidateId: string }).candidateId;
  const qid = typeof args.question_id === 'string' ? args.question_id : '';
  const body = typeof args.answer === 'string' ? args.answer.trim() : '';
  if (!isUuid(qid)) return text('That question id is not valid. Call get_my_unanswered_questions for current ids.', undefined, true);
  if (!body) return text('The answer is empty.', undefined, true);
  if (body.length > prototype.maxAnswerChars) return text(`The answer is too long: up to ${prototype.maxAnswerChars} characters.`, undefined, true);
  const [q] = await ctx.tx.select({ q: checkInQuestions, c: conversations }).from(checkInQuestions).innerJoin(conversations, eq(conversations.id, checkInQuestions.conversationId)).where(eq(checkInQuestions.id, qid)).for('update');
  // Another person's question looks exactly like a missing one.
  if (!q || q.c.candidateId !== candidateId) return text('That question was not found. Call get_my_unanswered_questions for current ids.', undefined, true);
  if (q.c.status !== 'active' || q.q.state !== 'unanswered') return text('That question has already been answered or skipped, so no draft was saved.', undefined, true);
  const [existing] = await ctx.tx.select().from(checkInAnswers).where(and(eq(checkInAnswers.questionId, qid), eq(checkInAnswers.status, 'draft')));
  if (existing) await ctx.tx.update(checkInAnswers).set({ body, inputMode: 'imported_assisted', assistance: 'candidate_declared_ai', updatedAt: new Date(), rowVersion: existing.rowVersion + 1 }).where(eq(checkInAnswers.id, existing.id));
  else await ctx.tx.insert(checkInAnswers).values({ datasetId: ctx.datasetId, questionId: qid, candidateId, body, status: 'draft', inputMode: 'imported_assisted', assistance: 'candidate_declared_ai' });
  await logActivity(ctx, { subjectType: 'candidate', subjectId: candidateId, action: 'connector.draft_saved' });
  return text('Saved as a draft. It has not been sent: ask them to open Elsewhere, check it and press Send.', { saved: true, question_id: qid });
}

/** Handles one JSON-RPC message for an authenticated connection. Returns null for notifications. */
export async function handleRpc(msg: Rpc, auth: { base: BaseCtx; grantId: string; scope: string[] }) {
  if (!msg || msg.jsonrpc !== '2.0' || typeof msg.method !== 'string') return fail(msg?.id, -32600, 'Invalid request');
  const isNotification = msg.id === undefined;
  switch (msg.method) {
    case 'initialize': {
      const asked = typeof msg.params?.protocolVersion === 'string' ? msg.params.protocolVersion : PROTOCOL_VERSIONS[0];
      return ok(msg.id, { protocolVersion: PROTOCOL_VERSIONS.includes(asked) ? asked : PROTOCOL_VERSIONS[0], capabilities: { tools: { listChanged: false } }, serverInfo: { name: 'elsewhere', title: 'Elsewhere', version: '1.0.0' }, instructions: INSTRUCTIONS });
    }
    case 'notifications/initialized':
    case 'notifications/cancelled':
      return null;
    case 'ping':
      return ok(msg.id, {});
    case 'tools/list':
      return ok(msg.id, { tools: TOOLS.filter((t) => auth.scope.includes(t.scope)).map(({ scope: _s, ...t }) => t) });
    case 'tools/call': {
      const name = msg.params?.name;
      const tool = TOOLS.find((t) => t.name === name);
      if (!tool) return fail(msg.id, -32602, `Unknown tool: ${String(name)}`);
      if (!auth.scope.includes(tool.scope)) return ok(msg.id, text('This connection was not given permission for that. Reconnect Elsewhere to allow it.', undefined, true));
      if (await rateLimitHit(`connector:${auth.grantId}`, 'connector_call', 1, 60)) return ok(msg.id, text('Too many requests in the last minute. Please wait a moment.', undefined, true));
      const args = (msg.params?.arguments ?? {}) as Record<string, unknown>;
      const result = await withTx(auth.base, async (ctx) => {
        if (tool.name === 'get_my_unanswered_questions') {
          const qs = await unanswered(ctx);
          return text(qs.length ? `${qs.length} unanswered question${qs.length === 1 ? '' : 's'}.\n${JSON.stringify(qs, null, 2)}` : 'No unanswered questions right now. They can start a check-in in Elsewhere to get a new question.', { questions: qs });
        }
        if (tool.name === 'get_my_profile') { const p = await profile(ctx); return text(JSON.stringify(p, null, 2), p); }
        return saveDraft(ctx, args);
      });
      return ok(msg.id, result);
    }
    default:
      return isNotification ? null : fail(msg.id, -32601, `Method not found: ${msg.method}`);
  }
}
