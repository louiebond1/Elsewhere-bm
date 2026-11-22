import { describe, it, expect, afterEach } from 'vitest';
import { and, eq } from 'drizzle-orm';
import { load } from './helpers';
import { db } from '../../src/server/db/client';
import * as S from '../../src/server/db/schema';
import { readCtx } from '../../src/server/services/context';
import { setProviderForTests } from '../../src/server/ai';
import { fixtureProvider } from '../../src/server/ai/providers/fixture';
import { saveOwnAnswer, saveAiAnswers, addExtras } from '../../src/server/services/onboarding';
import { knowledgeView, askMiniMe, confirmKnowledge, deleteKnowledge, setKnowledgeCategory, addKnowledge, reviewAnswer } from '../../src/server/services/knowledge';
import type { AskMiniMeInput } from '../../src/server/ai/providers/types';

afterEach(() => setProviderForTests(null));
const usage = { inputTokens: 400, outputTokens: 90, cacheReadTokens: 0, cacheWriteTokens: 0, modelId: 'claude-haiku-5-5' };

async function seed(w: Awaited<ReturnType<typeof load>>) {
  await w.T(w.cand('C01'), async (c) => {
    // Start from nothing so counts are exact.
    await c.tx.delete(S.onboardingAnswers).where(eq(S.onboardingAnswers.candidateId, w.ids.candidates.C01));
    await saveOwnAnswer(c, 'top_skills', 'Reconciliations and Excel pivot tables.');
    await saveAiAnswers(c, 'ChatGPT', [{ key: 'current_role', answer: 'Accounts assistant in a small finance team.' }, { key: 'qualifications', answer: 'AAT Level 3.' }]);
    await addExtras(c, [{ topic: 'Weekend hobbies', answer: 'I run a 5k parkrun most Saturdays.' }], { provider: 'ChatGPT' });
  });
}

describe('Knowledge Globe', () => {
  it('counts every area from the candidate’s own rows, and says what is missing', async () => {
    const w = await load();
    await seed(w);
    const v = await knowledgeView(readCtx(w.cand('C01')));
    expect(v.total).toBe(4);
    const count = Object.fromEntries(v.categories.map((c) => [c.key, c.count]));
    expect(count).toMatchObject({ skills: 1, work: 1, education: 1, interests: 1, personal: 0, values: 0, goals: 0, other: 0 });
    expect(v.areas).toBe(4);
    expect(v.items.find((i) => i.id === 'top_skills')).toMatchObject({ confirmed: true, source: 'self' });
    expect(v.items.find((i) => i.id === 'current_role')).toMatchObject({ confirmed: false, source: 'ai', provider: 'ChatGPT' });
    expect(v.missingAreas.find((m) => m.key === 'goals')).toMatchObject({ empty: true });
    expect(v.unconfirmed).toBe(3);
  });

  it('another candidate sees none of it, and cannot confirm, move or delete it', async () => {
    const w = await load();
    await seed(w);
    const other = await knowledgeView(readCtx(w.cand('C02')));
    expect(other.items.some((i) => i.text.includes('parkrun'))).toBe(false);
    await expect(w.T(w.cand('C02'), (c) => deleteKnowledge(c, 'top_skills'))).rejects.toThrow();
    await expect(w.T(w.cand('C02'), (c) => confirmKnowledge(c, 'current_role'))).rejects.toThrow();
    await expect(w.T(w.cand('C02'), (c) => setKnowledgeCategory(c, 'current_role', 'goals'))).rejects.toThrow();
    // C01's rows are untouched (C02 may have a row with the same key of their own).
    const mine = await db().select().from(S.onboardingAnswers).where(eq(S.onboardingAnswers.candidateId, w.ids.candidates.C01));
    expect(mine).toHaveLength(4);
    expect(mine.find((r) => r.questionKey === 'current_role')).toMatchObject({ source: 'ai', knowledgeCategory: null });
    await expect(knowledgeView(readCtx(w.consultant()))).rejects.toThrow();
  });

  it('confirm keeps the words and where they came from; move and delete change only that row', async () => {
    const w = await load();
    await seed(w);
    await w.T(w.cand('C01'), (c) => confirmKnowledge(c, 'current_role'));
    let v = await knowledgeView(readCtx(w.cand('C01')));
    expect(v.items.find((i) => i.id === 'current_role')).toMatchObject({ confirmed: true, provider: 'ChatGPT', text: 'Accounts assistant in a small finance team.' });
    // Their AI can no longer overwrite it.
    const r = await w.T(w.cand('C01'), (c) => saveAiAnswers(c, 'ChatGPT', [{ key: 'current_role', answer: 'Something else' }]));
    expect(r.skipped).toHaveLength(1);
    await w.T(w.cand('C01'), (c) => setKnowledgeCategory(c, 'current_role', 'goals'));
    v = await knowledgeView(readCtx(w.cand('C01')));
    expect(v.items.find((i) => i.id === 'current_role')).toMatchObject({ category: 'goals', categoryChosen: true });
    await expect(w.T(w.cand('C01'), (c) => setKnowledgeCategory(c, 'current_role', 'nonsense'))).rejects.toThrow();
    await w.T(w.cand('C01'), (c) => deleteKnowledge(c, 'qualifications'));
    v = await knowledgeView(readCtx(w.cand('C01')));
    expect(v.total).toBe(3);
    expect(v.items.some((i) => i.id === 'qualifications')).toBe(false);
  });

  it('adding from the globe files it in the chosen area; reviews keep only the verdict', async () => {
    const w = await load();
    await seed(w);
    const { id } = await w.T(w.cand('C01'), (c) => addKnowledge(c, 'What I care about', 'Saying early when something is going wrong.', 'values'));
    const v = await knowledgeView(readCtx(w.cand('C01')));
    expect(v.items.find((i) => i.id === id)).toMatchObject({ category: 'values', confirmed: true });
    await w.T(w.cand('C01'), (c) => reviewAnswer(c, 'inaccurate', ['top_skills']));
    const [ev] = await db().select().from(S.activityEvents).where(and(eq(S.activityEvents.subjectId, w.ids.candidates.C01), eq(S.activityEvents.action, 'minime.answer_reviewed')));
    expect(ev.metadata).toEqual({ verdict: 'inaccurate', records: 1 });
  });

  it('basic mode (no AI): quotes the closest records and returns exactly their ids', async () => {
    const w = await load();
    await seed(w);
    const r = await askMiniMe(w.cand('C01'), 'What am I best at?', 'ask');
    expect(r.live).toBe(false);
    expect(r.usedIds).toEqual(['top_skills']);
    expect(r.answer).toContain('Reconciliations');
    const none = await askMiniMe(w.cand('C01'), 'Which football team do I support?', 'ask');
    expect(none.usedIds).toEqual([]);
    expect(none.notKnown).toBeTruthy();
  });

  it('live mode: ids the AI wasn’t given are dropped, and an answer with no records may only say it doesn’t know', async () => {
    const w = await load();
    await seed(w);
    let seen: AskMiniMeInput | null = null;
    setProviderForTests({ ...fixtureProvider, name: 'anthropic', askMiniMe: async (i) => { seen = i; return { provider: 'anthropic', usage, output: { answer: 'I’m best at reconciliations and Excel.', usedIds: ['top_skills', 'made_up_id', 'top_skills'], notKnown: null } }; } });
    const r = await askMiniMe(w.cand('C01'), 'What am I best at?', 'interview');
    expect(r).toMatchObject({ live: true, usedIds: ['top_skills'], answer: 'I’m best at reconciliations and Excel.' });
    expect(seen!.mode).toBe('interview');
    // A small profile is sent whole, and only this candidate's records.
    const sent = seen!.records.map((x) => x.id);
    expect(sent).toHaveLength(4);
    expect(sent).toEqual(expect.arrayContaining(['current_role', 'qualifications', 'top_skills']));
    expect(sent.filter((id) => id.startsWith('extra:'))).toHaveLength(1);

    setProviderForTests({ ...fixtureProvider, name: 'anthropic', askMiniMe: async () => ({ provider: 'anthropic', usage, output: { answer: 'I support Arsenal.', usedIds: [], notKnown: null } }) });
    const r2 = await askMiniMe(w.cand('C01'), 'Which football team do I support?', 'ask');
    expect(r2.usedIds).toEqual([]);
    expect(r2.answer).not.toContain('Arsenal');
    expect(r2.notKnown).toBeTruthy();
  });
});
