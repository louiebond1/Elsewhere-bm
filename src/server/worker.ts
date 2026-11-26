/** Durable job worker. Run with `npm run worker`. Uses the same drain as the Vercel cron path. */
import { loadEnv } from '../../scripts/load-env';
loadEnv();
process.env.JOB_RUNNER = 'worker';
import { randomUUID } from 'node:crypto';
import { sql } from 'drizzle-orm';
import { db, closeDb } from './db/client';
import { drainQueue } from './services/worker-handlers';
import { sentryOptions, setErrorReporter, reportError } from './monitoring';

const workerId = `worker-${randomUUID().slice(0, 8)}`;
let stopping = false;

async function schemaReady() {
  try {
    await db().execute(sql`select 1 from application_state limit 1`);
    return true;
  } catch {
    return false;
  }
}

async function initMonitoring() {
  const opts = sentryOptions('worker');
  if (!opts) return;
  const Sentry = await import('@sentry/node');
  Sentry.init(opts);
  setErrorReporter((err, tags) => Sentry.captureException(err, { tags }));
  console.log('[worker] error monitoring enabled');
}

async function main() {
  await initMonitoring();
  if (!process.env.DATABASE_URL) {
    console.error('[worker] DATABASE_URL is not set');
    process.exit(1);
  }
  while (!(await schemaReady())) {
    console.error('[worker] database schema not ready; run migrations. Retrying in 10s.');
    await new Promise((r) => setTimeout(r, 10000));
    if (stopping) return;
  }
  console.log(`[worker] ${workerId} started`);
  let lastExpiry = 0;
  while (!stopping) {
    try {
      const tick = Date.now() - lastExpiry > 60_000;
      const result = await drainQueue({ workerId, tickExpiry: tick, max: 20 });
      if (tick) lastExpiry = Date.now();
      if (result.processed === 0) await new Promise((r) => setTimeout(r, 1000));
    } catch (e) {
      console.error('[worker] loop error', (e as Error).message);
      reportError(e, { where: 'worker_loop' });
      await new Promise((r) => setTimeout(r, 2000));
    }
  }
  await closeDb();
  console.log('[worker] stopped');
}

process.on('SIGTERM', () => { stopping = true; });
process.on('SIGINT', () => { stopping = true; });
main();
