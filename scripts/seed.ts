import { loadEnv } from './load-env';
loadEnv();
import { closeDb } from '../src/server/db/client';
import { initialSeed } from '../src/server/services/demo';

(async () => {
  if (process.env.APP_MODE !== 'demo') throw new Error('Seeding requires APP_MODE=demo');
  const t = Date.now();
  const r = await initialSeed();
  if (r.skipped) console.log('A demo dataset already exists. Nothing replaced. Use `npm run demo:reset -- --confirm RESET` to reset.');
  else console.log(`Seeded demo dataset generation ${r.ids.generation} in ${Date.now() - t} ms.`);
  await closeDb();
})().catch(async (e) => { console.error('Seed failed:', e.message); await closeDb(); process.exit(1); });
