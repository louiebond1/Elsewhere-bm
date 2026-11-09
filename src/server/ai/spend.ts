import 'server-only';
import { randomUUID } from 'node:crypto';
import { and, eq, sql } from 'drizzle-orm';
import { db } from '../db/client';
import { aiSpend } from '../db/schema';
import { prototype } from '../../config/prototype';
import { AiFailure, type Usage } from './providers/types';

/**
 * Hard monthly AI money cap, shared by every process (web and worker) through the database.
 * Amounts are integer micro-dollars: tokens x (USD per million tokens) = micro-USD.
 */
export function monthlyBudgetMicroUsd(): bigint {
  const env = Number(process.env.AI_MONTHLY_BUDGET_USD);
  const usd = Number.isFinite(env) && env >= 0 ? Math.min(env, prototype.aiMonthlyBudgetUsd) : prototype.aiMonthlyBudgetUsd;
  return BigInt(Math.floor(usd * 1_000_000));
}

export const utcMonth = (d = new Date()) => d.toISOString().slice(0, 7);

function prices(modelId: string): [number, number] {
  const p = prototype.aiPricesUsdPerMTok[modelId];
  if (!p) throw new AiFailure('model_unpriced', `No price is configured for ${modelId}, so it cannot be used within the monthly budget.`);
  return p;
}

const micro = (tokens: number, usdPerMTok: number) => BigInt(Math.ceil(tokens * usdPerMTok));

/**
 * Worst case for one attempt: generous input estimate (2 characters per token plus 3,000 tokens of instructions),
 * priced as a cache write (1.25x input), plus the full output allowance at the output price.
 */
export function worstCaseMicroUsd(modelId: string, inputChars: number, maxOutputTokens: number): bigint {
  const [inP, outP] = prices(modelId);
  const inTokens = Math.ceil(inputChars / 2) + 3000;
  return micro(inTokens, inP * 1.25) + micro(maxOutputTokens, outP);
}

/** Actual cost from the provider's usage figures (cache writes 1.25x, cache reads 0.1x input). */
export function actualMicroUsd(u: Usage, modelId: string): bigint {
  const [inP, outP] = prices(modelId);
  return micro(u.inputTokens, inP) + micro(u.cacheWriteTokens, inP * 1.25) + micro(u.cacheReadTokens, inP * 0.1) + micro(u.outputTokens, outP);
}

/** Spent this month: settled rows at their actual cost; reserved and unsettled rows at their worst case. */
export async function monthSpendMicroUsd(month = utcMonth()) {
  const r = await db().execute(sql`select coalesce(sum(case when state = 'settled' then actual_micro_usd else reserved_micro_usd end), 0)::bigint as used from ai_spend where utc_month = ${month}`);
  return BigInt((r.rows[0] as { used: string }).used);
}

/** Books the worst case, or refuses the call. Serialised per month with an advisory lock, so concurrent calls cannot overshoot. */
export async function bookSpend(task: string, modelId: string, worst: bigint): Promise<string> {
  const month = utcMonth();
  const key = randomUUID();
  const budget = monthlyBudgetMicroUsd();
  await db().transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${'ai_spend:' + month}, 0))`);
    const r = await tx.execute(sql`select coalesce(sum(case when state = 'settled' then actual_micro_usd else reserved_micro_usd end), 0)::bigint as used from ai_spend where utc_month = ${month}`);
    const used = BigInt((r.rows[0] as { used: string }).used);
    if (used + worst > budget) throw new AiFailure('monthly_budget', 'The monthly AI budget for this app is used up. Your work is saved. Try again next month, or ask your consultant.');
    await tx.insert(aiSpend).values({ requestKey: key, utcMonth: month, task, modelId, reservedMicroUsd: worst });
  });
  return key;
}

/** Replaces the booking with the actual cost. Without usage figures the full worst case stays counted. */
export async function settleSpend(key: string, modelId: string, usage: Usage | null) {
  if (usage) await db().update(aiSpend).set({ actualMicroUsd: actualMicroUsd(usage, modelId), state: 'settled', updatedAt: new Date() }).where(and(eq(aiSpend.requestKey, key), eq(aiSpend.state, 'reserved')));
  else await db().update(aiSpend).set({ state: 'unsettled', updatedAt: new Date() }).where(and(eq(aiSpend.requestKey, key), eq(aiSpend.state, 'reserved')));
}
