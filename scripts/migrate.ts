import { loadEnv } from './load-env';
loadEnv();
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { db, closeDb } from '../src/server/db/client';

(async () => {
  await migrate(db(), { migrationsFolder: new URL('../src/server/db/migrations', import.meta.url).pathname });
  console.log('Migrations applied.');
  await closeDb();
})().catch((e) => { console.error('Migration failed:', e.message); process.exit(1); });
