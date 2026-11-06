// Starts Next on 0.0.0.0 and the validated PORT without shell expansion. Forwards signals and exit status.
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';

const port = Number.parseInt(process.env.PORT ?? '3000', 10);
if (!Number.isInteger(port) || port <= 0 || port > 65535) {
  console.error('PORT must be an integer between 1 and 65535');
  process.exit(1);
}
const require = createRequire(import.meta.url);
const nextBin = require.resolve('next/dist/bin/next');
const child = spawn(process.execPath, [nextBin, 'start', '-H', '0.0.0.0', '-p', String(port)], { stdio: 'inherit', env: process.env });
for (const sig of ['SIGTERM', 'SIGINT']) process.on(sig, () => child.kill(sig));
child.on('exit', (code, signal) => process.exit(code ?? (signal ? 1 : 0)));
