import type { NextRequest } from 'next/server';
import { registerClient } from '@/server/connectors/oauth';
import { rateLimitHit } from '@/server/auth';
import { AppError } from '@/server/lib/errors';
export const dynamic = 'force-dynamic';

/** RFC 7591 dynamic client registration for AI assistants. Rate limited per address. */
export async function POST(req: NextRequest) {
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';
  if (await rateLimitHit(`register:${ip}`, 'oauth_register', 60, 20)) return Response.json({ error: 'slow_down', error_description: 'Too many registrations. Try again later.' }, { status: 429 });
  try {
    return Response.json(await registerClient(await req.json().catch(() => null)), { status: 201 });
  } catch (e) {
    if (e instanceof AppError) return Response.json({ error: e.code === 'invalid_redirect_uri' ? 'invalid_redirect_uri' : 'invalid_client_metadata', error_description: e.message }, { status: 400 });
    throw e;
  }
}
