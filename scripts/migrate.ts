import { loadEnv } from './load-env';
loadEnv();
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { db, closeDb } from '../src/server/db/client';

(async () => {
  await migrate(db(), { migrationsFolder: new URL('../src/server/db/migrations', import.meta.url).pathname });
  const {getActiveDataset,baseCtx,withTx}=await import('../src/server/services/context');
  if(await getActiveDataset()){const {roles}=await import('../src/server/db/schema');const {and,eq,ne}=await import('drizzle-orm');const {ensureLegacyPublication}=await import('../src/server/services/shortlists');const base=await baseCtx({kind:'system',label:'shortlist-rollout'});const legacy=await db().select({id:roles.id}).from(roles).where(and(eq(roles.datasetId,base.datasetId),eq(roles.shortlistEnabled,false),ne(roles.status,'draft')));for(const role of legacy)await withTx(base,c=>ensureLegacyPublication(c,role.id));console.log(`Preserved ${legacy.length} existing role shortlists.`);}
  console.log('Migrations applied.');
  await closeDb();
})().catch((e) => { console.error('Migration failed:', e.message); process.exit(1); });
