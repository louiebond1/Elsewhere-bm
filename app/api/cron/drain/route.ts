import { cronAuthorized } from '@/server/cron-auth';
import { env } from '@/server/env';
import { CRON_DRAIN_BUDGET_MS, drainQueue } from '@/server/services/worker-handlers';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
/** Hobby allows up to 300s. Stay under the 2-minute job lease so a killed run can be claimed again. */
export const maxDuration = 60;

const NO_STORE = { 'Cache-Control': 'no-store' };

async function drain(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!cronAuthorized(req.headers.get('authorization'), secret && secret.length > 0 ? secret : undefined)) {
    return Response.json({ error: 'unauthorized' }, { status: 401, headers: NO_STORE });
  }
  try {
    env();
    const result = await drainQueue({ budgetMs: CRON_DRAIN_BUDGET_MS, max: 40, tickExpiry: true, workerId: 'cron' });
    return Response.json(result, { headers: NO_STORE });
  } catch (e) {
    console.error('[cron] drain failed', (e as Error).message);
    return Response.json({ error: 'drain_failed' }, { status: 500, headers: NO_STORE });
  }
}

export const GET = drain;
export const POST = drain;
