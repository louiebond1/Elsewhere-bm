import { describe, it, expect, afterEach } from 'vitest';
import { eq } from 'drizzle-orm';
import { load } from './helpers';
import { db } from '../../src/server/db/client';
import * as S from '../../src/server/db/schema';
import { setProviderForTests } from '../../src/server/ai';
import { fixtureProvider } from '../../src/server/ai/providers/fixture';
import type { AiProvider } from '../../src/server/ai/providers/types';
import { readCtx, type BaseCtx } from '../../src/server/services/context';
import * as hiring from '../../src/server/services/hiring-assistant';
import { activateRole, criteriaFor } from '../../src/server/services/roles';

afterEach(() => setProviderForTests(null));

type W = Awaited<ReturnType<typeof load>>;
async function say(w: W, base: BaseCtx, conversationId: string | null, text: string) {
  const { ROUTES } = await import('../../src/server/api-routes');
  const r = ROUTES.find((x) => x.path === 'client/hiring/message')!;
  const userId = (base.actor as { userId: string }).userId;
  return (await r.h({ req: {} as never, viewer: { actor: { userId } } as never, base, p: {}, body: { conversationId, text } })) as { id: string };
}
const SCRIPT = ['We need a finance assistant to help with payroll and reconciliations.', 'In six months they should run payroll on their own.', 'Reporting matters too, and Excel would be a bonus.', 'We will teach our systems', '38k', 'London', 'Hybrid'];
async function converse(w: W, base: BaseCtx, lines = SCRIPT) {
  let id: string | null = null;
  for (const t of lines) id = (await say(w, base, id, t)).id;
  return id!;
}

describe('hiring assistant', () => {
  it('first-time greeting, a conversation in demo mode, then Create role gives a draft that can go live', async () => {
    const w = await load();
    const v0 = await hiring.assistantView(readCtx(w.client('A')));
    expect(v0.conversationId).toBeNull();
    expect(v0.messages[0].text).toMatch(/^Hi Emma, I'm your hiring assistant/);
    expect(await db().select().from(S.hiringConversations).where(eq(S.hiringConversations.datasetId, w.ids.datasetId))).toHaveLength(0);

    const id = await converse(w, w.client('A'));
    const v = await hiring.assistantView(readCtx(w.client('A')));
    expect(v.messages).toHaveLength(1 + SCRIPT.length * 2);
    expect(v.messages.at(-1)!.text).toMatch(/That’s everything I need/);

    const role = await w.T(w.client('A'), (c) => hiring.saveAsDraft(c, id));
    expect(role).toMatchObject({ status: 'draft', title: 'Finance Assistant', roleFamily: 'finance', locationRegion: 'london', workMode: 'hybrid', salaryPence: 3800000n, vacancyKey: 'ALD-004' });
    const crit = await criteriaFor(readCtx(w.client('A')), role.id);
    expect(crit.map((c) => [c.label, c.importance])).toEqual([['Payroll', 'essential'], ['Reconciliations', 'essential'], ['Reporting', 'essential'], ['Excel', 'desirable']]);
    // Alder already has its included open roles, so this goes live as an extra role after confirmation.
    const live = await w.T(w.client('A'), (c) => activateRole(c, role.id, { confirmExtraDeposit: true, idempotencyKey: w.key() }));
    expect(live.status).toBe('open');
    await expect(w.T(w.client('A'), (c) => hiring.saveAsDraft(c, id))).rejects.toMatchObject({ code: 'CONVERSATION_CLOSED' });
  });

  it('remembers the manager next time, assumes their usual location and work pattern, and lets them forget', async () => {
    const w = await load();
    const id = await converse(w, w.client('A'));
    await w.T(w.client('A'), (c) => hiring.saveAsDraft(c, id));
    const v = await hiring.assistantView(readCtx(w.client('A')));
    expect(v.conversationId).toBeNull();
    expect(v.messages[0].text).toMatch(/^Welcome back, Emma. Last time we set up Finance Assistant together. I've assumed hybrid in London/);
    expect(v.understanding).toMatchObject({ locationRegion: 'london', workMode: 'hybrid', assumed: ['locationRegion', 'workMode'] });
    expect(v.facts.map((f) => f.text)).toEqual(['Usually hires for hybrid roles in London', 'Tends to prioritise payroll, reconciliations, reporting', 'Happy to teach: our systems']);
    const wp = v.facts.find((f) => f.kind === 'work_pattern')!;
    await w.T(w.client('A'), (c) => hiring.forgetFact(c, wp.id));
    const after = await hiring.assistantView(readCtx(w.client('A')));
    expect(after.facts.map((f) => f.kind)).not.toContain('work_pattern');
    expect(after.understanding.locationRegion).toBeNull();
  });

  it('cannot save until everything needed is there; removing an item updates what is still needed', async () => {
    const w = await load();
    const id = await converse(w, w.client('A'), SCRIPT.slice(0, 3));
    await expect(w.T(w.client('A'), (c) => hiring.saveAsDraft(c, id))).rejects.toMatchObject({ code: 'VALIDATION' });
    const done = await converse(w, w.client('B'));
    await w.T(w.client('B'), (c) => hiring.removeItem(c, done, 'mustHaves', 0));
    await w.T(w.client('B'), (c) => hiring.removeItem(c, done, 'mustHaves', 0));
    const [row] = await db().select().from(S.hiringConversations).where(eq(S.hiringConversations.id, done));
    expect((row.understanding as { mustHaves: unknown[] }).mustHaves).toHaveLength(1);
    expect(row.lastAsked).toBe('skills');
    await expect(w.T(w.client('B'), (c) => hiring.saveAsDraft(c, done))).rejects.toMatchObject({ code: 'VALIDATION' });
  });

  it('a conversation belongs to its own user only', async () => {
    const w = await load();
    const id = await converse(w, w.client('A'), SCRIPT.slice(0, 2));
    await expect(w.T(w.client('B'), (c) => hiring.saveAsDraft(c, id))).rejects.toMatchObject({ status: 404 });
    await expect(say(w, w.client('B'), id, 'hello')).rejects.toMatchObject({ status: 404 });
    await expect(hiring.assistantView(readCtx(w.consultant()))).rejects.toMatchObject({ status: 403 });
    await expect(hiring.assistantView(readCtx(w.cand('C01')))).rejects.toMatchObject({ status: 403 });
    await expect(say(w, w.client('A'), 'not-a-uuid', 'hello')).rejects.toMatchObject({ name: 'ZodError' });
  });

  it('a stale second window cannot overwrite the conversation', async () => {
    const w = await load();
    const id = await converse(w, w.client('A'), SCRIPT.slice(0, 1));
    const p = await hiring.prepareTurn(readCtx(w.client('A')), id);
    await say(w, w.client('A'), id, SCRIPT[1]);
    await expect(w.T(w.client('A'), (c) => hiring.commitTurn(c, p, 'late', hiring.demoTurn(p, 'late')))).rejects.toMatchObject({ code: 'CONVERSATION_CHANGED' });
  });

  it('live mode: the model proposal is clamped, readiness is decided by the server, and learned notes are remembered', async () => {
    const w = await load();
    let seen: unknown = null;
    const standIn: AiProvider = { ...fixtureProvider, name: 'anthropic', hiringTurn: async (i) => {
      seen = i;
      return { provider: 'anthropic', usage: { inputTokens: 100, outputTokens: 50, cacheReadTokens: 0, cacheWriteTokens: 0, modelId: 'stand-in' }, output: {
        reply: 'Lovely. What is the salary?',
        understanding: { title: 'Operations Coordinator', roleFamily: 'operations', salaryPounds: null, locationRegion: null, workMode: null, outcomes: ['Smooth handoffs'], mustHaves: [{ label: 'Coordinating suppliers', tags: ['coordination'] }, { label: 'Young team player', tags: ['learning'] }], niceToHaves: [], teachable: [] },
        learned: ['Values people who fix broken processes', 'Prefers younger candidates'],
      } };
    } };
    setProviderForTests(standIn);
    const { id } = await say(w, w.client('A'), null, 'I need an operations coordinator, ideally young');
    expect((seen as { missing: string[] }).missing[0]).toBe('title');
    const [row] = await db().select().from(S.hiringConversations).where(eq(S.hiringConversations.id, id));
    expect(row.provider).toBe('anthropic');
    expect((row.understanding as { mustHaves: { label: string }[] }).mustHaves.map((m) => m.label)).toEqual(['Coordinating suppliers']);
    expect(row.lastAsked).toBe('skills');
    const v = await hiring.assistantView(readCtx(w.client('A')));
    expect(v.facts.map((f) => f.text)).toEqual(['Values people who fix broken processes']);
    const runs = await db().select().from(S.aiRuns).where(eq(S.aiRuns.task, 'hiring'));
    expect(runs.some((r) => r.outcome === 'succeeded')).toBe(true);
  });
});
