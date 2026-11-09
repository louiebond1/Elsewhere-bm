import 'server-only';
import { and, eq, inArray } from 'drizzle-orm';
import { onboardingAnswers } from '../db/schema';
import { requireUser, type Ctx } from './context';
import { invalid } from '../lib/errors';
import { logActivity } from './audit';
import { ONBOARDING, ONBOARDING_KEYS, MAX_ONBOARDING_ANSWER } from '../../config/onboarding';

const me = (ctx: Ctx) => {
  const a = requireUser(ctx.actor, 'candidate') as { candidateId?: string };
  if (!a.candidateId) throw invalid('No candidate profile.');
  return a.candidateId;
};
const clean = (t: unknown) => (typeof t === 'string' ? t.trim() : '');

/** The checklist with this person's answers, section by section, plus simple counts. */
export async function onboardingView(ctx: Ctx) {
  const candidateId = me(ctx);
  const rows = await ctx.tx.select().from(onboardingAnswers).where(eq(onboardingAnswers.candidateId, candidateId));
  const byKey = new Map(rows.map((r) => [r.questionKey, r]));
  const sections = ONBOARDING.map((s) => ({
    key: s.key, title: s.title,
    questions: s.questions.map((q) => {
      const r = byKey.get(q.key);
      return { key: q.key, text: q.text, hint: q.hint ?? null, answer: r?.answer ?? null, source: (r?.source ?? null) as 'ai' | 'self' | null, provider: r?.aiProvider ?? null, approved: r?.status === 'approved' };
    }),
  }));
  const all = sections.flatMap((s) => s.questions);
  return { sections, total: all.length, answered: all.filter((q) => q.answer).length, approved: all.filter((q) => q.approved).length, toCheck: all.filter((q) => q.answer && !q.approved).length };
}

/** The person writes or edits an answer themselves: it counts as checked. An empty answer removes it. */
export async function saveOwnAnswer(ctx: Ctx, key: string, answer: string) {
  const candidateId = me(ctx);
  if (!ONBOARDING_KEYS.has(key)) throw invalid('That question isn’t on the checklist.');
  const body = clean(answer);
  if (body.length > MAX_ONBOARDING_ANSWER) throw invalid(`Answers can be up to ${MAX_ONBOARDING_ANSWER} characters.`, { answer: 'Too long' });
  if (!body) { await ctx.tx.delete(onboardingAnswers).where(and(eq(onboardingAnswers.candidateId, candidateId), eq(onboardingAnswers.questionKey, key))); return { saved: true }; }
  await ctx.tx.insert(onboardingAnswers).values({ datasetId: ctx.datasetId, candidateId, questionKey: key, answer: body, source: 'self', status: 'approved', approvedAt: ctx.now })
    .onConflictDoUpdate({ target: [onboardingAnswers.candidateId, onboardingAnswers.questionKey], set: { answer: body, source: 'self', aiProvider: null, status: 'approved', approvedAt: ctx.now, updatedAt: new Date() } });
  return { saved: true };
}

/** "Looks right": approve answers their AI drafted (one, or all of them). */
export async function approveAnswers(ctx: Ctx, keys: string[] | 'all') {
  const candidateId = me(ctx);
  const where = keys === 'all' ? and(eq(onboardingAnswers.candidateId, candidateId), eq(onboardingAnswers.status, 'draft'))
    : and(eq(onboardingAnswers.candidateId, candidateId), inArray(onboardingAnswers.questionKey, keys.filter((k) => ONBOARDING_KEYS.has(k)).length ? keys.filter((k) => ONBOARDING_KEYS.has(k)) : ['-']));
  const r = await ctx.tx.update(onboardingAnswers).set({ status: 'approved', approvedAt: ctx.now, updatedAt: new Date() }).where(where).returning({ id: onboardingAnswers.id });
  if (r.length) await logActivity(ctx, { subjectType: 'candidate', subjectId: candidateId, action: 'onboarding.approved', metadata: { count: r.length } });
  return { approved: r.length };
}

/**
 * Their own AI saves drafts through the connector. It never overwrites an answer the person has
 * already approved or written themselves; those are reported back as skipped.
 */
export async function saveAiAnswers(ctx: Ctx, provider: string, items: { key: string; answer: string }[]) {
  const candidateId = me(ctx);
  const existing = await ctx.tx.select({ key: onboardingAnswers.questionKey, status: onboardingAnswers.status }).from(onboardingAnswers).where(eq(onboardingAnswers.candidateId, candidateId));
  const locked = new Set(existing.filter((e) => e.status === 'approved').map((e) => e.key));
  const saved: string[] = []; const skipped: { key: string; reason: string }[] = [];
  for (const it of items) {
    const body = clean(it.answer);
    if (!ONBOARDING_KEYS.has(it.key)) { skipped.push({ key: it.key, reason: 'not a checklist question' }); continue; }
    if (!body) { skipped.push({ key: it.key, reason: 'empty' }); continue; }
    if (body.length > MAX_ONBOARDING_ANSWER) { skipped.push({ key: it.key, reason: `longer than ${MAX_ONBOARDING_ANSWER} characters` }); continue; }
    if (locked.has(it.key)) { skipped.push({ key: it.key, reason: 'already approved by them' }); continue; }
    await ctx.tx.insert(onboardingAnswers).values({ datasetId: ctx.datasetId, candidateId, questionKey: it.key, answer: body, source: 'ai', aiProvider: provider, status: 'draft' })
      .onConflictDoUpdate({ target: [onboardingAnswers.candidateId, onboardingAnswers.questionKey], set: { answer: body, source: 'ai', aiProvider: provider, status: 'draft', approvedAt: null, updatedAt: new Date() } });
    saved.push(it.key);
  }
  if (saved.length) await logActivity(ctx, { subjectType: 'candidate', subjectId: candidateId, action: 'onboarding.ai_saved', metadata: { count: saved.length } });
  return { saved, skipped };
}

/** For the header strip and home page: drafts their AI wrote that they haven't checked yet. */
export async function onboardingToCheck(ctx: Ctx) {
  const candidateId = me(ctx);
  const r = await ctx.tx.select({ id: onboardingAnswers.id }).from(onboardingAnswers).where(and(eq(onboardingAnswers.candidateId, candidateId), eq(onboardingAnswers.status, 'draft')));
  return r.length;
}
