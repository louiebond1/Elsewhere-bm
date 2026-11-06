import { loadEnv } from './load-env';
loadEnv();
import { closeDb } from '../src/server/db/client';
import { resetDemo } from '../src/server/services/demo';

(async () => {
  const i = process.argv.indexOf('--confirm');
  if (process.argv[i + 1] !== 'RESET') throw new Error('Pass --confirm RESET. This resets every fictional account in the shared demo.');
  const sc = process.argv.indexOf('--scenario');
  const ids = await resetDemo({ scenarioCode: sc > 0 ? process.argv[sc + 1] : null });
  console.log(`Reset complete. Active generation ${ids.generation}.`);
  await closeDb();
})().catch(async (e) => { console.error('Reset failed:', e.message); await closeDb(); process.exit(1); });
