import 'server-only';
import { sql } from 'drizzle-orm';
import { createHash, randomUUID } from 'node:crypto';
import { db } from '../db/client';
import { aiRuns, aiBudgetReservations } from '../db/schema';
import { prototype } from '../../config/prototype';
import { PROMPT_VERSION } from './prompts';
import { fixtureProvider } from './providers/fixture';
import { anthropicProvider, cheapModel } from './providers/anthropic';
import { AiFailure, type AiProvider, type AiResult } from './providers/types';
import { eq } from 'drizzle-orm';

export { AiFailure };
export const aiMode = (): 'fixture' | 'live' => (process.env.AI_PROVIDER === 'live' ? 'live' : 'fixture');
export const provider = (): AiProvider => (aiMode() === 'live' ? anthropicProvider : fixtureProvider);
export const providerLabel = () => (aiMode() === 'live' ? 'Live AI on fictional data' : 'Demo responses');

const EST_OUTPUT: Record<string, number> = { question: 700, extract: 2000, feedback: 1000, role: 1500, assess: 1500 };

/** Deployment-wide daily token admission. Uses the real UTC clock, survives demo resets. */
async function reserve(task: string, inputChars: number): Promise<string | null> {
  if (aiMode() !== 'live') return null;
  const est = Math.ceil(inputChars / 3) + 600 + (EST_OUTPUT[task] ?? 1500);
  const today = new Date().toISOString().slice(0, 10);
  const key = randomUUID();
  return db().transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${'ai_budget:' + today}, 0))`);
    const r = await tx.execute(sql`select coalesce(sum(case when state = 'reconciled' then actual_tokens when state = 'reserved' and expires_at > now() then reserved_tokens else 0 end),0)::int as used from ai_budget_reservations where utc_date = ${today}`);
    const used = (r.rows[0] as { used: number }).used;
    if (used + est > prototype.aiDailyTokenLimit) throw new AiFailure('daily_budget', 'The prototype daily AI token limit has been reached. Try again tomorrow.');
    await tx.insert(aiBudgetReservations).values({ requestKey: key, utcDate: today, reservedTokens: est, expiresAt: new Date(Date.now() + 3600_000) });
    return key;
  });
}

async function reconcile(key: string | null, actual: number | null) {
  if (!key) return;
  if (actual == null) return; // keep the reservation until it expires (conservative)
  await db().update(aiBudgetReservations).set({ actualTokens: actual, state: 'reconciled', updatedAt: new Date() }).where(eq(aiBudgetReservations.requestKey, key));
}

let inFlight = 0;
const waiters: (() => void)[] = [];
async function slot() {
  if (inFlight < prototype.aiConcurrency) { inFlight++; return; }
  await new Promise<void>((r) => waiters.push(r));
  inFlight++;
}
function release() { inFlight--; waiters.shift()?.(); }

export type RunMeta = { task: 'question' | 'extract' | 'feedback' | 'assess' | 'role'; datasetId?: string | null; userId?: string | null; candidateId?: string | null; roleId?: string | null; jobId?: string | null; input: unknown };

/** Runs an AI task outside any database transaction and records usage (never bodies). */
export async function runAi<T>(meta: RunMeta, fn: (p: AiProvider) => Promise<AiResult<T>>): Promise<AiResult<T>> {
  const inputJson = JSON.stringify(meta.input);
  const key = await reserve(meta.task, inputJson.length);
  const started = Date.now();
  await slot();
  try {
    const res = await fn(provider());
    await reconcile(key, res.usage.inputTokens + res.usage.outputTokens);
    await db().insert(aiRuns).values({ datasetId: meta.datasetId ?? null, jobId: meta.jobId ?? null, userId: meta.userId ?? null, candidateId: meta.candidateId ?? null, roleId: meta.roleId ?? null, task: meta.task, provider: res.provider, modelId: res.usage.modelId, promptVersion: PROMPT_VERSION, inputHash: createHash('sha256').update(inputJson).digest('hex'), inputTokens: res.usage.inputTokens, outputTokens: res.usage.outputTokens, cacheReadTokens: res.usage.cacheReadTokens, cacheWriteTokens: res.usage.cacheWriteTokens, durationMs: Date.now() - started, outcome: 'succeeded' });
    return res;
  } catch (e) {
    const code = e instanceof AiFailure ? e.code : 'unknown';
    const u = (e as { usage?: { inputTokens: number; outputTokens: number } }).usage;
    await reconcile(key, u ? u.inputTokens + u.outputTokens : null);
    await db().insert(aiRuns).values({ datasetId: meta.datasetId ?? null, jobId: meta.jobId ?? null, userId: meta.userId ?? null, candidateId: meta.candidateId ?? null, roleId: meta.roleId ?? null, task: meta.task, provider: aiMode() === 'live' ? 'anthropic' : 'fixture', modelId: aiMode() === 'live' ? cheapModel() : 'fixture', promptVersion: PROMPT_VERSION, inputTokens: u?.inputTokens ?? 0, outputTokens: u?.outputTokens ?? 0, durationMs: Date.now() - started, outcome: code === 'refused' ? 'refused' : 'failed', errorCode: code });
    throw e;
  } finally {
    release();
  }
}
