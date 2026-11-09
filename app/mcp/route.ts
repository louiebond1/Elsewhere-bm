import type { NextRequest } from 'next/server';
import { authenticate, issuer } from '@/server/connectors/oauth';
import { handleRpc } from '@/server/connectors/mcp';
export const dynamic = 'force-dynamic';

const challenge = () => ({ 'www-authenticate': `Bearer resource_metadata="${issuer()}/.well-known/oauth-protected-resource", scope="questions:read profile:read drafts:write"` });

/** MCP over HTTP for a candidate's own AI assistant. JSON responses; no server-side session. */
export async function POST(req: NextRequest) {
  const auth = await authenticate(req.headers.get('authorization'));
  if (!auth) return Response.json({ error: 'invalid_token', error_description: 'Connect Elsewhere again.' }, { status: 401, headers: challenge() });
  const body = await req.json().catch(() => null);
  if (body === null) return Response.json({ jsonrpc: '2.0', id: null, error: { code: -32700, message: 'Parse error' } }, { status: 400 });
  if (Array.isArray(body)) {
    const out = (await Promise.all(body.map((m) => handleRpc(m, auth)))).filter((x) => x !== null);
    return out.length ? Response.json(out) : new Response(null, { status: 202 });
  }
  const r = await handleRpc(body, auth);
  return r === null ? new Response(null, { status: 202 }) : Response.json(r);
}

export async function GET(req: NextRequest) {
  const auth = await authenticate(req.headers.get('authorization'));
  if (!auth) return Response.json({ error: 'invalid_token' }, { status: 401, headers: challenge() });
  return new Response('This endpoint does not offer a stream.', { status: 405, headers: { allow: 'POST' } });
}

export function DELETE() { return new Response(null, { status: 405, headers: { allow: 'POST' } }); }
