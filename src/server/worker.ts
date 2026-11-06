/** Durable job worker. Run with `npm run worker`. Uses the same services and policies as the web app. */
import { loadEnv } from '../../scripts/load-env';
loadEnv();
import { randomUUID } from 'node:crypto';
import { sql } from 'drizzle-orm';
import { db, closeDb } from './db/client';
import { processOne } from './services/worker-handlers';
import { enqueue } from './services/jobs';
import { getActiveDataset } from './services/context';

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

async function main() {
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
      if (Date.now() - lastExpiry > 60000) { await tickExpiry(); lastExpiry = Date.now(); }
      const did = await processOne(workerId);
      if (!did) await new Promise((r) => setTimeout(r, 1000));
    } catch (e) {
      console.error('[worker] loop error', (e as Error).message);
      await new Promise((r) => setTimeout(r, 2000));
    }
  }
  await closeDb();
  console.log('[worker] stopped');
}

process.on('SIGTERM', () => { stopping = true; });
process.on('SIGINT', () => { stopping = true; });
main();
