import { describe, it, expect } from 'vitest';
import { DRAIN_MIN_SLICE_MS, drainBudgetExhausted, drainRemainingMs, inDrain, runInDrain } from '../../src/server/services/drain-state';

describe('drain time budget', () => {
  it('does not stop the local worker, which has no deadline', () => {
    expect(inDrain()).toBe(false);
    expect(drainRemainingMs()).toBe(Number.POSITIVE_INFINITY);
    expect(drainBudgetExhausted()).toBe(false);
  });
  it('stops claiming work once less than the minimum slice remains', async () => {
    await runInDrain(Date.now() + DRAIN_MIN_SLICE_MS - 1, async () => {
      expect(inDrain()).toBe(true);
      expect(drainBudgetExhausted()).toBe(true);
    });
    await runInDrain(Date.now() + 60_000, async () => {
      expect(drainBudgetExhausted()).toBe(false);
      expect(drainRemainingMs()).toBeGreaterThan(50_000);
    });
    await runInDrain(Number.POSITIVE_INFINITY, async () => {
      expect(drainBudgetExhausted()).toBe(false);
    });
    expect(inDrain()).toBe(false);
  });
});
