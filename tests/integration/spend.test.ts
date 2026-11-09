import { describe, it, expect, afterEach, beforeEach } from 'vitest';
import { sql } from 'drizzle-orm';
import { ensureMigrated } from './helpers';
import { db } from '../../src/server/db/client';
import { setProviderForTests, runAi, AiFailure } from '../../src/server/ai';
import { fixtureProvider } from '../../src/server/ai/providers/fixture';
import type { AiProvider, Usage } from '../../src/server/ai/providers/types';
import { monthSpendMicroUsd, monthlyBudgetMicroUsd, worstCaseMicroUsd, actualMicroUsd } from '../../src/server/ai/spend';

const usage = (over: Partial<Usage> = {}): Usage => ({ inputTokens: 1000, outputTokens: 200, cacheReadTokens: 0, cacheWriteTokens: 0, modelId: 'claude-haiku-5-5', ...over });
let calls = 0;
const standIn = (u: Usage | null, fail?: AiFailure): AiProvider => ({ ...fixtureProvider, name: 'anthropic', feedback: async () => {
  calls++;
  if (fail) throw u ? Object.assign(fail, { usage: u }) : fail;
  return { provider: 'anthropic', usage: u!, output: { strengths: [], gaps: [], nextQuestion: null } } as never;
} });
const feedback = () => runAi({ task: 'feedback', input: { evidence: [] } }, (p) => p.feedback({ evidence: [] }));

beforeEach(async () => { await ensureMigrated(); await db().execute(sql`delete from ai_spend`); calls = 0; delete process.env.AI_MONTHLY_BUDGET_USD; });
afterEach(() => { setProviderForTests(null); delete process.env.AI_MONTHLY_BUDGET_USD; });

describe('monthly AI spend cap', () => {
  it('is $5 by default and can be lowered but never raised by configuration', () => {
    expect(monthlyBudgetMicroUsd()).toBe(5_000_000n);
    process.env.AI_MONTHLY_BUDGET_USD = '50';
    expect(monthlyBudgetMicroUsd()).toBe(5_000_000n);
    process.env.AI_MONTHLY_BUDGET_USD = '0.5';
    expect(monthlyBudgetMicroUsd()).toBe(500_000n);
  });

  it('prices from published rates; unknown models are refused', () => {
    expect(actualMicroUsd(usage(), 'claude-haiku-5-5')).toBe(200n); // 1000 x 0.10 + 200 x 0.50
    expect(actualMicroUsd(usage({ outputTokens: 1000 }), 'claude-sonnet-5-5')).toBe(12_000n); // 1000 x 2 + 1000 x 10
    expect(() => worstCaseMicroUsd('some-other-model', 100, 100)).toThrow(AiFailure);
  });

  it('books the worst case, then settles to the actual cost', async () => {
    setProviderForTests(standIn(usage()));
    await feedback();
    expect(await monthSpendMicroUsd()).toBe(200n);
  });

  it('a failed call without usage keeps its full worst case counted; with usage, the actual cost', async () => {
    setProviderForTests(standIn(null, new AiFailure('timeout', 'timed out', true)));
    await expect(feedback()).rejects.toMatchObject({ code: 'timeout' });
    const worst = worstCaseMicroUsd('claude-haiku-5-5', JSON.stringify({ evidence: [] }).length, 1000);
    expect(await monthSpendMicroUsd()).toBe(worst);
    setProviderForTests(standIn(usage({ outputTokens: 0 }), new AiFailure('schema_contract', 'bad')));
    await expect(feedback()).rejects.toMatchObject({ code: 'schema_contract' });
    expect(await monthSpendMicroUsd()).toBe(worst + 100n);
  });

  it('refuses before sending anything once the next call could pass the cap', async () => {
    process.env.AI_MONTHLY_BUDGET_USD = '0.002'; // 2,000 micro-dollars: room for one worst-case feedback call
    setProviderForTests(standIn(usage()));
    await feedback();
    const spent = await monthSpendMicroUsd();
    await db().execute(sql`insert into ai_spend (request_key, utc_month, task, model_id, reserved_micro_usd, state) values ('filler', ${new Date().toISOString().slice(0, 7)}, 'test', 'claude-haiku-5-5', ${(2000n - spent - 100n).toString()}, 'unsettled')`);
    const before = calls;
    await expect(feedback()).rejects.toMatchObject({ code: 'monthly_budget' });
    expect(calls).toBe(before);
  });

  it('concurrent calls from many processes cannot overshoot: admission is serialised', async () => {
    const worst = worstCaseMicroUsd('claude-haiku-5-5', JSON.stringify({ evidence: [] }).length, 1000);
    process.env.AI_MONTHLY_BUDGET_USD = (Number(worst * 3n) / 1_000_000).toString(); // room for exactly three worst cases
    setProviderForTests(standIn(null, new AiFailure('timeout', 'never settles', true)));
    const results = await Promise.allSettled(Array.from({ length: 8 }, () => feedback()));
    const refused = results.filter((r) => r.status === 'rejected' && (r.reason as AiFailure).code === 'monthly_budget').length;
    expect(refused).toBe(5);
    expect(calls).toBe(3);
    expect(await monthSpendMicroUsd()).toBeLessThanOrEqual(monthlyBudgetMicroUsd());
  });

  it('demo mode never books spend', async () => {
    await runAi({ task: 'feedback', input: { evidence: [] } }, (p) => p.feedback({ evidence: [] }));
    expect(await monthSpendMicroUsd()).toBe(0n);
  });
});
