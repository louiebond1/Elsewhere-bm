import 'server-only';
import { and, asc, desc, eq, inArray } from 'drizzle-orm';
import { conversations, checkInQuestions, checkInAnswers, evidenceItems, candidates } from '../db/schema';
import { prototype } from '../../config/prototype';
import { withTx, type BaseCtx, type Ctx } from '../services/context';
import { logActivity } from '../services/audit';
import { rateLimitHit } from '../auth';
import { isUuid } from '../lib/ids';
import { onboardingView, saveAiAnswers, addExtras, rememberForMiniMe, questionsLeft } from '../services/onboarding';
import { MAX_ONBOARDING_ANSWER } from '../../config/onboarding';

/**
 * The connector endpoint for a candidate's own AI assistant (Claude or ChatGPT), speaking MCP over HTTP
 * (JSON responses, stateless). Three narrow tools, all limited to the signed-in candidate's own data.
 * Nothing here submits: drafts wait for the candidate to check them and press Send in Elsewhere.
 */
export const PROTOCOL_VERSIONS = ['2025-06-18', '2025-03-26', '2024-11-05'];
const INSTRUCTIONS = 'You are helping a job seeker with Elsewhere. Always-on mode: in any conversation, when they mention something useful about their work (a skill, a result, a project, how they like to work, what they want next), save it with remember_for_my_mini_me, in batches, without interrupting the flow. Now and then, when it fits naturally, ask one question from next_mini_me_questions. If they ask to build their mini-me, do their onboarding, or be mock-interviewed, use get_my_onboarding_checklist, run it as a friendly mock interview, and save answers in batches with save_onboarding_answers and add_to_my_mini_me. Otherwise help them answer their Elsewhere questions. You probably know them better than Elsewhere does. For each question, FIRST look at what you already know about this person from your memory and earlier conversations, and prefer a real, specific example from there. Then use get_my_profile only to see what is already on their Elsewhere profile, so you can offer something new or better rather than repeating it. If both have something, say briefly which you are using and why. Write in their own voice: what they did and what happened. Never invent experience, employers, names, numbers or dates; if a detail is missing, ask them, and if they don\'t know yet, leave a short gap in square brackets for them to fill in, like [Add what changed]. Show them the draft and get their OK before calling save_draft_answer. Drafts are not sent: the person checks and sends them in Elsewhere. Do not include anyone else\'s personal details.';
const CHECKLIST_HOW = 'Best done as a relaxed mock interview: ask one question at a time, conversationally, like a friendly interviewer (it works well by voice). Skip anything you already know about them from memory, and just confirm it with them in a sentence. Save answers in batches with save_onboarding_answers every five or so answers and at the end, not one at a time. If you cannot save during a voice conversation, keep a running list and save it all in one go as soon as they say save or are back in text. How to fill it in: answer every question you can from what you genuinely remember about this person, in their own voice, without inventing anything. Then ask them, briefly and in batches, about the ones you don\'t know (they can type or talk). Leave a question out rather than guess. Save with save_onboarding_answers (several at a time is fine). Then dig deeper: ask a few friendly follow-up questions about anything interesting (what happened, the result, rough numbers, what they learned), and ask if there is anything else they would like employers to know. More is great. Save those with add_to_my_mini_me. Finally tell them to check and approve everything in Elsewhere. Everything here is used for their interviews, so real detail helps them.';
const MEMORY_FIRST = 'How to help: first check what you remember about this person from earlier chats and use the best real example you know. Use get_my_profile only to avoid repeating what is already on their profile. Ask them for any missing detail (or leave a gap like [Add the result]), show the draft, and save it only once they say OK.';

type Tool = { name: string; description: string; scope: string; inputSchema: Record<string, unknown>; annotations: Record<string, unknown> };
const TOOLS: Tool[] = [
  { name: 'get_my_unanswered_questions', scope: 'questions:read', description: 'List the questions this person has not answered yet in Elsewhere, with any draft already saved for each.', inputSchema: { type: 'object', properties: {}, additionalProperties: false }, annotations: { readOnlyHint: true, title: 'My unanswered questions' } },
  { name: 'get_my_profile', scope: 'profile:read', description: 'Get what is already on this person\'s Elsewhere profile (approved examples and job preferences). Use it to avoid repeating them; prefer a new or better example you know from your own memory of this person.', inputSchema: { type: 'object', properties: {}, additionalProperties: false }, annotations: { readOnlyHint: true, title: 'My profile' } },
  { name: 'get_my_onboarding_checklist', scope: 'questions:read', description: 'Get this person\'s Elsewhere onboarding checklist: about 50 questions in sections, with any answer already saved and whether they have approved it. Use it to fill in the whole checklist in one go on their first day.', inputSchema: { type: 'object', properties: {}, additionalProperties: false }, annotations: { readOnlyHint: true, title: 'My onboarding checklist' } },
  { name: 'save_onboarding_answers', scope: 'drafts:write', description: `Save draft answers to the onboarding checklist, many at once. Each item is a question key from get_my_onboarding_checklist and the answer in the person's own words (up to ${MAX_ONBOARDING_ANSWER} characters). Nothing is sent to employers: the person checks and approves each answer in Elsewhere. Answers they already approved are never overwritten.`, inputSchema: { type: 'object', properties: { answers: { type: 'array', minItems: 1, maxItems: 60, items: { type: 'object', properties: { key: { type: 'string' }, answer: { type: 'string' } }, required: ['key', 'answer'], additionalProperties: false } } }, required: ['answers'], additionalProperties: false }, annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, title: 'Save onboarding answers' } },
  { name: 'add_to_my_mini_me', scope: 'drafts:write', description: `Add anything beyond the checklist to this person's mini-me: answers to your follow-up questions, or extra things they want to share (a project, a result, a skill, a story). Each item has a short topic (the question you asked, or a heading) and the answer in their own words (up to ${MAX_ONBOARDING_ANSWER} characters). Saved as drafts for them to check in Elsewhere.`, inputSchema: { type: 'object', properties: { items: { type: 'array', minItems: 1, maxItems: 30, items: { type: 'object', properties: { topic: { type: 'string' }, answer: { type: 'string' } }, required: ['topic', 'answer'], additionalProperties: false } } }, required: ['items'], additionalProperties: false }, annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, title: 'Add to my mini-me' } },
  { name: 'next_mini_me_questions', scope: 'questions:read', description: 'Always-on mode: get a few of this person\'s Elsewhere questions that nobody has answered yet, to slip into conversation naturally when the moment is right (not every message). Over many chats every question gets covered.', inputSchema: { type: 'object', properties: {}, additionalProperties: false }, annotations: { readOnlyHint: true, title: 'Questions still to ask' } },
  { name: 'remember_for_my_mini_me', scope: 'drafts:write', description: `Always-on mode: save anything useful you learn about this person's work in any conversation (skills, results, projects, how they work, what they want next). Give a short topic and the detail in their own words; if it answers one of their checklist questions, include its question_key. Saved as drafts they check in Elsewhere; approved answers are never overwritten. Batch several items together; never invent anything.`, inputSchema: { type: 'object', properties: { items: { type: 'array', minItems: 1, maxItems: 30, items: { type: 'object', properties: { topic: { type: 'string' }, detail: { type: 'string' }, question_key: { type: 'string' } }, required: ['topic', 'detail'], additionalProperties: false } } }, required: ['items'], additionalProperties: false }, annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, title: 'Remember for my mini-me' } },
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

async function saveDraft(ctx: Ctx, args: Record<string, unknown>, provider: string) {
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
  if (existing) await ctx.tx.update(checkInAnswers).set({ body, inputMode: 'imported_assisted', assistance: 'candidate_declared_ai', aiProvider: provider, updatedAt: new Date(), rowVersion: existing.rowVersion + 1 }).where(eq(checkInAnswers.id, existing.id));
  else await ctx.tx.insert(checkInAnswers).values({ datasetId: ctx.datasetId, questionId: qid, candidateId, body, status: 'draft', inputMode: 'imported_assisted', assistance: 'candidate_declared_ai', aiProvider: provider });
  await logActivity(ctx, { subjectType: 'candidate', subjectId: candidateId, action: 'connector.draft_saved' });
  return text('Saved as a draft. It has not been sent: ask them to open Elsewhere, check it and press Send.', { saved: true, question_id: qid });
}

/** Handles one JSON-RPC message for an authenticated connection. Returns null for notifications. */
export async function handleRpc(msg: Rpc, auth: { base: BaseCtx; grantId: string; scope: string[]; provider?: string }) {
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
          return text(qs.length ? `${qs.length} unanswered question${qs.length === 1 ? '' : 's'}.\n${JSON.stringify(qs, null, 2)}\n\n${MEMORY_FIRST}` : 'No unanswered questions right now. They can start a check-in in Elsewhere to get a new question.', { questions: qs });
        }
        if (tool.name === 'get_my_onboarding_checklist') {
          const v = await onboardingView(ctx);
          const list = v.sections.map((sec) => ({ section: sec.title, questions: sec.questions.map((q) => ({ key: q.key, question: q.text, ...(q.hint ? { hint: q.hint } : {}), answer: q.answer, approved_by_them: q.approved })) }));
          const extras = v.extras.map((e) => ({ topic: e.text, answer: e.answer, approved_by_them: e.approved }));
          return text(`${v.answered} of ${v.total} checklist questions answered, ${v.approved} approved by them. ${extras.length} extra item${extras.length === 1 ? '' : 's'} shared.\n${JSON.stringify({ checklist: list, extras }, null, 2)}\n\n${CHECKLIST_HOW}`, { answered: v.answered, total: v.total, sections: list, extras });
        }
        if (tool.name === 'save_onboarding_answers') {
          const items = Array.isArray(args.answers) ? (args.answers as unknown[]).slice(0, 60).map((a) => ({ key: String((a as { key?: unknown })?.key ?? ''), answer: String((a as { answer?: unknown })?.answer ?? '') })) : [];
          if (!items.length) return text('No answers were given.', undefined, true);
          const r = await saveAiAnswers(ctx, auth.provider ?? 'your AI', items);
          return text(`Saved ${r.saved.length} draft answer${r.saved.length === 1 ? '' : 's'}. Nothing has been sent: ask them to open Elsewhere, check each answer and approve it.${r.skipped.length ? ` Skipped: ${r.skipped.map((x) => `${x.key} (${x.reason})`).join(', ')}.` : ''}`, r);
        }
        if (tool.name === 'next_mini_me_questions') {
          const q = await questionsLeft(ctx);
          return text(q.left ? `${q.left} of ${q.total} questions still to ask. Slip one in naturally when it fits, not every message:\n${JSON.stringify(q.suggestions, null, 2)}\nSave what they say with remember_for_my_mini_me (include the question_key).` : 'Every checklist question has an answer. Keep saving anything new and useful with remember_for_my_mini_me.', q);
        }
        if (tool.name === 'remember_for_my_mini_me') {
          const items = Array.isArray(args.items) ? (args.items as unknown[]).slice(0, 30).map((a) => { const o = (a ?? {}) as { topic?: unknown; detail?: unknown; question_key?: unknown }; return { topic: String(o.topic ?? ''), detail: String(o.detail ?? ''), questionKey: typeof o.question_key === 'string' ? o.question_key : null }; }) : [];
          if (!items.length) return text('Nothing was given to remember.', undefined, true);
          const r = await rememberForMiniMe(ctx, auth.provider ?? 'your AI', items);
          return text(`Saved ${r.savedToChecklist + r.savedAsExtras} thing${r.savedToChecklist + r.savedAsExtras === 1 ? '' : 's'} to their mini-me as drafts (${r.savedToChecklist} checklist, ${r.savedAsExtras} extra). They check them in Elsewhere.${r.skipped.length ? ` Skipped: ${r.skipped.join(', ')}.` : ''}`, r);
        }
        if (tool.name === 'add_to_my_mini_me') {
          const items = Array.isArray(args.items) ? (args.items as unknown[]).slice(0, 30).map((a) => ({ topic: String((a as { topic?: unknown })?.topic ?? ''), answer: String((a as { answer?: unknown })?.answer ?? '') })) : [];
          if (!items.length) return text('Nothing was given to add.', undefined, true);
          const r = await addExtras(ctx, items, { provider: auth.provider ?? 'your AI' });
          return text(`Added ${r.saved.length} item${r.saved.length === 1 ? '' : 's'} to their mini-me as drafts. Nothing has been sent: they check them in Elsewhere.${r.skipped.length ? ` Skipped: ${r.skipped.map((x) => `${x.topic} (${x.reason})`).join(', ')}.` : ''}`, r);
        }
        if (tool.name === 'get_my_profile') { const p = await profile(ctx); return text(`Already on their Elsewhere profile (avoid repeating these; a new or better example from what you remember about them is more useful):\n${JSON.stringify(p, null, 2)}`, p); }
        return saveDraft(ctx, args, auth.provider ?? 'your AI');
      });
      return ok(msg.id, result);
    }
    default:
      return isNotification ? null : fail(msg.id, -32601, `Method not found: ${msg.method}`);
  }
}
