/** Scripts read the same local env file as the web app so they never use different credentials. */
import fs from 'node:fs';
import path from 'node:path';

export function loadEnv() {
  const file = process.env.ENV_FILE ?? path.resolve(process.cwd(), '.env.local');
  if (!fs.existsSync(file)) return;
  for (const line of fs.readFileSync(file, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (!m || process.env[m[1]] !== undefined) continue;
    process.env[m[1]] = m[2].replace(/^"(.*)"$/, '$1');
  }
}
