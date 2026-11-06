import { sql } from 'drizzle-orm';
import { db } from '@/server/db/client';

export const dynamic = 'force-dynamic';

/** Minimal readiness: database reachable and schema present. No secrets, no counts, no seed requirement. */
export async function GET() {
  try {
    await db().execute(sql`select 1 from application_state limit 1`);
    return Response.json({ status: 'ok' }, { headers: { 'Cache-Control': 'no-store' } });
  } catch {
    return Response.json({ status: 'unavailable' }, { status: 503, headers: { 'Cache-Control': 'no-store' } });
  }
}
