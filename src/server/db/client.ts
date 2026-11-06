import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres';
import pg from 'pg';
import * as schema from './schema';

// Return bigint columns (int8) as strings from pg; drizzle maps mode:'bigint' columns to BigInt.
pg.types.setTypeParser(20, (v) => v);

export type DB = NodePgDatabase<typeof schema>;
export type Tx = Parameters<Parameters<DB['transaction']>[0]>[0];
export type Executor = DB | Tx;

let pool: pg.Pool | null = null;
let dbi: DB | null = null;

export function getPool(): pg.Pool {
  if (!pool) {
    const url = process.env.DATABASE_URL;
    if (!url) throw new Error('DATABASE_URL is not set');
    pool = new pg.Pool({ connectionString: url, max: Number(process.env.PG_POOL_MAX ?? 5), statement_timeout: 20000 });
    pool.on('error', () => {});
  }
  return pool;
}

export function db(): DB {
  if (!dbi) dbi = drizzle(getPool(), { schema });
  return dbi;
}

export async function closeDb() {
  if (pool) await pool.end();
  pool = null;
  dbi = null;
}

export { schema };
