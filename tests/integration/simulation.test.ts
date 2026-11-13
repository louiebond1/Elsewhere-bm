import { describe, it, expect, afterEach } from 'vitest';
import { and, eq, sql } from 'drizzle-orm';
import { load } from './helpers';
import { db } from '../../src/server/db/client';
import * as S from '../../src/server/db/schema';
import { setProviderForTests, AiFailure } from '../../src/server/ai';
import { fixtureProvider } from '../../src/server/ai/providers/fixture';
import type { AiProvider } from '../../src/server/ai/providers/types';
import { readCtx } from '../../src/server/services/context';
import { drainJobs } from '../../src/server/services/worker-handlers';
import { requestSimulations, simulationPending, NOT_SHARED, SIM_LIMIT } from '../../src/server/services/simulation';
import { bestPeople } from '../../src/server/views/client';

afterEach(() => { setProviderForTests(null); delete process.env.AI_MONTHLY_BUDGET_USD; });
const usage = { inputTokens: 500, outputTokens: 200, cacheReadTokens: 0, cacheWriteTokens: 0, modelId: 'claude-haiku-5-5' };

describe('simulated interviews and your best 10', () => {
  it('demo mode: interviews remain readable without ranking basic scores', async () => {
    const w = await load();
    const R1 = w.ids.roles.R1;
    await w.T(w.client('A'), (c) => requestSimulations(c, R1));
    expect(await simulationPending(readCtx(w.client('A')), R1)).toBe(true);
    await drainJobs();
    const rows = await db().select().from(S.simulatedInterviews).where(eq(S.simulatedInterviews.roleId, R1));
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.length).toBeLessThanOrEqual(SIM_LIMIT);
    expect(rows.every((r) => r.provider === 'fixture' && r.fitScore >= 0 && r.fitScore <= 100)).toBe(true);
    const { best, rest } = await bestPeople(readCtx(w.client('A')), R1);
    expect(best).toHaveLength(0); // Basic interviews cannot determine current evidence rankings.
    expect(rest.length).toBeGreaterThan(0);
    expect(rest.every((r) => !best.some((b) => b.dto.roleScopedReference === r.roleScopedReference))).toBe(true);
    // Answers are the candidate's approved, anonymised examples: no names or employers.
    const text = JSON.stringify(rest);
    for (const s of ['Maya', 'Ellis', 'Mallow', 'candidate.c01', 'Hannah Cole']) expect(text).not.toContain(s);
    // Nothing more to do: a second request queues nothing.
    expect(await w.T(w.client('A'), (c) => requestSimulations(c, R1))).toEqual({ queued: false });
  });

  it('never simulates someone hidden from this client (C05 blocks Alder)', async () => {
    const w = await load();
    await w.T(w.client('A'), (c) => requestSimulations(c, w.ids.roles.R1));
    await drainJobs();
    // Hidden from Alder's job; other clients' jobs still interview them.
    const rows = await db().select().from(S.simulatedInterviews).where(and(eq(S.simulatedInterviews.candidateId, w.ids.candidates.C05), eq(S.simulatedInterviews.roleId, w.ids.roles.R1)));
    expect(rows).toHaveLength(0);
  });

  it('live mode: answers citing examples that are not theirs, or naming them, are replaced; scores are clamped', async () => {
    const w = await load();
    const [ident] = await db().select().from(S.candidateIdentity).where(eq(S.candidateIdentity.candidateId, w.ids.candidates.C01));
    const standIn: AiProvider = { ...fixtureProvider, name: 'anthropic', simulateInterview: async (i) => ({ provider: 'anthropic', usage, output: {
      answers: [
        { questionIndex: 0, answer: i.examples[0] ? `I did this. ${i.examples[0].text}` : 'x', evidenceIds: i.examples[0] ? [i.examples[0].id] : [], score: 14, reason: 'Clear example.' },
        { questionIndex: 1, answer: 'Invented answer', evidenceIds: ['00000000-0000-0000-0000-000000000000'], score: 9, reason: 'Made up.' },
        { questionIndex: 2, answer: `My name is ${ident.fullName}.`, evidenceIds: i.examples[0] ? [i.examples[0].id] : [], score: 8, reason: `${ident.fullName} did well.` },
      ],
      fitScore: 100, summary: 'Strong match.', concerns: [],
    } }) };
    setProviderForTests(standIn);
    await w.T(w.client('A'), (c) => requestSimulations(c, w.ids.roles.R1));
    await drainJobs();
    const rows = await db().select().from(S.simulatedInterviews).where(eq(S.simulatedInterviews.roleId, w.ids.roles.R1));
    expect(rows.length).toBeGreaterThan(0);
    for (const r of rows) {
      expect(r.provider).toBe('anthropic');
      const a = r.answers as { answer: string; grounded: boolean }[];
      expect(a[1]).toMatchObject({ answer: NOT_SHARED, grounded: false });
      expect(a[2]).toMatchObject({ answer: NOT_SHARED, grounded: false });
      expect(JSON.stringify(a)).not.toContain(ident.fullName);
      // Scores are clamped to 0-10; a reason naming them is dropped; replaced answers score 0.
      const sc = r.answers as { grounded: boolean; score: number | null; reason: string; kind: string }[];
      if (sc[0].grounded) expect(sc[0]).toMatchObject({ score: 10, reason: 'Clear example.' });
      expect(sc[1]).toMatchObject({ score: 0, reason: 'Nothing in their mini-me covers this yet.' });
      for (const x of sc) if (x.kind === 'screening') expect(x.score).toBeNull();
      expect(r.scoreCard).toMatchObject({ factors: expect.any(Object), gaps: expect.any(Object) });
    }
  });

  it('when the AI budget is used up, the job finishes with demo simulations instead of paid calls', async () => {
    const w = await load();
    process.env.AI_MONTHLY_BUDGET_USD = '0';
    await db().execute(sql`delete from ai_spend`);
    let calls = 0;
    setProviderForTests({ ...fixtureProvider, name: 'anthropic', simulateInterview: async () => { calls++; throw new AiFailure('x', 'should not be called'); } });
    await w.T(w.client('A'), (c) => requestSimulations(c, w.ids.roles.R1));
    await drainJobs();
    expect(calls).toBe(0);
    const rows = await db().select().from(S.simulatedInterviews).where(eq(S.simulatedInterviews.roleId, w.ids.roles.R1));
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.every((r) => r.provider === 'fixture')).toBe(true);
    const spent = await db().execute(sql`select count(*)::int as n from ai_spend where task = 'simulate'`);
    expect((spent.rows[0] as { n: number }).n).toBe(0);
  });

  it('another client cannot start or read simulations for this job', async () => {
    const w = await load();
    const { ROUTES } = await import('../../src/server/api-routes');
    const start = ROUTES.find((r) => r.path === 'roles/:id/simulate')!;
    const status = ROUTES.find((r) => r.path === 'roles/:id/simulate-status')!;
    await expect(start.h({ req: {} as never, viewer: {} as never, base: w.client('B'), p: { id: w.ids.roles.R1 }, body: {} })).rejects.toMatchObject({ status: 404 });
    await expect(status.h({ req: {} as never, viewer: {} as never, base: w.client('B'), p: { id: w.ids.roles.R1 }, body: {} })).rejects.toMatchObject({ status: 404 });
  });
});
