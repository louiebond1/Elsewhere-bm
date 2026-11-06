import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { route, ok, fail, NO_STORE } from '@/server/http';
import { matchRoute } from '@/server/api-routes';
import { AppError } from '@/server/lib/errors';
import { SESSION_COOKIE, GATE_COOKIE, openGate, gateValid, login, logout, viewerFromToken, csrfFor, cookieOptions, isDemoMode, createSession, rateLimitHit } from '@/server/auth';
import { env } from '@/server/env';
import { prototype } from '@/config/prototype';
import { withTx, baseCtx, getActiveDataset } from '@/server/services/context';
import { signupCandidate } from '@/server/services/candidates';
import { resetDemo, SCENARIOS } from '@/server/services/demo';
import { db } from '@/server/db/client';
import { users, activityEvents } from '@/server/db/schema';
import { and, eq } from 'drizzle-orm';

export const dynamic = 'force-dynamic';

const ipOf = (req: NextRequest) => (req.headers.get('x-forwarded-for') ?? '').split(',')[0].trim() || 'local';
const maxAge = prototype.sessionHours * 3600;

function sameOrigin(req: NextRequest) {
  const origin = req.headers.get('origin');
  if (!origin) return req.headers.get('sec-fetch-site') === 'same-origin';
  return origin === new URL(env().APP_URL).origin;
}

/** Endpoints that work before a user session exists. All require demo mode and same-origin POSTs. */
async function preSession(req: NextRequest, path: string): Promise<Response | null> {
  if (path === 'auth/gate' && req.method === 'POST') {
    if (!sameOrigin(req)) throw new AppError('BAD_ORIGIN', 403, 'Cross-origin requests are not allowed.');
    const { password } = z.object({ password: z.string().max(200) }).parse(await req.json());
    const token = await openGate(password, ipOf(req));
    const res = ok({ ok: true });
    res.cookies.set(GATE_COOKIE, token, cookieOptions(maxAge));
    return res;
  }
  if (path === 'auth/login' && req.method === 'POST') {
    if (!sameOrigin(req)) throw new AppError('BAD_ORIGIN', 403, 'Cross-origin requests are not allowed.');
    if (!(await gateValid(req.cookies.get(GATE_COOKIE)?.value))) throw new AppError('UNAUTHENTICATED', 401, 'Enter the private demo first.');
    const { email, password } = z.object({ email: z.string().max(200), password: z.string().max(200) }).parse(await req.json());
    const old = req.cookies.get(SESSION_COOKIE)?.value;
    if (old) await logout(old);
    const token = await login(email, password, ipOf(req));
    const viewer = await viewerFromToken(token);
    const res = ok({ userType: viewer?.actor.userType });
    res.cookies.set(SESSION_COOKIE, token, cookieOptions(maxAge));
    return res;
  }
  if (path === 'auth/logout' && req.method === 'POST') {
    if (!sameOrigin(req)) throw new AppError('BAD_ORIGIN', 403, 'Cross-origin requests are not allowed.');
    await logout(req.cookies.get(SESSION_COOKIE)?.value);
    const res = ok({ ok: true });
    res.cookies.set(SESSION_COOKIE, '', cookieOptions(0));
    return res;
  }
  if (path === 'auth/session' && req.method === 'GET') {
    const token = req.cookies.get(SESSION_COOKIE)?.value;
    const viewer = await viewerFromToken(token);
    if (!viewer || !token) return ok({ authenticated: false, gate: await gateValid(req.cookies.get(GATE_COOKIE)?.value) });
    return ok({ authenticated: true, userType: viewer.actor.userType, csrfToken: csrfFor(token), datasetGeneration: viewer.generation }, viewer);
  }
  if (path === 'auth/candidate-signup' && req.method === 'POST') {
    if (!sameOrigin(req)) throw new AppError('BAD_ORIGIN', 403, 'Cross-origin requests are not allowed.');
    if (!(await gateValid(req.cookies.get(GATE_COOKIE)?.value))) throw new AppError('UNAUTHENTICATED', 401, 'Enter the private demo first.');
    if (await rateLimitHit(`signup:${ipOf(req)}`, 'signup', 60, 20)) throw new AppError('RATE_LIMITED', 429, 'Too many sign-ups. Try again later.');
    const base = await baseCtx({ kind: 'system', label: 'signup' });
    const signupBody = await req.json().catch(() => ({}));
    const r = await withTx(base, (c) => signupCandidate(c, signupBody));
    const token = await createSession(base.datasetId, r.user.id, true);
    const res = ok({ ok: true });
    res.cookies.set(SESSION_COOKIE, token, cookieOptions(maxAge));
    return res;
  }
  // Demo facilitator endpoints: gate plus demo mode. Persona switching creates a normal session.
  if (path === 'demo/scenarios' && req.method === 'GET') {
    if (!(await gateValid(req.cookies.get(GATE_COOKIE)?.value))) throw new AppError('UNAUTHENTICATED', 401, 'Enter the private demo first.');
    return ok(SCENARIOS.map(({ code, title, persona, action, expected }) => ({ code, title, persona, action, expected })));
  }
  if (path === 'demo/switch-persona' && req.method === 'POST') {
    if (!sameOrigin(req)) throw new AppError('BAD_ORIGIN', 403, 'Cross-origin requests are not allowed.');
    if (!(await gateValid(req.cookies.get(GATE_COOKIE)?.value))) throw new AppError('UNAUTHENTICATED', 401, 'Enter the private demo first.');
    const { userId } = z.object({ userId: z.string().uuid() }).parse(await req.json());
    const ds = await getActiveDataset();
    if (!ds) throw new AppError('DEMO_NOT_SEEDED', 503, 'Demo setup is not complete yet.');
    const [u] = await db().select().from(users).where(and(eq(users.id, userId), eq(users.datasetId, ds.id), eq(users.status, 'active')));
    if (!u) throw new AppError('NOT_FOUND', 404, 'Not found.');
    const old = req.cookies.get(SESSION_COOKIE)?.value;
    if (old) await logout(old);
    const token = await createSession(ds.id, u.id, true);
    await db().insert(activityEvents).values({ datasetId: ds.id, actorUserId: u.id, subjectType: 'user', subjectId: u.id, action: 'demo.persona_switched', metadata: { userType: u.userType }, eventAt: ds.businessNow ?? new Date() });
    const res = ok({ userType: u.userType });
    res.cookies.set(SESSION_COOKIE, token, cookieOptions(maxAge));
    return res;
  }
  if ((path === 'demo/reset' || path.startsWith('demo/scenario/')) && req.method === 'POST') {
    if (!sameOrigin(req)) throw new AppError('BAD_ORIGIN', 403, 'Cross-origin requests are not allowed.');
    if (!(await gateValid(req.cookies.get(GATE_COOKIE)?.value))) throw new AppError('UNAUTHENTICATED', 401, 'Enter the private demo first.');
    const body = z.object({ confirm: z.string().max(20).optional() }).parse(await req.json().catch(() => ({})));
    const code = path.startsWith('demo/scenario/') ? path.split('/')[2]?.replace(/\/load$/, '') : null;
    if (!code && body.confirm !== 'RESET') throw new AppError('VALIDATION', 400, 'Type RESET to confirm.');
    const ids = await resetDemo({ scenarioCode: code });
    const res = ok({ generation: ids.generation, scenario: code });
    res.cookies.set(SESSION_COOKIE, '', cookieOptions(0));
    return res;
  }
  return null;
}

async function dispatch(req: NextRequest, { params }: { params: Promise<{ slug: string[] }> }) {
  try {
    if (!isDemoMode()) throw new AppError('NOT_FOUND', 404, 'Not found.');
    const { slug } = await params;
    const path = slug.join('/').replace(/\/load$/, '');
    const pre = await preSession(req, path);
    if (pre) { pre.headers.set('Cache-Control', 'private, no-store'); return pre; }
    const m = matchRoute(req.method, slug);
    if (!m) throw new AppError('NOT_FOUND', 404, 'Not found.');
    const handler = route<Record<string, string>>({ mutation: m.r.method === 'POST' && !m.r.raw, userTypes: m.r.types }, async ({ req: rq, viewer, base, body }) => m.r.h({ req: rq, viewer, base, p: m.p, body }));
    if (m.r.raw) {
      // Multipart upload: same checks, body handled by the handler itself.
      const res = await route<Record<string, string>>({ mutation: false, userTypes: m.r.types }, async ({ req: rq, viewer, base }) => {
        const { csrfValid } = await import('@/server/auth');
        if (!sameOrigin(rq)) throw new AppError('BAD_ORIGIN', 403, 'Cross-origin requests are not allowed.');
        if (!csrfValid(rq.cookies.get(SESSION_COOKIE)!.value, rq.headers.get('x-csrf-token'))) throw new AppError('BAD_CSRF', 403, 'Your session token is out of date. Refresh the page.');
        return m.r.h({ req: rq, viewer, base, p: m.p, body: null });
      })(req, { params: Promise.resolve({}) });
      return res;
    }
    return handler(req, { params: Promise.resolve({}) });
  } catch (e) {
    return fail(e);
  }
}

export const GET = dispatch;
export const POST = dispatch;
void NextResponse; void NO_STORE;
