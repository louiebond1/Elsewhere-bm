import 'server-only';
import { and, asc, desc, eq, inArray } from 'drizzle-orm';
import { conversations, checkInQuestions, checkInAnswers, evidenceItems, candidates, candidateIdentity, files, onboardingAnswers } from '../db/schema';
import { prototype } from '../../config/prototype';
import { withTx, type BaseCtx, type Ctx } from '../services/context';
import { logActivity } from '../services/audit';
import { rateLimitHit } from '../auth';
import { isUuid } from '../lib/ids';
import { onboardingView, saveAiAnswers, addExtras, rememberForMiniMe, questionsLeft } from '../services/onboarding';
import { myInterviews, myInterview } from '../services/candidate-interviews';
import { MAX_ONBOARDING_ANSWER, ONBOARDING_QUESTIONS } from '../../config/onboarding';
import { count } from 'drizzle-orm';

/**
 * The connector endpoint for a candidate's own AI assistant (Claude or ChatGPT), speaking MCP over HTTP
 * (JSON responses, stateless). Three narrow tools, all limited to the signed-in candidate's own data.
 * Nothing here submits: drafts wait for the candidate to check them and press Send in Elsewhere.
 */
export const PROTOCOL_VERSIONS = ['2025-06-18', '2025-03-26', '2024-11-05'];
/**
 * Memory-first stays, but it is never hidden: whatever their AI saves from its own memory is reported
 * plainly, and nothing saved in this conversation is ever called "already saved". Exported for tests.
 */
export const TRANSPARENCY_RULE = 'BE OPEN ABOUT WHAT YOU SAVE: whenever you save anything from your own memory of this person (rather than something they just told you), tell them plainly straight after: list what you saved, say it came from your memory of earlier chats, and that they can remove any item on their Elsewhere Mini-me page. Never call something you saved in this conversation "already saved": only items listed in an Elsewhere tool result before your save are already saved (each result starts "Account: name. Saved so far: N"), and your saves come back as "Saved just now: ...".';
const INSTRUCTIONS = `You are helping a job seeker with Elsewhere. When building their profile, start with get_my_cv: their CV is where the questions begin (go through each job and achievement for the real detail). Also call get_my_profile: if job_preferences says NOT SET YET, ask about the jobs they want and save it with update_my_job_preferences. If they ask you to review their interviews, call review_my_recent_interviews and coach them through improving the answers. IMPORTANT: save as you go. After every two or three answers, call remember_for_my_mini_me (or save_onboarding_answers) and tell them briefly, e.g. "Saved 3 things to Elsewhere". Never wait until the end: if the chat stops, unsaved answers are lost. If they say save, save everything not yet saved straight away. When they say anything like "build up my profile", "work on my mini-me", "interview me" or "get to know me", call next_mini_me_questions (or get_my_onboarding_checklist for the full picture) and start a relaxed conversation that fills the gaps. Ask in natural, clever ways rather than reading questions out: for example "been anywhere interesting with work?" can uncover travel, a project, a disagreement and how they handled it. Be direct when that is clearer. You can go beyond the listed questions. next_mini_me_questions includes an adaptive follow-up agenda from Elsewhere. Prioritise relevant follow-ups, use your conversation context to word them naturally and ask ONE at a time. Follow the answer rather than reading a fixed script. Distinguish clues from facts: do not save assumed hardship, resilience, first-job status or personal contribution. Confirm them with the person. For a follow-up with targetKey, save under that checklist key if unanswered. Otherwise save it as an extra with the exact question (first 200 characters) as its topic so Elsewhere can avoid repeats. If they ask what you want to know about them, tell them a few of the missing topics in a friendly way. When one thing they say covers several topics, split it into separate items (each under its matching question_key where one fits, otherwise its own topic) and save them all in a single remember_for_my_mini_me call. Always-on mode: in any conversation, when they mention something useful about their work (a skill, a result, a project, how they like to work, what they want next), save it with remember_for_my_mini_me, in batches, without interrupting the flow. Now and then, when it fits naturally, ask one question from next_mini_me_questions. If they ask to build their mini-me, do their onboarding, or be mock-interviewed, use get_my_onboarding_checklist, run it as a friendly mock interview, and save answers in batches with save_onboarding_answers and add_to_my_mini_me. Otherwise help them answer their Elsewhere questions. You probably know them better than Elsewhere does. For each question, FIRST look at what you already know about this person from your memory and earlier conversations, and prefer a real, specific example from there. Then use get_my_profile only to see what is already on their Elsewhere profile, so you can offer something new or better rather than repeating it. If both have something, say briefly which you are using and why. Write in their own voice: what they did and what happened. Never invent experience, employers, names, numbers or dates; if a detail is missing, ask them, and if they don\'t know yet, leave a short gap in square brackets for them to fill in, like [Add what changed]. Show them the draft and get their OK before calling save_draft_answer. Drafts are not sent: the person checks and sends them in Elsewhere. Do not include anyone else\'s personal details. ${TRANSPARENCY_RULE}`;
const CHECKLIST_HOW = `Best done as a relaxed mock interview: ask one question at a time, conversationally, like a friendly interviewer (it works well by voice). Skip anything you already know about them from memory, and just confirm it with them in a sentence. Save answers in batches with save_onboarding_answers every five or so answers and at the end, not one at a time. If you cannot save during a voice conversation, keep a running list and save it all in one go as soon as they say save or are back in text. How to fill it in: answer every question you can from what you genuinely remember about this person, in their own voice, without inventing anything. Then ask them, briefly and in batches, about the ones you don\'t know (they can type or talk). Leave a question out rather than guess. Save with save_onboarding_answers (several at a time is fine). Then dig deeper: ask a few friendly follow-up questions about anything interesting (what happened, the result, rough numbers, what they learned), and ask if there is anything else they would like employers to know. More is great. Save those with add_to_my_mini_me. Everything you save goes straight into their profile; they can edit or remove anything in Elsewhere. Everything here is used for their interviews, so real detail helps them. ${TRANSPARENCY_RULE}`;
const MEMORY_FIRST = `How to help: first check what you remember about this person from earlier chats and use the best real example you know. Use get_my_profile only to avoid repeating what is already on their profile. Ask them for any missing detail (or leave a gap like [Add the result]), show the draft, and save it only once they say OK. ${TRANSPARENCY_RULE}`;

type Tool = { name: string; description: string; scope: string; inputSchema: Record<string, unknown>; annotations: Record<string, unknown> };
const TOOLS: Tool[] = [
  { name: 'get_my_unanswered_questions', scope: 'questions:read', description: 'List the questions this person has not answered yet in Elsewhere, with any draft already saved for each.', inputSchema: { type: 'object', properties: {}, additionalProperties: false }, annotations: { readOnlyHint: true, title: 'My unanswered questions' } },
  { name: 'get_my_profile', scope: 'profile:read', description: 'Get what is already on this person\'s Elsewhere profile (approved examples and job preferences). Use it to avoid repeating them; prefer a new or better example you know from your own memory of this person.', inputSchema: { type: 'object', properties: {}, additionalProperties: false }, annotations: { readOnlyHint: true, title: 'My profile' } },
  { name: 'get_my_onboarding_checklist', scope: 'questions:read', description: 'Get this person\'s Elsewhere onboarding checklist: a broad interview guide with adaptive follow-ups in sections, with any answer already saved and whether they have approved it. Use it to fill in the whole checklist in one go on their first day.', inputSchema: { type: 'object', properties: {}, additionalProperties: false }, annotations: { readOnlyHint: true, title: 'My onboarding checklist' } },
  { name: 'save_onboarding_answers', scope: 'drafts:write', description: `Save draft answers to the onboarding checklist, many at once. Each item is a question key from get_my_onboarding_checklist and the answer in the person's own words (up to ${MAX_ONBOARDING_ANSWER} characters). Saved straight into their profile (employers never see their name); answers they wrote themselves are never overwritten.`, inputSchema: { type: 'object', properties: { answers: { type: 'array', minItems: 1, maxItems: 60, items: { type: 'object', properties: { key: { type: 'string' }, answer: { type: 'string' } }, required: ['key', 'answer'], additionalProperties: false } } }, required: ['answers'], additionalProperties: false }, annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, title: 'Save onboarding answers' } },
  { name: 'add_to_my_mini_me', scope: 'drafts:write', description: `Add anything beyond the checklist to this person's mini-me: answers to your follow-up questions, or extra things they want to share (a project, a result, a skill, a story). Each item has a short topic (the question you asked, or a heading) and the answer in their own words (up to ${MAX_ONBOARDING_ANSWER} characters). Saved straight into their Elsewhere profile; they can edit or remove anything there.`, inputSchema: { type: 'object', properties: { items: { type: 'array', minItems: 1, maxItems: 30, items: { type: 'object', properties: { topic: { type: 'string' }, answer: { type: 'string' } }, required: ['topic', 'answer'], additionalProperties: false } } }, required: ['items'], additionalProperties: false }, annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, title: 'Add to my mini-me' } },
  { name: 'next_mini_me_questions', scope: 'questions:read', description: 'Always-on mode: get a few of this person\'s Elsewhere questions that nobody has answered yet, to slip into conversation naturally when the moment is right (not every message). Over many chats every question gets covered.', inputSchema: { type: 'object', properties: {}, additionalProperties: false }, annotations: { readOnlyHint: true, title: 'Questions still to ask' } },
  { name: 'remember_for_my_mini_me', scope: 'drafts:write', description: `Always-on mode: save anything useful you learn about this person's work in any conversation (skills, results, projects, how they work, what they want next). Give a short topic and the detail in their own words; if it answers one of their checklist questions, include its question_key. Saved straight into their profile; answers they wrote themselves are never overwritten. Batch several items together; never invent anything.`, inputSchema: { type: 'object', properties: { items: { type: 'array', minItems: 1, maxItems: 30, items: { type: 'object', properties: { topic: { type: 'string' }, detail: { type: 'string' }, question_key: { type: 'string' } }, required: ['topic', 'detail'], additionalProperties: false } } }, required: ['items'], additionalProperties: false }, annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, title: 'Remember for my mini-me' } },
  { name: 'review_my_recent_interviews', scope: 'questions:read', description: 'Get this person\'s recent Elsewhere interviews (done by their mini-me): each job, the questions asked, what their mini-me answered or that it had no answer, and how long they have left to change answers. Use it to review the interviews with them and suggest better or missing answers.', inputSchema: { type: 'object', properties: {}, additionalProperties: false }, annotations: { readOnlyHint: true, title: 'My recent interviews' } },
  { name: 'get_my_cv', scope: 'profile:read', description: 'Read the text of the CV this person uploaded to Elsewhere. Start from it: confirm what it says, then ask about each job and achievement on it to get the real detail (what they did, results, numbers).', inputSchema: { type: 'object', properties: {}, additionalProperties: false }, annotations: { readOnlyHint: true, title: 'My CV' } },
  { name: 'update_my_job_preferences', scope: 'drafts:write', description: 'Save what this person has told you about the jobs they want. These are used to match them to jobs, so only save what they actually said. region: london, hertfordshire, manchester or remote_uk. work_modes: any of onsite, hybrid, remote. role_families: any of finance, operations, commercial. minimum_salary_pounds and notice_weeks are numbers or null if they did not say. right_to_work: confirmed, needs_discussion or unknown. experience: early_career, established, leadership or unknown. over_18: true or false only if they told you (private, only used for jobs that require 18+). role_types_non_negotiable: true only if they say the type of job is a must for them.', inputSchema: { type: 'object', properties: { region: { type: 'string', enum: ['london', 'hertfordshire', 'manchester', 'remote_uk'] }, work_modes: { type: 'array', items: { type: 'string', enum: ['onsite', 'hybrid', 'remote'] }, minItems: 1 }, role_families: { type: 'array', items: { type: 'string', enum: ['finance', 'operations', 'commercial'] }, minItems: 1 }, minimum_salary_pounds: { type: ['integer', 'null'] }, notice_weeks: { type: ['integer', 'null'] }, right_to_work: { type: 'string', enum: ['confirmed', 'needs_discussion', 'unknown'] }, experience: { type: 'string', enum: ['early_career', 'established', 'leadership', 'unknown'] }, over_18: { type: ['boolean', 'null'] }, role_types_non_negotiable: { type: 'boolean' } }, required: ['region', 'work_modes', 'role_families'], additionalProperties: false }, annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, title: 'Update my job preferences' } },
  { name: 'save_draft_answer', scope: 'drafts:write', description: 'Save a draft answer to one unanswered question. It is NOT sent: the person reviews it and presses Send in Elsewhere. Saving again replaces the previous draft for that question.', inputSchema: { type: 'object', properties: { question_id: { type: 'string', description: 'The id from get_my_unanswered_questions' }, answer: { type: 'string', description: `The answer, in the person's own words, up to ${prototype.maxAnswerChars} characters.` } }, required: ['question_id', 'answer'], additionalProperties: false }, annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, title: 'Save a draft answer' } },
];

type Rpc = { jsonrpc?: string; id?: string | number | null; method?: string; params?: Record<string, unknown> };
const ok = (id: Rpc['id'], result: unknown) => ({ jsonrpc: '2.0', id: id ?? null, result });
const fail = (id: Rpc['id'], code: number, message: string) => ({ jsonrpc: '2.0', id: id ?? null, error: { code, message } });
const text = (t: string, structured?: unknown, isError = false) => ({ content: [{ type: 'text', text: t }], ...(structured !== undefined ? { structuredContent: structured } : {}), ...(isError ? { isError: true } : {}) });

const QUESTION_TEXT = new Map(ONBOARDING_QUESTIONS.map((q) => [q.key, q.text]));
const meId = (ctx: Ctx) => (ctx.actor as { candidateId: string }).candidateId;

/** First line of every reply: whose account this is and how much is saved, straight from the database. */
async function accountLine(ctx: Ctx) {
  const [idn] = await ctx.tx.select({ name: candidateIdentity.fullName }).from(candidateIdentity).where(eq(candidateIdentity.candidateId, meId(ctx)));
  const [n] = await ctx.tx.select({ n: count() }).from(onboardingAnswers).where(eq(onboardingAnswers.candidateId, meId(ctx)));
  return `Account: ${idn?.name ?? 'unknown'}. Saved so far: ${n?.n ?? 0}.`;
}

/** "Saved just now: ..." with what each saved item is, so a fresh save is never mistaken for an old one. */
async function savedJustNow(ctx: Ctx, keys: string[]) {
  if (!keys.length) return 'Saved just now: nothing.';
  const rows = await ctx.tx.select({ key: onboardingAnswers.questionKey, topic: onboardingAnswers.questionText, answer: onboardingAnswers.answer }).from(onboardingAnswers).where(and(eq(onboardingAnswers.candidateId, meId(ctx)), inArray(onboardingAnswers.questionKey, keys)));
  const cut = (t: string) => (t.length > 140 ? `${t.slice(0, 140)}…` : t);
  return `Saved just now: ${rows.map((r) => `${r.topic ?? QUESTION_TEXT.get(r.key) ?? r.key} = "${cut(r.answer)}"`).join('; ')}.`;
}

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
  const [idn] = await ctx.tx.select({ name: candidateIdentity.fullName }).from(candidateIdentity).where(eq(candidateIdentity.candidateId, candidateId));
  const prefs = c?.preferencesConfirmed
    ? { region: c.region, work_modes: c.workModes, role_families: c.preferredRoleFamilies, minimum_salary_pounds: c.minSalaryPence ? Number(c.minSalaryPence) / 100 : null, notice_weeks: c.noticeWeeks, right_to_work: c.workAuthorisation, experience: c.experienceBand, over_18: c.over18, role_types_non_negotiable: c.roleFamilyNonNegotiable }
    : 'NOT SET YET: they have never been asked. Ask them where they want to work, office/hybrid/remote, what kind of roles, minimum salary, notice period and right to work, then save it with update_my_job_preferences.';
  return { your_name: idn?.name ?? null, note: 'Their name is private: employers never see it until they accept an introduction.', approved_examples: ev.map((e) => ({ example: e.claim, skills: e.tags })), job_preferences: prefs };
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
  return { ...text('Saved as a draft. It has not been sent: ask them to open Elsewhere, check it and press Send.', { saved: true, question_id: qid }), saved: 'Saved just now: a draft answer (not sent).' };
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
        const r = await runTool(ctx);
        const first = r.content[0];
        if (!r.isError && first) first.text = r.saved ? `${r.saved}\n${await accountLine(ctx)} ${first.text}` : `${await accountLine(ctx)}\n${first.text}`;
        return { content: r.content, ...(r.structuredContent !== undefined ? { structuredContent: r.structuredContent } : {}), ...(r.isError ? { isError: true } : {}) };
      });
      return ok(msg.id, result);

      async function runTool(ctx: Ctx): Promise<ReturnType<typeof text> & { saved?: string; isError?: boolean; structuredContent?: unknown }> {
        if (tool!.name === 'get_my_unanswered_questions') {
          const qs = await unanswered(ctx);
          return text(qs.length ? `${qs.length} unanswered check-in question${qs.length === 1 ? '' : 's'}.\n${JSON.stringify(qs, null, 2)}\n\n${MEMORY_FIRST}` : 'No check-in questions waiting. That is fine: to build up their profile, call next_mini_me_questions and get to know them in a relaxed conversation, saving what you learn with remember_for_my_mini_me.', { questions: qs });
        }
        if (tool!.name === 'get_my_onboarding_checklist') {
          const v = await onboardingView(ctx);
          const list = v.sections.map((sec) => ({ section: sec.title, questions: sec.questions.map((q) => ({ key: q.key, question: q.text, ...(q.hint ? { hint: q.hint } : {}), answer: q.answer, approved_by_them: q.approved })) }));
          const extras = v.extras.map((e) => ({ topic: e.text, answer: e.answer, approved_by_them: e.approved }));
          return text(`${v.answered} of ${v.total} checklist questions answered, ${v.approved} approved by them. ${extras.length} extra item${extras.length === 1 ? '' : 's'} shared.\n${JSON.stringify({ checklist: list, extras }, null, 2)}\n\n${CHECKLIST_HOW}`, { answered: v.answered, total: v.total, sections: list, extras });
        }
        if (tool!.name === 'save_onboarding_answers') {
          const items = Array.isArray(args.answers) ? (args.answers as unknown[]).slice(0, 60).map((a) => ({ key: String((a as { key?: unknown })?.key ?? ''), answer: String((a as { answer?: unknown })?.answer ?? '') })) : [];
          if (!items.length) return text('No answers were given.', undefined, true);
          const r = await saveAiAnswers(ctx, auth.provider ?? 'your AI', items);
          return { ...text(`Saved ${r.saved.length} answer${r.saved.length === 1 ? '' : 's'} straight into their profile. They can edit or remove anything in Elsewhere.${r.skipped.length ? ` Skipped: ${r.skipped.map((x) => `${x.key} (${x.reason})`).join(', ')}.` : ''}`, r), saved: await savedJustNow(ctx, r.saved) };
        }
        if (tool!.name === 'get_my_cv') {
          const candidateId = (ctx.actor as { candidateId: string }).candidateId;
          const [f] = await ctx.tx.select({ text: files.extractedTextPrivate, name: files.originalFilename, at: files.createdAt }).from(files).where(and(eq(files.candidateId, candidateId), eq(files.purpose, 'cv'), eq(files.uploadState, 'ready'))).orderBy(desc(files.createdAt)).limit(1);
          if (!f?.text) return text('They have not uploaded a CV yet (or it could not be read). Suggest they upload one on the CV page in Elsewhere; meanwhile, ask about their work history.', { has_cv: false });
          return text(`Their CV (${f.name}):\n\n${f.text.slice(0, 20000)}\n\nWork through it with them: for each job and achievement, ask what they actually did and what changed, and save what you learn with remember_for_my_mini_me (with question_key where it fits, e.g. current_role, past_roles, qualifications).`, { has_cv: true });
        }
        if (tool!.name === 'update_my_job_preferences') {
          const { updatePreferences } = await import('../services/candidates');
          const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? Math.round(v) : null);
          try {
            await updatePreferences(ctx, { region: args.region, workModes: args.work_modes, roleFamilies: args.role_families, minSalaryPounds: num(args.minimum_salary_pounds) && num(args.minimum_salary_pounds)! > 0 ? num(args.minimum_salary_pounds) : null, noticeWeeks: num(args.notice_weeks), workAuthorisation: args.right_to_work ?? 'unknown', experienceBand: args.experience ?? 'unknown', ...(typeof args.over_18 === 'boolean' || args.over_18 === null ? { over18: args.over_18 } : {}), ...(typeof args.role_types_non_negotiable === 'boolean' ? { roleFamilyNonNegotiable: args.role_types_non_negotiable } : {}) });
          } catch { return text('Those preferences could not be saved. Check the allowed values in the tool description and try again.', undefined, true); }
          return { ...text('Saved their job preferences. Matching now uses them.', { saved: true }), saved: 'Saved just now: their job preferences.' };
        }
        if (tool!.name === 'review_my_recent_interviews') {
          const list = (await myInterviews(ctx)).slice(0, 5);
          const full = await Promise.all(list.map(async (x) => { const d = await myInterview(ctx, x.roleId); return { job: d.title, work: `${d.mode}, ${d.region}`, can_still_change: d.open, change_until: d.deadline, questions: d.answers.map((a) => ({ question: a.question, type: a.kind, ...(a.key ? { question_key: a.key } : {}), mini_me_answered: a.answer ?? null })) }; }));
          return text(full.length ? `${full.length} recent interview${full.length === 1 ? '' : 's'}:\n${JSON.stringify(full, null, 2)}\n\nReview these with them like a friendly coach: point out unanswered questions and weak or vague answers, ask them for the real detail, and suggest stronger answers in their own words (never invent anything). Save improvements with remember_for_my_mini_me: use question_key where given, otherwise use the exact question as the topic. Changes made before change_until update that interview straight away; later ones help future interviews.` : 'No interviews yet. When a job that fits them goes live, their mini-me is interviewed. Meanwhile, help them build up their mini-me.', { interviews: full });
        }
        if (tool!.name === 'next_mini_me_questions') {
          const q = await questionsLeft(ctx);
          return text(q.left || q.followUps.length ? `${q.left} of ${q.total} topics still unknown. Here are some to cover. Don't read them out: ask in a natural, conversational way (be direct when that's clearer), follow up on anything interesting, and feel free to go beyond them:\n${JSON.stringify(q.suggestions, null, 2)}\nWhen an answer covers several topics, split it into separate items and save them together in one remember_for_my_mini_me call (with question_key where one fits).` : 'Every checklist question has an answer. Keep saving anything new and useful with remember_for_my_mini_me.', q);
        }
        if (tool!.name === 'remember_for_my_mini_me') {
          const items = Array.isArray(args.items) ? (args.items as unknown[]).slice(0, 30).map((a) => { const o = (a ?? {}) as { topic?: unknown; detail?: unknown; question_key?: unknown }; return { topic: String(o.topic ?? ''), detail: String(o.detail ?? ''), questionKey: typeof o.question_key === 'string' ? o.question_key : null }; }) : [];
          if (!items.length) return text('Nothing was given to remember.', undefined, true);
          const r = await rememberForMiniMe(ctx, auth.provider ?? 'your AI', items);
          return { ...text(`Saved ${r.savedToChecklist + r.savedAsExtras} thing${r.savedToChecklist + r.savedAsExtras === 1 ? '' : 's'} straight into their profile (${r.savedToChecklist} checklist, ${r.savedAsExtras} extra). They can edit or remove anything in Elsewhere.${r.skipped.length ? ` Skipped: ${r.skipped.join(', ')}.` : ''}`, r), saved: await savedJustNow(ctx, r.savedKeys) };
        }
        if (tool!.name === 'add_to_my_mini_me') {
          const items = Array.isArray(args.items) ? (args.items as unknown[]).slice(0, 30).map((a) => ({ topic: String((a as { topic?: unknown })?.topic ?? ''), answer: String((a as { answer?: unknown })?.answer ?? '') })) : [];
          if (!items.length) return text('Nothing was given to add.', undefined, true);
          const r = await addExtras(ctx, items, { provider: auth.provider ?? 'your AI' });
          return { ...text(`Added ${r.saved.length} item${r.saved.length === 1 ? '' : 's'} straight into their profile. They can edit or remove anything in Elsewhere.${r.skipped.length ? ` Skipped: ${r.skipped.map((x) => `${x.topic} (${x.reason})`).join(', ')}.` : ''}`, r), saved: await savedJustNow(ctx, r.saved) };
        }
        if (tool!.name === 'get_my_profile') { const p = await profile(ctx); return text(`Already on their Elsewhere profile (avoid repeating these; a new or better example from what you remember about them is more useful):\n${JSON.stringify(p, null, 2)}`, p); }
        return saveDraft(ctx, args, auth.provider ?? 'your AI');
      }
    }
    default:
      return isNotification ? null : fail(msg.id, -32601, `Method not found: ${msg.method}`);
  }
}
