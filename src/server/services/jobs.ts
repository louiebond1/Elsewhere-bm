import { and, eq, sql } from 'drizzle-orm';
import { jobs } from '../db/schema';
import type { Ctx } from './context';

type JobKind = (typeof jobs.$inferInsert)['kind'];

/** One deduplicated job per operation. Payload holds identifiers only. */
export async function enqueue(ctx: Pick<Ctx, 'tx' | 'datasetId'>, kind: JobKind, subjectId: string | null, dedupeKey: string, payload: Record<string, string | number | boolean | null> = {}) {
  const [existing] = await ctx.tx.select().from(jobs).where(and(eq(jobs.datasetId, ctx.datasetId), eq(jobs.dedupeKey, dedupeKey)));
  if (existing) {
    if (existing.status === 'failed' || existing.status === 'cancelled') {
      const [u] = await ctx.tx.update(jobs).set({ status: 'queued', availableAt: new Date(), errorCode: null, updatedAt: new Date() }).where(eq(jobs.id, existing.id)).returning();
      return u;
    }
    return existing;
  }
  const [j] = await ctx.tx.insert(jobs).values({ datasetId: ctx.datasetId, kind, subjectId, dedupeKey, payload }).returning();
  return j;
}

export async function claimJob(ex: Ctx['tx'], workerId: string, datasetId: string) {
  const r = await ex.execute(sql`
    update jobs set status = 'running', attempts = attempts + 1, locked_by = ${workerId}, locked_at = now(), lease_expires_at = now() + interval '2 minutes', updated_at = now()
    where id = (
      select id from jobs
      where dataset_id = ${datasetId} and ((status = 'queued' and available_at <= now()) or (status = 'running' and lease_expires_at < now()))
      order by available_at for update skip locked limit 1
    ) returning id, kind, subject_id, payload, attempts`);
  return (r.rows[0] as { id: string; kind: JobKind; subject_id: string | null; payload: Record<string, unknown>; attempts: number } | undefined) ?? null;
}
