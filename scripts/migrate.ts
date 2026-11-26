import { loadEnv } from './load-env';
loadEnv();
import { preferDirectDatabaseUrl } from './direct-url';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { db, closeDb } from '../src/server/db/client';

(async () => {
  if (!process.env.DATABASE_URL && !process.env.DATABASE_URL_UNPOOLED && !process.env.DIRECT_URL) {
    console.error('Migration failed: DATABASE_URL is not set');
    process.exit(1);
  }
  const direct = preferDirectDatabaseUrl();
  if (!process.env.PG_STATEMENT_TIMEOUT_MS) process.env.PG_STATEMENT_TIMEOUT_MS = '120000';
  await migrate(db(), { migrationsFolder: new URL('../src/server/db/migrations', import.meta.url).pathname });
  const {getActiveDataset,baseCtx,withTx}=await import('../src/server/services/context');
  if(await getActiveDataset()){const {roles}=await import('../src/server/db/schema');const {and,eq,ne}=await import('drizzle-orm');const {ensureLegacyPublication}=await import('../src/server/services/shortlists');const base=await baseCtx({kind:'system',label:'shortlist-rollout'});const legacy=await db().select({id:roles.id}).from(roles).where(and(eq(roles.datasetId,base.datasetId),eq(roles.shortlistEnabled,false),ne(roles.status,'draft')));for(const role of legacy)await withTx(base,c=>ensureLegacyPublication(c,role.id));console.log(`Preserved ${legacy.length} existing role shortlists.`);}
  console.log(direct ? 'Migrations applied using the direct database URL.' : 'Migrations applied.');
  await closeDb();
})().catch((e) => { console.error('Migration failed:', e.message); process.exit(1); });
