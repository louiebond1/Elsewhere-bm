import { randomUUID } from 'node:crypto';
import { eq, sql } from 'drizzle-orm';
import { db, type Executor, type Tx } from '../db/client';
import { applicationState, datasets } from '../db/schema';
import { AppError, isPgError } from '../lib/errors';

export type Actor =
  | { kind: 'user'; userId: string; userType: 'candidate' | 'client' | 'consultant'; clientId?: string | null; candidateId?: string | null }
  | { kind: 'system'; label: string };

export type Ctx = {
  tx: Executor;
  datasetId: string;
  generation: number;
  /** Business clock. In demo datasets this is fixed; never use it for security expiry. */
  now: Date;
  actor: Actor;
  operationId: string;
};

export type BaseCtx = Omit<Ctx, 'tx' | 'operationId'>;

export const actorUserId = (a: Actor) => (a.kind === 'user' ? a.userId : null);

export async function getActiveDataset(ex: Executor = db()) {
  const rows = await ex
    .select({ id: datasets.id, generation: datasets.generation, businessNow: datasets.businessNow, maintenance: applicationState.maintenance, scenarioCode: datasets.scenarioCode, name: datasets.name, lastResetAt: applicationState.lastResetAt })
    .from(applicationState)
    .innerJoin(datasets, eq(datasets.id, applicationState.activeDatasetId))
    .where(eq(applicationState.id, 1));
  return rows[0] ?? null;
}

export async function baseCtx(actor: Actor): Promise<BaseCtx> {
  const ds = await getActiveDataset();
  if (!ds) throw new AppError('DEMO_NOT_SEEDED', 503, 'Demo setup is not complete yet.');
  return { datasetId: ds.id, generation: ds.generation, now: ds.businessNow ?? new Date(), actor };
}

export function readCtx(base: BaseCtx): Ctx {
  return { ...base, tx: db(), operationId: randomUUID() };
}

const RETRYABLE = ['40P01', '40001'];

/**
 * Runs fn in one database transaction. The first lock taken is a shared lock on
 * application_state, confirming the dataset is still active and not resetting.
 * Deadlock or serialisation failures are retried up to three attempts.
 */
export async function withTx<T>(base: BaseCtx, fn: (ctx: Ctx) => Promise<T>, opts: { operationId?: string; skipDatasetCheck?: boolean } = {}): Promise<T> {
  const operationId = opts.operationId ?? randomUUID();
  for (let attempt = 1; ; attempt++) {
    try {
      return await db().transaction(async (tx) => {
        if (!opts.skipDatasetCheck) {
          const st = await tx.execute(sql`select active_dataset_id, maintenance from application_state where id = 1 for share`);
          const row = st.rows[0] as { active_dataset_id: string; maintenance: boolean } | undefined;
          if (!row || row.active_dataset_id !== base.datasetId) throw new AppError('STALE_DATASET', 409, 'The demo was reset. Sign in again to continue.');
          if (row.maintenance) throw new AppError('MAINTENANCE', 503, 'The demo is being reset. Try again in a moment.');
        }
        return fn({ ...base, tx, operationId });
      });
    } catch (e) {
      if (attempt < 3 && RETRYABLE.some((c) => isPgError(e, c))) continue;
      throw e;
    }
  }
}

/** Transaction-scoped advisory lock keyed by a namespaced string. */
export async function advisoryLock(tx: Executor, key: string) {
  await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${key}, 0))`);
}

/** Candidate privacy lock: always taken first for any operation involving candidate disclosure. */
export async function lockCandidates(tx: Executor, candidateIds: string[]) {
  for (const id of [...new Set(candidateIds)].sort()) await advisoryLock(tx, `candidate:${id}`);
}

export async function lockRowsForUpdate(tx: Tx | Executor, table: string, ids: string[]) {
  const sorted = [...new Set(ids)].sort();
  if (!sorted.length) return;
  await tx.execute(sql`select id from ${sql.identifier(table)} where id in (${sql.join(sorted.map((i) => sql`${i}::uuid`), sql`, `)}) order by id for update`);
}

export function requireUser(actor: Actor, type?: 'candidate' | 'client' | 'consultant') {
  if (actor.kind !== 'user') throw new AppError('FORBIDDEN', 403, 'You do not have access to this area.');
  if (type && actor.userType !== type) throw new AppError('FORBIDDEN', 403, 'You do not have access to this area.');
  return actor;
}
