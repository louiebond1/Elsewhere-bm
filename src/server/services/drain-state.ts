import { AsyncLocalStorage } from 'node:async_hooks';

/**
 * Shared across Next.js server bundles. A route bundle and the cron bundle each
 * evaluate this module, so the store lives on globalThis rather than in module scope.
 */
type DrainStore = { deadline: number };
const KEY = Symbol.for('bondmoran.drainAls');
type GlobalAls = typeof globalThis & { [key: symbol]: AsyncLocalStorage<DrainStore> };

function als(): AsyncLocalStorage<DrainStore> {
  const g = globalThis as GlobalAls;
  if (!g[KEY]) g[KEY] = new AsyncLocalStorage();
  return g[KEY];
}

/** Leave at least this long before claiming another job, so a short task can finish. */
export const DRAIN_MIN_SLICE_MS = 8_000;

export function runInDrain<T>(deadline: number, fn: () => Promise<T>): Promise<T> {
  return als().run({ deadline }, fn);
}

export function inDrain(): boolean {
  return als().getStore() !== undefined;
}

/** Milliseconds left in the current drain. Infinite outside one, so the local worker is not cut short. */
export function drainRemainingMs(now = Date.now()): number {
  const store = als().getStore();
  if (!store) return Number.POSITIVE_INFINITY;
  return store.deadline - now;
}

export function drainBudgetExhausted(now = Date.now()): boolean {
  const store = als().getStore();
  if (!store || !Number.isFinite(store.deadline)) return false;
  return now > store.deadline - DRAIN_MIN_SLICE_MS;
}
