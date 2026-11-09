import 'server-only';
import { and, eq, inArray, like } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import { onboardingAnswers } from '../db/schema';
import { requireUser, type Ctx } from './context';
import { invalid } from '../lib/errors';
import { logActivity } from './audit';
import { refreshInterviews } from './mini-me';
import { ONBOARDING, ONBOARDING_KEYS, MAX_ONBOARDING_ANSWER, TOPIC_LABELS } from '../../config/onboarding';

const me = (ctx: Ctx) => {
  const a = requireUser(ctx.actor, 'candidate') as { candidateId?: string };
  if (!a.candidateId) throw invalid('No candidate profile.');
  return a.candidateId;
};
const clean = (t: unknown) => (typeof t === 'string' ? t.trim() : '');
export const EXTRA = 'extra:';
export const MAX_EXTRAS = 100;
const isExtra = (k: string) => k.startsWith(EXTRA) && k.length <= 60;

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
  const extras = rows.filter((r) => r.questionKey.startsWith(EXTRA)).sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())
    .map((r) => ({ key: r.questionKey, text: r.questionText ?? 'Something else', hint: null, answer: r.answer, source: r.source as 'ai' | 'self', provider: r.aiProvider, approved: r.status === 'approved' }));
  const all = sections.flatMap((s) => s.questions);
  // Everything it knows, newest first, as short topics rather than form questions.
  const areaOf = new Map(ONBOARDING.flatMap((s) => s.questions.map((q) => [q.key, s.title] as const)));
  const feed = [...rows].sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime()).map((r) => ({
    key: r.questionKey, text: r.questionKey.startsWith(EXTRA) ? (r.questionText ?? 'Something else') : (TOPIC_LABELS[r.questionKey] ?? r.questionKey),
    area: areaOf.get(r.questionKey) ?? 'Extras', areaKey: r.questionKey.startsWith(EXTRA) ? 'extras' : (ONBOARDING.find((s) => s.questions.some((q) => q.key === r.questionKey))?.key ?? 'extras'),
    hint: null, answer: r.answer, source: r.source as 'ai' | 'self', provider: r.aiProvider, approved: r.status === 'approved',
  }));
  return { sections, extras, feed, extrasToCheck: extras.filter((e) => !e.approved).length, total: all.length, answered: all.filter((q) => q.answer).length, approved: all.filter((q) => q.approved).length, toCheck: all.filter((q) => q.answer && !q.approved).length + extras.filter((e) => !e.approved).length };
}

/** The person writes or edits an answer themselves: it counts as checked. An empty answer removes it. */
export async function saveOwnAnswer(ctx: Ctx, key: string, answer: string) {
  const candidateId = me(ctx);
  if (!ONBOARDING_KEYS.has(key) && !isExtra(key)) throw invalid('That question isn’t on the checklist.');
  const body = clean(answer);
  if (isExtra(key)) {
    const [row] = await ctx.tx.select({ id: onboardingAnswers.id }).from(onboardingAnswers).where(and(eq(onboardingAnswers.candidateId, candidateId), eq(onboardingAnswers.questionKey, key)));
    if (!row) throw invalid('That item no longer exists.');
    if (!body) { await ctx.tx.delete(onboardingAnswers).where(eq(onboardingAnswers.id, row.id)); return { saved: true }; }
    if (body.length > MAX_ONBOARDING_ANSWER) throw invalid(`Answers can be up to ${MAX_ONBOARDING_ANSWER} characters.`, { answer: 'Too long' });
    await ctx.tx.update(onboardingAnswers).set({ answer: body, source: 'self', aiProvider: null, status: 'approved', approvedAt: ctx.now, updatedAt: new Date() }).where(eq(onboardingAnswers.id, row.id));
    await logActivity(ctx, { subjectType: 'candidate', subjectId: candidateId, action: 'onboarding.self_saved', metadata: { count: 1 } });
    await refreshInterviews(ctx, candidateId);
    return { saved: true };
  }
  if (body.length > MAX_ONBOARDING_ANSWER) throw invalid(`Answers can be up to ${MAX_ONBOARDING_ANSWER} characters.`, { answer: 'Too long' });
  if (!body) { await ctx.tx.delete(onboardingAnswers).where(and(eq(onboardingAnswers.candidateId, candidateId), eq(onboardingAnswers.questionKey, key))); return { saved: true }; }
  await ctx.tx.insert(onboardingAnswers).values({ datasetId: ctx.datasetId, candidateId, questionKey: key, answer: body, source: 'self', status: 'approved', approvedAt: ctx.now })
    .onConflictDoUpdate({ target: [onboardingAnswers.candidateId, onboardingAnswers.questionKey], set: { answer: body, source: 'self', aiProvider: null, status: 'approved', approvedAt: ctx.now, updatedAt: new Date() } });
  await logActivity(ctx, { subjectType: 'candidate', subjectId: candidateId, action: 'onboarding.self_saved', metadata: { count: 1 } });
  await refreshInterviews(ctx, candidateId);
  return { saved: true };
}

/** "Looks right": approve answers their AI drafted (one, or all of them). */
export async function approveAnswers(ctx: Ctx, keys: string[] | 'all') {
  const candidateId = me(ctx);
  const where = keys === 'all' ? and(eq(onboardingAnswers.candidateId, candidateId), eq(onboardingAnswers.status, 'draft'))
    : and(eq(onboardingAnswers.candidateId, candidateId), inArray(onboardingAnswers.questionKey, keys.filter((k) => ONBOARDING_KEYS.has(k) || isExtra(k)).length ? keys.filter((k) => ONBOARDING_KEYS.has(k) || isExtra(k)) : ['-']));
  const r = await ctx.tx.update(onboardingAnswers).set({ status: 'approved', approvedAt: ctx.now, updatedAt: new Date() }).where(where).returning({ id: onboardingAnswers.id });
  if (r.length) { await logActivity(ctx, { subjectType: 'candidate', subjectId: candidateId, action: 'onboarding.approved', metadata: { count: r.length } }); await refreshInterviews(ctx, candidateId); }
  return { approved: r.length };
}

/**
 * Their own AI saves straight into their profile (they asked for no drafts). It can update what it
 * wrote before, but never an answer the person wrote themselves; those are reported back as skipped.
 */
export async function saveAiAnswers(ctx: Ctx, provider: string, items: { key: string; answer: string }[]) {
  const candidateId = me(ctx);
  const existing = await ctx.tx.select({ key: onboardingAnswers.questionKey, source: onboardingAnswers.source }).from(onboardingAnswers).where(eq(onboardingAnswers.candidateId, candidateId));
  const locked = new Set(existing.filter((e) => e.source === 'self').map((e) => e.key));
  const saved: string[] = []; const skipped: { key: string; reason: string }[] = [];
  for (const it of items) {
    const body = clean(it.answer);
    if (!ONBOARDING_KEYS.has(it.key)) { skipped.push({ key: it.key, reason: 'not a checklist question' }); continue; }
    if (!body) { skipped.push({ key: it.key, reason: 'empty' }); continue; }
    if (body.length > MAX_ONBOARDING_ANSWER) { skipped.push({ key: it.key, reason: `longer than ${MAX_ONBOARDING_ANSWER} characters` }); continue; }
    if (locked.has(it.key)) { skipped.push({ key: it.key, reason: 'they wrote this one themselves' }); continue; }
    await ctx.tx.insert(onboardingAnswers).values({ datasetId: ctx.datasetId, candidateId, questionKey: it.key, answer: body, source: 'ai', aiProvider: provider, status: 'approved', approvedAt: ctx.now })
      .onConflictDoUpdate({ target: [onboardingAnswers.candidateId, onboardingAnswers.questionKey], set: { answer: body, source: 'ai', aiProvider: provider, status: 'approved', approvedAt: ctx.now, updatedAt: new Date() } });
    saved.push(it.key);
  }
  if (saved.length) { await logActivity(ctx, { subjectType: 'candidate', subjectId: candidateId, action: 'onboarding.ai_saved', metadata: { count: saved.length, provider } }); await refreshInterviews(ctx, candidateId); }
  return { saved, skipped };
}

/** For the header strip and home page: drafts their AI wrote that they haven't checked yet. */
export async function onboardingToCheck(ctx: Ctx) {
  const candidateId = me(ctx);
  const r = await ctx.tx.select({ id: onboardingAnswers.id }).from(onboardingAnswers).where(and(eq(onboardingAnswers.candidateId, candidateId), eq(onboardingAnswers.status, 'draft')));
  return r.length;
}

/**
 * Anything beyond the checklist: follow-ups their AI asked, or things they want to share.
 * From their AI it's a draft to check; written by them it's already checked.
 */
export async function addExtras(ctx: Ctx, items: { topic: string; answer: string }[], from: { provider: string } | 'self') {
  const candidateId = me(ctx);
  const have = await ctx.tx.select({ id: onboardingAnswers.id }).from(onboardingAnswers).where(and(eq(onboardingAnswers.candidateId, candidateId), like(onboardingAnswers.questionKey, `${EXTRA}%`)));
  let room = MAX_EXTRAS - have.length;
  const saved: string[] = []; const skipped: { topic: string; reason: string }[] = [];
  for (const it of items) {
    const topic = clean(it.topic).slice(0, 200); const body = clean(it.answer);
    if (!topic || !body) { skipped.push({ topic: topic || '(no topic)', reason: 'empty' }); continue; }
    if (body.length > MAX_ONBOARDING_ANSWER) { skipped.push({ topic, reason: `longer than ${MAX_ONBOARDING_ANSWER} characters` }); continue; }
    if (room <= 0) { skipped.push({ topic, reason: `already ${MAX_EXTRAS} extra items` }); continue; }
    const key = `${EXTRA}${randomUUID().slice(0, 12)}`;
    await ctx.tx.insert(onboardingAnswers).values({ datasetId: ctx.datasetId, candidateId, questionKey: key, questionText: topic, answer: body, ...(from === 'self' ? { source: 'self', status: 'approved', approvedAt: ctx.now } : { source: 'ai', aiProvider: from.provider, status: 'approved', approvedAt: ctx.now }) });
    saved.push(key); room--;
  }
  if (saved.length) { await logActivity(ctx, { subjectType: 'candidate', subjectId: candidateId, action: 'onboarding.extras_added', metadata: { count: saved.length, provider: from === 'self' ? null : from.provider } }); await refreshInterviews(ctx, candidateId); }
  return { saved, skipped };
}

/**
 * Always-on mode: whatever their AI picks up in any chat. If it answers a checklist question it goes
 * there (never over an approved answer); otherwise it becomes an extra. All drafts for them to check.
 */
export async function rememberForMiniMe(ctx: Ctx, provider: string, items: { topic: string; detail: string; questionKey?: string | null }[]) {
  const toChecklist = items.filter((i) => i.questionKey && ONBOARDING_KEYS.has(i.questionKey)).map((i) => ({ key: i.questionKey!, answer: i.detail }));
  const toExtras = items.filter((i) => !(i.questionKey && ONBOARDING_KEYS.has(i.questionKey))).map((i) => ({ topic: i.topic, answer: i.detail }));
  const a = toChecklist.length ? await saveAiAnswers(ctx, provider, toChecklist) : { saved: [], skipped: [] };
  const b = toExtras.length ? await addExtras(ctx, toExtras, { provider }) : { saved: [], skipped: [] };
  return { savedToChecklist: a.saved.length, savedAsExtras: b.saved.length, skipped: [...a.skipped.map((x) => x.key + ' (' + x.reason + ')'), ...b.skipped.map((x) => x.topic + ' (' + x.reason + ')')] };
}

/** A few questions not yet answered, for their AI to slip into conversation when it fits. */
export async function questionsLeft(ctx: Ctx, limit = 6) {
  const v = await onboardingView(ctx);
  const left = v.sections.flatMap((s) => s.questions.filter((q) => !q.answer).map((q) => ({ key: q.key, question: q.text, section: s.title })));
  return { left: left.length, total: v.total, suggestions: left.slice(0, limit) };
}

/** The mini-me's story: what was added or approved, and when, newest first. */
export async function miniMeStory(ctx: Ctx, limit = 30) {
  const candidateId = me(ctx);
  const { activityEvents } = await import('../db/schema');
  const { desc, like: lk } = await import('drizzle-orm');
  const rows = await ctx.tx.select({ action: activityEvents.action, metadata: activityEvents.metadata, at: activityEvents.eventAt }).from(activityEvents)
    .where(and(eq(activityEvents.subjectType, 'candidate'), eq(activityEvents.subjectId, candidateId), lk(activityEvents.action, 'onboarding.%'))).orderBy(desc(activityEvents.eventAt)).limit(limit);
  return rows.map((r) => {
    const m = (r.metadata ?? {}) as { count?: number; provider?: string | null };
    const n = m.count ?? 1; const things = `${n} thing${n === 1 ? '' : 's'}`;
    const text = r.action === 'onboarding.ai_saved' ? `${m.provider ?? 'Your AI'} added ${things}`
      : r.action === 'onboarding.extras_added' ? (m.provider ? `${m.provider} added ${things} beyond the usual questions` : `You added ${things}`)
      : r.action === 'onboarding.approved' ? `You approved ${things}` : r.action === 'onboarding.self_saved' ? 'You answered something yourself' : 'Your mini-me changed';
    return { at: r.at.toISOString(), text, kind: r.action === 'onboarding.approved' ? 'approved' : m.provider ? 'ai' : 'you' };
  });
}
