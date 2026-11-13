import 'server-only';
import { asc, desc, eq } from 'drizzle-orm';
import { miniMeChat, candidates, files } from '../db/schema';
import { requireUser, readCtx, withTx, type BaseCtx, type Ctx } from './context';
import { invalid } from '../lib/errors';
import { runAi, aiMode, AiFailure } from '../ai';
import { onboardingView, rememberForMiniMe, questionsLeft } from './onboarding';
import { updatePreferences } from './candidates';
import { ONBOARDING_QUESTIONS, TOPIC_LABELS } from '../../config/onboarding';

const WHO = 'Elsewhere';
const candidateOf = (ctx: Pick<Ctx, 'actor'>) => {
  const a = requireUser(ctx.actor as Ctx['actor'], 'candidate') as { candidateId?: string };
  if (!a.candidateId) throw invalid('No candidate profile.');
  return a.candidateId;
};

export async function chatMessages(ctx: Ctx) {
  const id = candidateOf(ctx);
  return ctx.tx.select({ role: miniMeChat.role, text: miniMeChat.text, at: miniMeChat.createdAt }).from(miniMeChat).where(eq(miniMeChat.candidateId, id)).orderBy(asc(miniMeChat.createdAt)).limit(200);
}

/** What the coach needs: their CV, preferences, what's known and what's missing. */
async function state(ctx: Ctx) {
  const id = candidateOf(ctx);
  const [v, [c], [cv], history] = await Promise.all([
    onboardingView(ctx),
    ctx.tx.select({ prefs: candidates.preferencesConfirmed }).from(candidates).where(eq(candidates.id, id)),
    ctx.tx.select({ text: files.extractedTextPrivate }).from(files).where(eq(files.candidateId, id)).orderBy(desc(files.createdAt)).limit(1),
    ctx.tx.select().from(miniMeChat).where(eq(miniMeChat.candidateId, id)).orderBy(desc(miniMeChat.createdAt)).limit(14),
  ]);
  const agenda = await questionsLeft(ctx, 6);
  const all = v.sections.flatMap((s) => s.questions);
  return {
    interviewAgenda: agenda.followUps,
    id, cv: cv?.text ?? null, preferencesSet: !!c?.prefs,
    known: v.feed.slice(0, 70).map((f) => ({ topic: f.text, answer: (f.answer ?? '').slice(0, 1500) })),
    missing: all.filter((q) => !q.answer).map((q) => ({ key: q.key, topic: TOPIC_LABELS[q.key] ?? q.text, question: q.text })),
    messages: history.reverse().map((m) => ({ role: m.role as 'assistant' | 'user', text: m.text, askedKey: m.askedKey })),
  };
}

/** The free built-in interviewer: saves what they said against the last question, asks the next one. */
function simpleTurn(s: Awaited<ReturnType<typeof state>>, text: string | null) {
  const last = [...s.messages].reverse().find((m) => m.role === 'assistant');
  const followupTopic = last?.askedKey?.startsWith('followup:') ? last.askedKey.slice(9) : null;
  const save = text && followupTopic ? [{topic:followupTopic,detail:text,questionKey:null}] : text && last?.askedKey ? [{ topic: TOPIC_LABELS[last.askedKey] ?? 'Something they shared', detail: text, questionKey: last.askedKey }] : text ? [{ topic: last?.text ?? 'Something they shared', detail: text, questionKey: null }] : [];
  const missing = s.missing.filter((m) => m.key !== last?.askedKey);
  const order = s.cv ? ['current_role', 'current_duties', 'past_roles', 'ex_proud', 'ex_numbers'] : ['current_role', 'current_duties'];
  const prefsFirst = !s.preferencesSet ? ['ideal_role', 'location', 'work_mode', 'salary', 'notice'] : [];
  const follow = s.interviewAgenda.find((q) => !last?.text.endsWith(q.question) && !text?.includes(q.question));
  const next = [...prefsFirst, ...order].map((k) => missing.find((m) => m.key === k)).find(Boolean) ?? missing[0];
  const opener = !s.messages.length ? (s.cv ? 'Hi! I’ve read your CV. Let’s build your mini-me together, one quick question at a time. ' : 'Hi! Let’s build your mini-me together, one quick question at a time. ') : text ? 'Thanks, saved. ' : '';
  return { reply: follow ? `${opener}${follow.question}` : next ? `${opener}${next.question}` : `${opener}That covers everything I had on my list. Anything else you’d like employers to know?`, askedKey: follow ? follow.targetKey ?? `followup:${follow.question.slice(0,200)}` : next?.key ?? null, save, preferences: null };
}

/** One turn: save what they said, then ask the next thing. Live AI when available and within budget; otherwise the simple interviewer. */
export async function chatTurn(base: BaseCtx, text: string | null) {
  const t = text?.trim() ? text.trim().slice(0, 3000) : null;
  const s = await state(readCtx(base));
  if (!t && s.messages.length) return { reply: null };
  const convo = [...s.messages.map(({ role, text: x }) => ({ role, text: x })), ...(t ? [{ role: 'user' as const, text: t }] : [])];
  let out: ReturnType<typeof simpleTurn> | { reply: string; askedKey: string | null; save: { topic: string; detail: string; questionKey: string | null }[]; preferences: { region: string; workModes: string[]; roleFamilies: string[]; minSalaryPounds: number | null; noticeWeeks: number | null } | null } = simpleTurn(s, t);
  let live = false;
  if (aiMode() === 'live') {
    try {
      const input = { interviewAgenda: s.interviewAgenda, cv: s.cv ? s.cv.slice(0, 8000) : null, preferencesSet: s.preferencesSet, known: s.known, missing: s.missing.slice(0, 25).map(({ key, topic }) => ({ key, topic })), allTopics: ONBOARDING_QUESTIONS.map((q) => ({ key: q.key, topic: TOPIC_LABELS[q.key] ?? q.text })), messages: convo };
      const r = await runAi({ task: 'minime', datasetId: base.datasetId, candidateId: s.id, input }, (p) => p.miniMeChat(input));
      out = r.output; live = true;
    } catch (e) {
      if (!(e instanceof AiFailure)) throw e; // budget, timeout etc.: carry on with the simple interviewer
    }
  }
  return withTx(base, async (ctx) => {
    if (t) await ctx.tx.insert(miniMeChat).values({ datasetId: ctx.datasetId, candidateId: s.id, role: 'user', text: t });
    let saved = 0;
    if (t && out.save.length) {
      const r = await rememberForMiniMe(ctx, WHO, out.save.map((x) => ({ topic: x.topic, detail: x.detail, questionKey: x.questionKey })));
      saved = r.savedToChecklist + r.savedAsExtras;
    }
    if (t && out.preferences) {
      try { await updatePreferences(ctx, { ...out.preferences, minSalaryPounds: out.preferences.minSalaryPounds && out.preferences.minSalaryPounds > 0 ? out.preferences.minSalaryPounds : null, workAuthorisation: 'unknown', experienceBand: 'unknown' }); } catch { /* ignore a malformed suggestion */ }
    }
    await ctx.tx.insert(miniMeChat).values({ datasetId: ctx.datasetId, candidateId: s.id, role: 'assistant', text: out.reply, askedKey: out.askedKey });
    return { reply: out.reply, saved, live };
  });
}
