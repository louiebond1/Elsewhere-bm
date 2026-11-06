import { loadEnv } from './load-env';
loadEnv();
import { env } from '../src/server/env';
try {
  const e = env();
  console.log(`Environment OK. APP_MODE=${e.APP_MODE}, AI_PROVIDER=${e.AI_PROVIDER}, STORAGE_DRIVER=${e.STORAGE_DRIVER}.`);
} catch (err) {
  console.error((err as Error).message);
  process.exit(1);
}
