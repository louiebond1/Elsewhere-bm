import 'server-only';
import { and, eq, gt, isNull, sql } from 'drizzle-orm';
import * as argon2 from 'argon2';
import { timingSafeEqual } from 'node:crypto';
import { db } from '../db/client';
import { users, sessions, demoAccessSessions, candidates, clientMemberships, rateLimitBuckets } from '../db/schema';
import { sha256, randomToken, hmac } from '../lib/ids';
import { prototype } from '../../config/prototype';
import { getActiveDataset, type Actor } from '../services/context';
import { AppError } from '../lib/errors';

export const SESSION_COOKIE = 'bm_session';
export const GATE_COOKIE = 'bm_gate';

const pepper = () => {
  const p = process.env.SESSION_PEPPER;
  if (!p || p.length < 64) throw new Error('SESSION_PEPPER is not configured');
  return p;
};
const hashToken = (t: string) => sha256(pepper() + ':' + t);
export const csrfFor = (token: string) => hmac(pepper(), `csrf:${token}`);

export function cookieOptions(maxAgeSeconds: number) {
  const secure = (process.env.APP_URL ?? '').startsWith('https://');
  return { httpOnly: true, secure, sameSite: 'lax' as const, path: '/', maxAge: maxAgeSeconds };
}

export const isDemoMode = () => process.env.APP_MODE === 'demo';

function safeEqual(a: string, b: string) {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

// ---------- rate limiting (real clock) ----------
export async function rateLimitHit(scope: string, action: string, windowMinutes: number, max: number): Promise<boolean> {
  const scopeHash = hmac(pepper(), scope);
  const windowStart = new Date(Math.floor(Date.now() / (windowMinutes * 60000)) * windowMinutes * 60000);
  const r = await db().execute(sql`insert into rate_limit_buckets (scope_hash, action, window_start, count) values (${scopeHash}, ${action}, ${windowStart.toISOString()}::timestamptz, 1)
    on conflict (scope_hash, action, window_start) do update set count = rate_limit_buckets.count + 1, updated_at = now() returning count`);
  return (r.rows[0] as { count: number }).count > max;
}
export async function rateLimitPeek(scope: string, action: string, windowMinutes: number) {
  const scopeHash = hmac(pepper(), scope);
  const windowStart = new Date(Math.floor(Date.now() / (windowMinutes * 60000)) * windowMinutes * 60000);
  const [r] = await db().select({ c: rateLimitBuckets.count }).from(rateLimitBuckets).where(and(eq(rateLimitBuckets.scopeHash, scopeHash), eq(rateLimitBuckets.action, action), eq(rateLimitBuckets.windowStart, windowStart)));
  return r?.c ?? 0;
}

// ---------- demo gate ----------
export async function openGate(password: string, ip: string) {
  if (!isDemoMode()) throw new AppError('NOT_FOUND', 404, 'Not found.');
  // Only failed attempts count towards the limit (10 per IP per 15 real minutes).
  if ((await rateLimitPeek(`gate:${ip}`, 'gate_fail', 15)) >= 10) throw new AppError('RATE_LIMITED', 429, 'Too many attempts. Try again later.');
  const expected = process.env.DEMO_ACCESS_PASSWORD ?? '';
  if (!expected || !safeEqual(sha256(password), sha256(expected))) {
    await rateLimitHit(`gate:${ip}`, 'gate_fail', 15, 1000);
    throw new AppError('BAD_GATE', 401, 'That access password did not work.');
  }
  const token = randomToken();
  await db().insert(demoAccessSessions).values({ tokenHash: hashToken(token), csrfHash: hashToken(csrfFor(token)), expiresAt: new Date(Date.now() + prototype.sessionHours * 3600_000) });
  return token;
}

export async function gateValid(token: string | undefined | null) {
  if (!token || !isDemoMode()) return false;
  const [g] = await db().select().from(demoAccessSessions).where(and(eq(demoAccessSessions.tokenHash, hashToken(token)), gt(demoAccessSessions.expiresAt, new Date()), isNull(demoAccessSessions.revokedAt)));
  return !!g;
}

// ---------- user sessions ----------
export async function login(email: string, password: string, ip: string) {
  const ds = await getActiveDataset();
  if (!ds) throw new AppError('DEMO_NOT_SEEDED', 503, 'Demo setup is not complete yet.');
  const norm = email.trim().toLowerCase();
  const accountScope = `login:${norm}`;
  const ipScope = `login-ip:${ip}`;
  if ((await rateLimitPeek(accountScope, 'login_fail', 15)) >= 5 || (await rateLimitPeek(ipScope, 'login_fail', 15)) >= 20) throw new AppError('RATE_LIMITED', 429, 'Too many attempts. Try again in 15 minutes.');
  const [u] = await db().select().from(users).where(and(eq(users.datasetId, ds.id), eq(users.emailNormalized, norm), eq(users.status, 'active')));
  const ok = u ? await argon2.verify(u.passwordHash, password).catch(() => false) : (await argon2.hash('timing-equaliser').then(() => false));
  if (!u || !ok) {
    await rateLimitHit(accountScope, 'login_fail', 15, 1000);
    await rateLimitHit(ipScope, 'login_fail', 15, 1000);
    throw new AppError('BAD_LOGIN', 401, 'Those details did not work.');
  }
  return createSession(ds.id, u.id, true);
}

export async function createSession(datasetId: string, userId: string, gateVerified: boolean) {
  const token = randomToken();
  await db().insert(sessions).values({ datasetId, userId, tokenHash: hashToken(token), csrfHash: hashToken(csrfFor(token)), expiresAt: new Date(Date.now() + prototype.sessionHours * 3600_000), demoGateVerified: gateVerified });
  await db().update(users).set({ lastLoginAt: new Date() }).where(eq(users.id, userId));
  return token;
}

export async function logout(token: string | undefined) {
  if (!token) return;
  await db().update(sessions).set({ revokedAt: new Date() }).where(eq(sessions.tokenHash, hashToken(token)));
}

export type Viewer = { actor: Extract<Actor, { kind: 'user' }>; datasetId: string; generation: number; businessNow: Date; displayName: string | null; email: string; sessionId: string };

/** Resolves a session to a viewer. Sessions from an old dataset generation are invalid. */
export async function viewerFromToken(token: string | undefined | null): Promise<Viewer | null> {
  if (!token) return null;
  const ds = await getActiveDataset();
  if (!ds) return null;
  const [s] = await db().select().from(sessions).where(and(eq(sessions.tokenHash, hashToken(token)), gt(sessions.expiresAt, new Date()), isNull(sessions.revokedAt)));
  if (!s || s.datasetId !== ds.id) return null;
  const [u] = await db().select().from(users).where(eq(users.id, s.userId));
  if (!u || u.status !== 'active') return null;
  let candidateId: string | null = null;
  let clientId: string | null = null;
  if (u.userType === 'candidate') {
    const [c] = await db().select({ id: candidates.id, status: candidates.status }).from(candidates).where(eq(candidates.userId, u.id));
    if (!c || c.status === 'deleting' || c.status === 'deleted') return null;
    candidateId = c.id;
  } else if (u.userType === 'client') {
    const [m] = await db().select({ clientId: clientMemberships.clientId }).from(clientMemberships).where(eq(clientMemberships.userId, u.id));
    if (!m) return null;
    clientId = m.clientId;
  }
  return { actor: { kind: 'user', userId: u.id, userType: u.userType, candidateId, clientId }, datasetId: ds.id, generation: ds.generation, businessNow: ds.businessNow ?? new Date(), displayName: u.displayName, email: u.emailNormalized, sessionId: s.id };
}

export function csrfValid(token: string, header: string | null) {
  if (!header) return false;
  return safeEqual(csrfFor(token), header);
}
