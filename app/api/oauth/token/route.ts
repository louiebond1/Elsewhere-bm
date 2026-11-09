import type { NextRequest } from 'next/server';
import { tokenRequest } from '@/server/connectors/oauth';
import { AppError } from '@/server/lib/errors';
export const dynamic = 'force-dynamic';

const noStore = { 'cache-control': 'no-store', pragma: 'no-cache' };

/** OAuth token endpoint: authorization code with PKCE, and refresh token rotation. Public clients only. */
export async function POST(req: NextRequest) {
  const type = req.headers.get('content-type') ?? '';
  const form: Record<string, string> = {};
  if (type.includes('application/json')) Object.assign(form, (await req.json().catch(() => ({}))) as Record<string, string>);
  else for (const [k, v] of new URLSearchParams(await req.text())) form[k] = v;
  try {
    return Response.json(await tokenRequest(form), { headers: noStore });
  } catch (e) {
    if (e instanceof AppError) return Response.json({ error: (e as AppError & { oauthError?: string }).oauthError ?? 'invalid_request', error_description: e.message }, { status: 400, headers: noStore });
    throw e;
  }
}
