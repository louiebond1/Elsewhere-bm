import { after } from 'next/server';
import { reportError } from '../monitoring';

/**
 * Schedules one queue drain after the response. The heavy worker module loads
 * only then, so the request transaction is not held open for it.
 * `after()` throws outside a Next.js request; callers catch that.
 */
export function scheduleBackgroundDrain() {
  after(() => {
    const run = import('./worker-handlers').then(({ drainQueue, INLINE_DRAIN_BUDGET_MS }) => drainQueue({
      budgetMs: INLINE_DRAIN_BUDGET_MS,
      max: 20,
      tickExpiry: true,
      workerId: 'inline',
    }));
    return run.catch((err) => {
      console.error('[drain] inline failed', (err as Error).message);
      reportError(err, { where: 'inline_drain' });
    });
  });
}
