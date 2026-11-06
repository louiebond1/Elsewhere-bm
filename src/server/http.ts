import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';
import { ZodError, type z } from 'zod';
import { createHash } from 'node:crypto';
import { and, eq } from 'drizzle-orm';
import { AppError, isPgError } from './lib/errors';
import { viewerFromToken, csrfValid, SESSION_COOKIE, GATE_COOKIE, gateValid, isDemoMode, type Viewer } from './auth';
import { withTx, readCtx, type Ctx, type BaseCtx } from './services/context';
import { idempotencyRecords } from './db/schema';
import { env } from './env';

export const NO_STORE = { 'Cache-Control': 'private, no-store' };

const json = (body: unknown, status = 200) =>
  new NextResponse(JSON.stringify(body, (_k, v) => (typeof v === 'bigint' ? v.toString() : v)), { status, headers: { 'Content-Type': 'application/json', ...NO_STORE } });

export function ok(data: unknown, viewer?: { generation: number } | null, status = 200) {
  return json({ data, meta: { requestId: crypto.randomUUID(), datasetGeneration: viewer?.generation ?? null } }, status);
}

export function fail(e: unknown) {
  if (e instanceof AppError) return json({ error: { code: e.code, message: e.message, fieldErrors: e.fieldErrors ?? null, details: e.details ?? null }, meta: { requestId: crypto.randomUUID() } }, e.status);
  if (e instanceof ZodError) {
    const fe: Record<string, string> = {};
    for (const i of e.issues) fe[i.path.join('.') || 'form'] = i.message;
    return json({ error: { code: 'VALIDATION', message: 'Check the highlighted fields.', fieldErrors: fe }, meta: { requestId: crypto.randomUUID() } }, 400);
  }
  if (isPgError(e, '23505')) return json({ error: { code: 'CONFLICT', message: 'This changed in another session. Refresh to review the latest position.' }, meta: {} }, 409);
  console.error('[api] unexpected error', (e as Error)?.name, (e as Error)?.message?.slice(0, 200));
  return json({ error: { code: 'INTERNAL', message: 'Something went wrong. Your saved progress is unaffected.' }, meta: {} }, 500);
}

function sameOrigin(req: NextRequest) {
  const origin = req.headers.get('origin');
  const expected = new URL(env().APP_URL).origin;
  if (origin) return origin === expected;
  const site = req.headers.get('sec-fetch-site');
  return site === 'same-origin';
}

export type Handler<P> = (args: { req: NextRequest; viewer: Viewer; base: BaseCtx; params: P; body: unknown }) => Promise<Response | unknown>;

type Opts = { mutation?: boolean; userTypes?: Array<'candidate' | 'client' | 'consultant'> };

/** Authenticates, applies the demo gate, origin and CSRF checks, and maps errors to the envelope. */
export function route<P = Record<string, string>>(opts: Opts, handler: Handler<P>) {
  return async (req: NextRequest, ctxArg: { params: Promise<P> }) => {
    try {
      if (!isDemoMode()) throw new AppError('NOT_FOUND', 404, 'Not found.');
      env();
      if (!(await gateValid(req.cookies.get(GATE_COOKIE)?.value))) throw new AppError('UNAUTHENTICATED', 401, 'Enter the private demo first.');
      const token = req.cookies.get(SESSION_COOKIE)?.value;
      const viewer = await viewerFromToken(token);
      if (!viewer || !token) throw new AppError('UNAUTHENTICATED', 401, 'Sign in to continue.');
      if (opts.userTypes && !opts.userTypes.includes(viewer.actor.userType)) throw new AppError('NOT_FOUND', 404, 'This item is not available.');
      let body: unknown = null;
      if (opts.mutation) {
        if (req.method !== 'POST') throw new AppError('METHOD', 405, 'Method not allowed.');
        if (!sameOrigin(req)) throw new AppError('BAD_ORIGIN', 403, 'Cross-origin requests are not allowed.');
        if (!csrfValid(token, req.headers.get('x-csrf-token'))) throw new AppError('BAD_CSRF', 403, 'Your session token is out of date. Refresh the page.');
        const ct = req.headers.get('content-type') ?? '';
        if (ct.includes('application/json')) {
          const text = await req.text();
          if (text.length > 100_000) throw new AppError('TOO_LARGE', 413, 'Request too large.');
          body = text ? JSON.parse(text) : {};
        }
      }
      const params = (await ctxArg?.params) ?? ({} as P);
      const base: BaseCtx = { datasetId: viewer.datasetId, generation: viewer.generation, now: viewer.businessNow, actor: viewer.actor };
      const res = await handler({ req, viewer, base, params, body });
      if (res instanceof Response) {
        res.headers.set('Cache-Control', 'private, no-store');
        return res;
      }
      return ok(res, viewer);
    } catch (e) {
      return fail(e);
    }
  };
}

export const parse = <S extends z.ZodType>(schema: S, body: unknown): z.infer<S> => schema.parse(body ?? {});

/**
 * Financial and capacity commands run inside one transaction with an idempotency record.
 * Same key and same body returns the earlier resource reference; a different body is a 409.
 */
export async function idempotent<T>(req: NextRequest, base: BaseCtx, endpoint: string, body: unknown, fn: (ctx: Ctx, key: string) => Promise<T>, serialise: (ctx: Ctx, result: T | { ref: unknown }) => Promise<unknown> = async (_c, r) => r): Promise<unknown> {
  const key = req.headers.get('idempotency-key');
  if (!key || !/^[0-9a-f-]{36}$/i.test(key)) throw new AppError('IDEMPOTENCY_KEY_REQUIRED', 400, 'Missing request key. Refresh and try again.');
  const hash = createHash('sha256').update(endpoint + JSON.stringify(body ?? {})).digest('hex');
  const scope = base.actor.kind === 'user' ? base.actor.userId : 'system';
  return withTx(base, async (ctx) => {
    await ctx.tx.insert(idempotencyRecords).values({ datasetId: ctx.datasetId, actorScope: scope, endpoint, key, requestHash: hash, expiresAt: new Date(Date.now() + 365 * 86400000) }).onConflictDoNothing();
    const [rec] = await ctx.tx.select().from(idempotencyRecords).where(and(eq(idempotencyRecords.datasetId, ctx.datasetId), eq(idempotencyRecords.actorScope, scope), eq(idempotencyRecords.endpoint, endpoint), eq(idempotencyRecords.key, key))).for('update');
    if (rec.requestHash !== hash) throw new AppError('IDEMPOTENCY_MISMATCH', 409, 'This request key was already used for a different action.');
    if (rec.state === 'completed') return serialise(ctx, { ref: rec.responseBodySafe });
    const result = await fn(ctx, key);
    const ref = refOf(result);
    await ctx.tx.update(idempotencyRecords).set({ state: 'completed', responseStatus: 200, responseBodySafe: ref, updatedAt: new Date() }).where(eq(idempotencyRecords.id, rec.id));
    return serialise(ctx, result);
  });
}

/** Store only resource references, never identity-bearing bodies. */
function refOf(r: unknown): Record<string, string | boolean | null> {
  const out: Record<string, string | boolean | null> = {};
  if (r && typeof r === 'object') {
    const o = r as Record<string, unknown>;
    if (typeof o.id === 'string') out.id = o.id;
    for (const [k, v] of Object.entries(o)) {
      if (v && typeof v === 'object' && typeof (v as { id?: unknown }).id === 'string') out[`${k}Id`] = (v as { id: string }).id;
      if (typeof v === 'boolean') out[k] = v;
    }
  }
  return out;
}

export { readCtx, withTx };
