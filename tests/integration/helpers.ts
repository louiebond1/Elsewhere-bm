import './env';
import { randomUUID } from 'node:crypto';
import { sql, eq, and } from 'drizzle-orm';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { db } from '../../src/server/db/client';
import * as S from '../../src/server/db/schema';
import { resetDemo } from '../../src/server/services/demo';
import { withTx, type BaseCtx, type Ctx, type Actor } from '../../src/server/services/context';
import { roleScopedRef } from '../../src/server/dto/refs';
import { formatCredits } from '../../src/server/lib/pricing';
import type { SeedIds } from '../../src/server/services/demo-seed';

let migrated = false;
export async function ensureMigrated() {
  if (migrated) return;
  await migrate(db(), { migrationsFolder: new URL('../../src/server/db/migrations', import.meta.url).pathname });
  migrated = true;
}

export async function load(code: string | null = null) {
  await ensureMigrated();
  const ids = await resetDemo({ scenarioCode: code });
  return world(ids);
}

export function world(ids: SeedIds) {
  const now = new Date('2026-11-06T12:00:00Z');
  const base = (actor: Actor): BaseCtx => ({ datasetId: ids.datasetId, generation: ids.generation, now, actor });
  const client = (c: 'A' | 'B' | 'C') => base({ kind: 'user', userId: ids.users[`client:${c}`], userType: 'client', clientId: ids.clients[c] });
  const cand = (code: string) => base({ kind: 'user', userId: ids.users[code], userType: 'candidate', candidateId: ids.candidates[code] });
  const consultant = () => base({ kind: 'user', userId: ids.users.alex, userType: 'consultant' });
  const T = <R>(b: BaseCtx, fn: (c: Ctx) => Promise<R>) => withTx(b, fn);
  const ref = (role: string, c: string) => roleScopedRef(ids.roles[role], ids.candidates[c]);
  const wallet = async (c: 'A' | 'B' | 'C') => {
    const r = await db().execute(sql`select coalesce(sum(delta_units),0)::bigint as posted from credit_transactions where client_id = ${ids.clients[c]}`);
    const h = await db().execute(sql`select coalesce(sum(units),0)::bigint as held from credit_holds where status = 'active' and wallet_id = (select id from wallets where client_id = ${ids.clients[c]})`);
    const posted = BigInt((r.rows[0] as { posted: string }).posted);
    const held = BigInt((h.rows[0] as { held: string }).held);
    return { posted: formatCredits(posted), held: formatCredits(held), spendable: formatCredits(posted - held) };
  };
  const intro = async (role: string, c: string) => (await db().select().from(S.introductions).where(and(eq(S.introductions.roleId, ids.roles[role]), eq(S.introductions.candidateId, ids.candidates[c]))))[0];
  const txs = async (c: 'A' | 'B' | 'C') => db().select().from(S.creditTransactions).where(eq(S.creditTransactions.clientId, ids.clients[c])).orderBy(S.creditTransactions.seq);
  return { ids, client, cand, consultant, T, ref, wallet, intro, txs, key: () => randomUUID() };
}
