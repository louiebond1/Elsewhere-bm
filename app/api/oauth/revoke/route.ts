import type { NextRequest } from 'next/server';
import { revokeToken } from '@/server/connectors/oauth';
export const dynamic = 'force-dynamic';

/** RFC 7009: the AI app can revoke its own token. Always answers 200. */
export async function POST(req: NextRequest) {
  const t = new URLSearchParams(await req.text()).get('token');
  if (t) await revokeToken(t);
  return new Response(null, { status: 200 });
}
