/** Durable job worker. Run with `npm run worker`. Uses the same services and policies as the web app. */
import { loadEnv } from '../../scripts/load-env';
loadEnv();
import { randomUUID } from 'node:crypto';
import { sql } from 'drizzle-orm';
import { db, closeDb } from './db/client';
import { processOne } from './services/worker-handlers';
import { enqueue } from './services/jobs';
import { getActiveDataset } from './services/context';
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

async function tickExpiry() {
  const ds = await getActiveDataset();
  if (!ds) return;
  const bucket = Math.floor(Date.now() / 60000);
  await enqueue({ tx: db(), datasetId: ds.id }, 'expire_intros', null, `expire:${bucket}`);
}

/**
 * Every 10 minutes: make sure everyone eligible for every live job has a current interview. Interviews also start
 * on their own when something changes; this sweep catches anything missed (e.g. jobs open before a deploy).
 */
async function tickInterviews() {
  const ds = await getActiveDataset();
  if (!ds) return;
  const { withTx, baseCtx } = await import('./services/context');
  const { roles } = await import('./db/schema');
  const { and, eq } = await import('drizzle-orm');
  const { requestSimulations } = await import('./services/simulation');
  const open = await db().select({ id: roles.id }).from(roles).where(and(eq(roles.datasetId, ds.id), eq(roles.status, 'open')));
  let queued = 0;
  const base = await baseCtx({ kind: 'system', label: 'interview-sweep' });
  for (const r of open) if ((await withTx(base, (ctx) => requestSimulations(ctx, r.id))).queued) queued++;
  if (queued) console.log(`[worker] interview sweep: ${queued} of ${open.length} live jobs had people to interview`);
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
  let lastSweep = 0;
  while (!stopping) {
    try {
      if (Date.now() - lastExpiry > 60000) { await tickExpiry(); lastExpiry = Date.now(); }
      if (Date.now() - lastSweep > 600000) { lastSweep = Date.now(); await tickInterviews(); }
      const did = await processOne(workerId);
      if (!did) await new Promise((r) => setTimeout(r, 1000));
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
