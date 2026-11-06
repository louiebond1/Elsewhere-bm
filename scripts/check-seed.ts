import { loadEnv } from './load-env';
loadEnv();
import { sql } from 'drizzle-orm';
import { db, closeDb } from '../src/server/db/client';
import { getActiveDataset } from '../src/server/services/context';

(async () => {
  const ds = await getActiveDataset();
  if (!ds) throw new Error('No active dataset. Run npm run db:seed.');
  const q = async (s: ReturnType<typeof sql>) => (await db().execute(s)).rows;
  const counts = await q(sql`select (select count(*) from candidates where dataset_id = ${ds.id})::int as candidates, (select count(*) from clients where dataset_id = ${ds.id})::int as clients, (select count(*) from roles where dataset_id = ${ds.id})::int as roles`);
  const wallets = await q(sql`select o.display_name as client, (sum(t.delta_units)::numeric / 10000)::text as credits from credit_transactions t join clients c on c.id = t.client_id join organisations o on o.id = c.organisation_id where t.dataset_id = ${ds.id} group by o.display_name order by 1`);
  console.log(`Generation ${ds.generation} (${ds.scenarioCode ?? 'baseline'})`, counts[0]);
  for (const w of wallets as { client: string; credits: string }[]) console.log(`  ${w.client}: ${Number(w.credits)} credits`);
  await closeDb();
})().catch(async (e) => { console.error(e.message); await closeDb(); process.exit(1); });
