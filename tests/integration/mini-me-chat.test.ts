import { describe, it, expect, afterEach } from 'vitest';
import { eq } from 'drizzle-orm';
import { load } from './helpers';
import { db } from '../../src/server/db/client';
import * as S from '../../src/server/db/schema';
import { readCtx } from '../../src/server/services/context';
import { setProviderForTests } from '../../src/server/ai';
import { fixtureProvider } from '../../src/server/ai/providers/fixture';
import { chatTurn, chatMessages } from '../../src/server/services/mini-me-chat';
import { onboardingView } from '../../src/server/services/onboarding';

afterEach(() => setProviderForTests(null));
const usage = { inputTokens: 300, outputTokens: 120, cacheReadTokens: 0, cacheWriteTokens: 0, modelId: 'claude-haiku-5-5' };

describe('in-app mini-me chat (for people without ChatGPT or Claude)', () => {
  it('demo mode: asks a question, saves the answer against it straight into the mini-me, asks the next', async () => {
    const w = await load();
    const first = await chatTurn(w.cand('C01'), null);
    expect(first.reply).toMatch(/\?/);
    const [asked] = await db().select().from(S.miniMeChat).where(eq(S.miniMeChat.candidateId, w.ids.candidates.C01));
    expect(asked.askedKey).toBeTruthy();
    const r = await chatTurn(w.cand('C01'), 'Something true about me.');
    expect(r).toMatchObject({ saved: 1, live: false });
    const v = await onboardingView(readCtx(w.cand('C01')));
    expect(v.feed.find((f) => f.answer === 'Something true about me.')).toMatchObject({ source: 'ai', provider: 'Elsewhere', approved: true });
    expect((await chatMessages(readCtx(w.cand('C01')))).map((m) => m.role)).toEqual(['assistant', 'user', 'assistant']);
    // Opening the chat again doesn't repeat the greeting.
    expect((await chatTurn(w.cand('C01'), null)).reply).toBeNull();
  });

  it('live mode: one story is split into several saved items, and stated preferences are saved', async () => {
    const w = await load();
    setProviderForTests({ ...fixtureProvider, name: 'anthropic', miniMeChat: async () => ({ provider: 'anthropic', usage, output: {
      reply: 'Great story. How did the team take it afterwards?', askedKey: 'ex_teamwork',
      save: [
        { topic: 'Handling disagreements', detail: 'Disagreed with a supplier on pricing and fixed it by checking every invoice line together.', questionKey: 'ex_problem' },
        { topic: 'Work trip to Thailand', detail: 'Travelled to Bangkok for work to meet a supplier.', questionKey: null },
      ],
      preferences: { region: 'manchester', workModes: ['hybrid'], roleFamilies: ['operations'], minSalaryPounds: 36000, noticeWeeks: 4 },
    } }) });
    const r = await chatTurn(w.cand('C01'), 'I went to Thailand with work and had a disagreement with a supplier... I want hybrid ops roles in Manchester from 36k, 4 weeks notice.');
    expect(r).toMatchObject({ saved: 2, live: true, reply: 'Great story. How did the team take it afterwards?' });
    const v = await onboardingView(readCtx(w.cand('C01')));
    expect(v.feed.map((f) => f.text)).toEqual(expect.arrayContaining(['Solving a problem', 'Work trip to Thailand']));
    const [c] = await db().select().from(S.candidates).where(eq(S.candidates.id, w.ids.candidates.C01));
    expect(c).toMatchObject({ region: 'manchester', preferencesConfirmed: true, noticeWeeks: 4 });
  });
});
