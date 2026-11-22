import 'server-only';
import { and, eq } from 'drizzle-orm';
import { onboardingAnswers } from '../db/schema';
import { requireUser, readCtx, actorUserId, type BaseCtx, type Ctx } from './context';
import { invalid, notFound } from '../lib/errors';
import { logActivity } from './audit';
import { refreshInterviews } from './mini-me';
import { addExtras, EXTRA } from './onboarding';
import { runAi, aiMode, AiFailure } from '../ai';
import { rankRecords } from '../../lib/knowledge-search';
import { ONBOARDING, TOPIC_LABELS } from '../../config/onboarding';
import { KNOWLEDGE_CATEGORIES, CATEGORY_KEYS, CATEGORY_LABEL, categoryOf, type KnowledgeCategory } from '../../config/knowledge';

/**
 * The Knowledge Globe. Every knowledge item is one of the candidate's own Mini Me rows (onboarding_answers);
 * its id is the row's question key, which never changes. Everything here is scoped to the signed-in candidate.
 */
const me = (ctx: Pick<Ctx, 'actor'>) => {
  const a = requireUser(ctx.actor as Ctx['actor'], 'candidate') as { candidateId?: string };
  if (!a.candidateId) throw invalid('No candidate profile.');
  return a.candidateId;
};

const SECTION_OF = new Map(ONBOARDING.flatMap((s) => s.questions.map((q) => [q.key, { section: s, question: q }] as const)));
const readable = (key: string) => key.replace(/_/g, ' ').replace(/^./, (c) => c.toUpperCase());

export type KnowledgeItem = {
  id: string; category: KnowledgeCategory; categoryChosen: boolean; title: string; text: string; question: string | null;
  /** Where it came from: written by them, or saved by their AI (named) or the built-in coach. */
  source: 'self' | 'ai'; provider: string | null;
  /** Confirmed: they wrote it or said it's right. Otherwise their AI wrote it and they haven't checked it. */
  confirmed: boolean; createdAt: string; updatedAt: string;
};

export async function knowledgeItems(ctx: Ctx): Promise<KnowledgeItem[]> {
  const candidateId = me(ctx);
  const rows = await ctx.tx.select().from(onboardingAnswers).where(eq(onboardingAnswers.candidateId, candidateId));
  return rows.filter((r) => r.answer.trim()).map((r) => {
    const known = SECTION_OF.get(r.questionKey);
    const title = r.questionKey.startsWith(EXTRA) ? (r.questionText ?? 'Something else') : (TOPIC_LABELS[r.questionKey] ?? known?.question.label ?? readable(r.questionKey));
    const { category, chosen } = categoryOf(r.questionKey, known?.section.key ?? null, [title, r.answer], r.knowledgeCategory);
    return { id: r.questionKey, category, categoryChosen: chosen, title, text: r.answer, question: known?.question.text ?? null, source: r.source as 'self' | 'ai', provider: r.aiProvider, confirmed: r.source === 'self' && r.status === 'approved', createdAt: r.createdAt.toISOString(), updatedAt: r.updatedAt.toISOString() };
  }).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

/** The globe's data and the "What's inside" summary. Every figure is counted from their rows. */
export async function knowledgeView(ctx: Ctx) {
  const items = await knowledgeItems(ctx);
  const have = new Set(items.map((i) => i.id));
  // Unanswered checklist questions, by the area they would fill.
  const gaps = new Map<string, string[]>();
  for (const s of ONBOARDING) for (const q of s.questions) {
    if (have.has(q.key)) continue;
    const c = categoryOf(q.key, s.key, [], null).category;
    gaps.set(c, [...(gaps.get(c) ?? []), TOPIC_LABELS[q.key] ?? q.label ?? readable(q.key)]);
  }
  const categories = KNOWLEDGE_CATEGORIES.map((c) => ({ key: c.key, label: c.label, count: items.filter((i) => i.category === c.key).length, unanswered: gaps.get(c.key) ?? [] }));
  return {
    items, categories,
    total: items.length,
    areas: categories.filter((c) => c.count > 0).length,
    missingAreas: categories.filter((c) => c.count === 0 || c.unanswered.length > 0).map((c) => ({ key: c.key, label: c.label, empty: c.count === 0, unanswered: c.unanswered.length })),
    unconfirmed: items.filter((i) => !i.confirmed).length,
    lastUpdatedAt: items[0]?.updatedAt ?? null,
  };
}

async function own(ctx: Ctx, key: string) {
  const candidateId = me(ctx);
  const [row] = await ctx.tx.select({ id: onboardingAnswers.id, source: onboardingAnswers.source }).from(onboardingAnswers).where(and(eq(onboardingAnswers.candidateId, candidateId), eq(onboardingAnswers.questionKey, key)));
  if (!row) throw notFound();
  return { candidateId, row };
}

/** "That's right": an item their AI wrote becomes theirs. Their AI can no longer change it; the text is untouched. */
export async function confirmKnowledge(ctx: Ctx, key: string) {
  const { candidateId, row } = await own(ctx, key);
  if (row.source === 'self') return { confirmed: true };
  await ctx.tx.update(onboardingAnswers).set({ source: 'self', status: 'approved', approvedAt: ctx.now, updatedAt: new Date() }).where(eq(onboardingAnswers.id, row.id));
  await logActivity(ctx, { subjectType: 'candidate', subjectId: candidateId, action: 'onboarding.approved', metadata: { count: 1 } });
  return { confirmed: true };
}

/** Move an item to another area of the globe (null: back to the automatic area). */
export async function setKnowledgeCategory(ctx: Ctx, key: string, category: string | null) {
  if (category !== null && !CATEGORY_KEYS.has(category)) throw invalid('That area doesn’t exist.');
  const { row } = await own(ctx, key);
  await ctx.tx.update(onboardingAnswers).set({ knowledgeCategory: category, updatedAt: new Date() }).where(eq(onboardingAnswers.id, row.id));
  return { category };
}

/** Remove an item for good. Interviews that used it are refreshed. */
export async function deleteKnowledge(ctx: Ctx, key: string) {
  const { candidateId, row } = await own(ctx, key);
  const { lockCandidates } = await import('./context');
  await lockCandidates(ctx.tx, [candidateId]);
  ctx.evidenceSubmittedAt = new Date();
  await ctx.tx.delete(onboardingAnswers).where(eq(onboardingAnswers.id, row.id));
  await logActivity(ctx, { subjectType: 'candidate', subjectId: candidateId, action: 'onboarding.removed', metadata: { count: 1 } });
  await refreshInterviews(ctx, candidateId);
  return { deleted: true };
}

/** Something new they approved from the globe, filed in the area they picked. */
export async function addKnowledge(ctx: Ctx, topic: string, answer: string, category: string | null) {
  if (category !== null && !CATEGORY_KEYS.has(category)) throw invalid('That area doesn’t exist.');
  const r = await addExtras(ctx, [{ topic, answer }], 'self');
  if (!r.saved.length) throw invalid(r.skipped[0]?.reason ? `Couldn’t add it: ${r.skipped[0].reason}.` : 'Couldn’t add it.');
  if (category) await ctx.tx.update(onboardingAnswers).set({ knowledgeCategory: category }).where(and(eq(onboardingAnswers.candidateId, me(ctx)), eq(onboardingAnswers.questionKey, r.saved[0])));
  return { id: r.saved[0] };
}

/** How they rated one of Mini Me's answers. Only the verdict and how many records it used are kept. */
export async function reviewAnswer(ctx: Ctx, verdict: 'good' | 'inaccurate' | 'incomplete', usedIds: string[]) {
  const candidateId = me(ctx);
  await logActivity(ctx, { subjectType: 'candidate', subjectId: candidateId, action: 'minime.answer_reviewed', metadata: { verdict, records: usedIds.length } });
  return { saved: true };
}

const MAX_SENT = 40;
const ASKS_MISSING = /\b(what|which)\b.*\b(missing|don[’']?t you know|do you not know|gaps?)\b/i;
const ASKS_ABOUT_ME = /\b(tell me about (yourself|you|me|myself)|who are you|introduce yourself|describe yourself)\b/i;
const ABOUT_ME_KEYS = ['current_role', 'current_duties', 'top_skills', 'career_goal', 'why_move'];
const NOT_KNOWN = 'I don’t know that yet. Nothing I’ve been told covers it.';
export type AskResult = { answer: string; usedIds: string[]; notKnown: string | null; live: boolean; basic: string | null };

/**
 * Ask Mini Me. The live AI answers in the first person from their records and names the ids it used; ids it
 * wasn't given are dropped. Without the live AI (demo mode, budget, outage) it quotes the closest records word for word.
 */
export async function askMiniMe(base: BaseCtx, question: string, mode: 'ask' | 'interview'): Promise<AskResult> {
  const q = question.trim().slice(0, 500);
  if (!q) throw invalid('Ask a question first.', { question: 'Required' });
  const ctx = readCtx(base);
  const candidateId = me(ctx);
  const items = await knowledgeItems(ctx);
  if (!items.length) return { answer: 'I don’t know anything about you yet. Add something, or connect your AI, and I’ll start learning.', usedIds: [], notKnown: 'Nothing saved yet.', live: false, basic: null };
  // "What are you missing?" is answered from the real gaps, never by the AI.
  if (ASKS_MISSING.test(q)) {
    const v = await knowledgeView(ctx);
    const empty = v.missingAreas.filter((m) => m.empty).map((m) => m.label);
    const open = v.categories.flatMap((c) => c.unanswered);
    const parts = [empty.length ? `I don’t know anything yet about: ${empty.join(', ')}.` : 'I know at least something in every area.', open.length ? `There are ${open.length} questions I still can’t answer, for example ${open.slice(0, 4).join(', ').toLowerCase()}.` : ''];
    return { answer: parts.filter(Boolean).join(' '), usedIds: [], notKnown: null, live: false, basic: 'Worked out from what’s saved, not by the AI.' };
  }
  const ranked = rankRecords(q, items.map((i) => ({ ...i, area: CATEGORY_LABEL[i.category] })));
  let basic: string | null = 'Basic mode: no AI wording, just what you saved.';
  if (aiMode() === 'live') {
    // Small profiles go in whole, so the AI can find things plain word matching misses. Larger ones: the closest 40.
    const sent = items.length <= MAX_SENT ? items : [...ranked.map((r) => r.record), ...items.filter((i) => !ranked.some((r) => r.record.id === i.id))].slice(0, MAX_SENT);
    const input = { mode, question: q, records: sent.map((i) => ({ id: i.id, area: CATEGORY_LABEL[i.category], topic: i.title, text: i.text.slice(0, 1500) })) };
    try {
      const r = await runAi({ task: 'ask', datasetId: base.datasetId, userId: actorUserId(base.actor), candidateId, input }, (p) => {
        if (!p.askMiniMe) throw new AiFailure('not_supported', 'This provider cannot answer as Mini Me.');
        return p.askMiniMe(input);
      });
      const allowed = new Set(sent.map((s) => s.id));
      const usedIds = [...new Set(r.output.usedIds.filter((id) => allowed.has(id)))];
      // No records used: it may only say it doesn't know.
      if (!usedIds.length) return { answer: r.output.notKnown ? r.output.answer : NOT_KNOWN, usedIds: [], notKnown: r.output.notKnown ?? 'Nothing I know covers this.', live: true, basic: null };
      return { answer: r.output.answer, usedIds, notKnown: r.output.notKnown, live: true, basic: null };
    } catch (e) {
      if (!(e instanceof AiFailure)) throw e;
      basic = e.code === 'daily_budget' || e.code === 'monthly_budget' || e.code === 'user_rate_limited' ? 'The AI limit is reached for now, so this is a basic answer: just what you saved.' : 'The AI isn’t available right now, so this is a basic answer: just what you saved.';
    }
  }
  // "Tell me about yourself": the basics, where they exist.
  if (ASKS_ABOUT_ME.test(q)) {
    const basics = ABOUT_ME_KEYS.map((k) => items.find((i) => i.id === k)).filter((x): x is (typeof items)[number] => !!x).slice(0, 3);
    if (basics.length) return { answer: basics.map((p) => p.text).join('\n\n'), usedIds: basics.map((p) => p.id), notKnown: null, live: false, basic };
  }
  // Plain matching is crude, so only records sharing at least half the question's words count.
  const strong = ranked.filter((r) => r.coverage >= 0.5);
  const top = strong[0]?.score ?? 0;
  const picked = strong.filter((r) => r.score >= top * 0.6).slice(0, mode === 'interview' ? 3 : 2).map((r) => r.record);
  if (!picked.length) return { answer: NOT_KNOWN, usedIds: [], notKnown: 'Nothing I know covers this.', live: false, basic };
  return { answer: picked.map((p) => p.text.length > 600 ? `${p.text.slice(0, 600).trimEnd()}…` : p.text).join('\n\n'), usedIds: picked.map((p) => p.id), notKnown: null, live: false, basic };
}

