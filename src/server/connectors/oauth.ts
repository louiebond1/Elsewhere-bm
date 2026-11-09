import 'server-only';
import { createHash, randomBytes } from 'node:crypto';
import { and, desc, eq, gt, isNull } from 'drizzle-orm';
import { db } from '../db/client';
import { oauthClients, oauthGrants, users, candidates } from '../db/schema';
import { env } from '../env';
import { AppError, invalid, notFound } from '../lib/errors';
import { requireUser, getActiveDataset, type Ctx, type BaseCtx } from '../services/context';
import { logActivity } from '../services/audit';

/**
 * "Sign in with Elsewhere" for AI assistants (Claude, ChatGPT): OAuth 2.1 authorization code with PKCE (S256),
 * dynamic client registration (RFC 7591), issuer identification on the redirect (RFC 9207), refresh token rotation.
 * Only SHA-256 hashes of codes and tokens are stored. Candidates only, for now.
 */
export const SCOPES = ['questions:read', 'profile:read', 'drafts:write'] as const;
export const SCOPE_TEXT: Record<(typeof SCOPES)[number], string> = {
  'questions:read': 'See the questions you haven’t answered yet',
  'profile:read': 'See your own approved examples and preferences',
  'drafts:write': 'Save draft answers for you to check and send yourself',
};
const CODE_TTL_MS = 5 * 60_000;
const ACCESS_TTL_MS = 60 * 60_000;
const REFRESH_TTL_MS = 30 * 24 * 60 * 60_000;

export const issuer = () => env().APP_URL.replace(/\/$/, '');
const hash = (v: string) => createHash('sha256').update(v).digest('hex');
const token = (prefix: string) => `${prefix}_${randomBytes(32).toString('base64url')}`;

/** Where an AI app may send people back to after sign-in. Unknown destinations are refused. */
export function redirectAllowed(uri: string) {
  let u: URL;
  try { u = new URL(uri); } catch { return false; }
  if (u.protocol === 'https:' && (u.host === 'claude.ai' || u.host === 'claude.com') && u.pathname === '/api/mcp/auth_callback') return true;
  if (u.protocol === 'https:' && u.host === 'chatgpt.com' && (u.pathname.startsWith('/connector/oauth/') || u.pathname === '/connector_platform_oauth_redirect')) return true;
  // Loopback, for local testing tools such as the MCP Inspector.
  if (u.protocol === 'http:' && (u.hostname === 'localhost' || u.hostname === '127.0.0.1')) return true;
  return false;
}

export function authorizationServerMetadata() {
  const i = issuer();
  return {
    issuer: i,
    authorization_endpoint: `${i}/oauth/authorize`,
    token_endpoint: `${i}/api/oauth/token`,
    registration_endpoint: `${i}/api/oauth/register`,
    revocation_endpoint: `${i}/api/oauth/revoke`,
    response_types_supported: ['code'],
    grant_types_supported: ['authorization_code', 'refresh_token'],
    code_challenge_methods_supported: ['S256'],
    token_endpoint_auth_methods_supported: ['none'],
    scopes_supported: [...SCOPES],
    authorization_response_iss_parameter_supported: true,
  };
}

export function protectedResourceMetadata() {
  const i = issuer();
  return { resource: `${i}/mcp`, authorization_servers: [i], scopes_supported: [...SCOPES], bearer_methods_supported: ['header'], resource_name: 'Elsewhere' };
}

/** RFC 7591: an AI app registers itself. Only known AI-app return addresses are accepted. */
export async function registerClient(body: unknown) {
  const b = (body ?? {}) as { client_name?: unknown; redirect_uris?: unknown };
  const uris = Array.isArray(b.redirect_uris) ? b.redirect_uris.filter((x): x is string => typeof x === 'string') : [];
  if (!uris.length || uris.length > 5 || !uris.every(redirectAllowed)) throw new AppError('invalid_redirect_uri', 400, 'Only Claude, ChatGPT or local test return addresses can be registered.');
  const name = typeof b.client_name === 'string' && b.client_name.trim() ? b.client_name.trim().slice(0, 80) : 'AI assistant';
  const id = `ew_${randomBytes(16).toString('hex')}`;
  await db().insert(oauthClients).values({ id, clientName: name, redirectUris: uris });
  return { client_id: id, client_name: name, redirect_uris: uris, grant_types: ['authorization_code', 'refresh_token'], response_types: ['code'], token_endpoint_auth_method: 'none', client_id_issued_at: Math.floor(Date.now() / 1000) };
}

export type AuthorizeParams = { clientId: string; redirectUri: string; state: string | null; codeChallenge: string; scope: string };

/** Checks an authorization request before anything is shown. Errors here are never redirected to an unknown address. */
export async function checkAuthorizeRequest(q: Record<string, string | undefined>) {
  const [client] = q.client_id ? await db().select().from(oauthClients).where(eq(oauthClients.id, q.client_id)) : [];
  if (!client) throw notFound();
  if (!q.redirect_uri || !client.redirectUris.includes(q.redirect_uri)) throw invalid('This sign-in link has an unknown return address.');
  if (q.response_type !== 'code') throw invalid('Unsupported sign-in type.');
  if (!q.code_challenge || q.code_challenge_method !== 'S256' || !/^[A-Za-z0-9_-]{43,128}$/.test(q.code_challenge)) throw invalid('This sign-in link is missing its security check.');
  const asked = (q.scope ?? SCOPES.join(' ')).split(/\s+/).filter(Boolean);
  const scope = asked.filter((s) => (SCOPES as readonly string[]).includes(s));
  return { client, params: { clientId: client.id, redirectUri: q.redirect_uri, state: q.state ?? null, codeChallenge: q.code_challenge, scope: (scope.length ? scope : [...SCOPES]).join(' ') } satisfies AuthorizeParams };
}

/** The candidate pressed Allow: one short-lived code, returned to the AI app with issuer identification. */
export async function approve(ctx: Ctx, p: AuthorizeParams) {
  const a = requireUser(ctx.actor, 'candidate');
  await checkAuthorizeRequest({ client_id: p.clientId, redirect_uri: p.redirectUri, response_type: 'code', code_challenge: p.codeChallenge, code_challenge_method: 'S256', scope: p.scope });
  const code = token('ew_code');
  const [g] = await ctx.tx.insert(oauthGrants).values({ datasetId: ctx.datasetId, clientId: p.clientId, userId: a.userId, scope: p.scope, redirectUri: p.redirectUri, codeHash: hash(code), codeChallenge: p.codeChallenge, codeExpiresAt: new Date(Date.now() + CODE_TTL_MS) }).returning();
  await logActivity(ctx, { subjectType: 'connector', subjectId: g.id, action: 'connector.approved' });
  const u = new URL(p.redirectUri);
  u.searchParams.set('code', code);
  if (p.state) u.searchParams.set('state', p.state);
  u.searchParams.set('iss', issuer());
  return { redirectTo: u.toString() };
}

const tokenError = (error: string, description: string, status = 400) => Object.assign(new AppError(error, status, description), { oauthError: error });

async function issueTokens(grantId: string) {
  const access = token('ew_at');
  const refresh = token('ew_rt');
  await db().update(oauthGrants).set({ accessHash: hash(access), accessExpiresAt: new Date(Date.now() + ACCESS_TTL_MS), refreshHash: hash(refresh), refreshExpiresAt: new Date(Date.now() + REFRESH_TTL_MS), updatedAt: new Date() }).where(eq(oauthGrants.id, grantId));
  return { access_token: access, token_type: 'Bearer', expires_in: ACCESS_TTL_MS / 1000, refresh_token: refresh };
}

/** Token endpoint: authorization_code (with PKCE) or refresh_token (rotated). */
export async function tokenRequest(form: Record<string, string>) {
  if (form.grant_type === 'authorization_code') {
    const [g] = form.code ? await db().select().from(oauthGrants).where(eq(oauthGrants.codeHash, hash(form.code))) : [];
    if (!g || g.revokedAt || !g.codeExpiresAt || g.codeExpiresAt < new Date() || g.clientId !== form.client_id || g.redirectUri !== form.redirect_uri) throw tokenError('invalid_grant', 'The sign-in code is invalid or has expired.');
    const verifier = form.code_verifier ?? '';
    if (createHash('sha256').update(verifier).digest('base64url') !== g.codeChallenge) throw tokenError('invalid_grant', 'The security check did not match.');
    // One use only: clear the code before issuing tokens.
    const [used] = await db().update(oauthGrants).set({ codeHash: null, codeExpiresAt: null, updatedAt: new Date() }).where(and(eq(oauthGrants.id, g.id), eq(oauthGrants.codeHash, hash(form.code!)))).returning();
    if (!used) throw tokenError('invalid_grant', 'The sign-in code was already used.');
    return { ...(await issueTokens(g.id)), scope: g.scope };
  }
  if (form.grant_type === 'refresh_token') {
    const [g] = form.refresh_token ? await db().select().from(oauthGrants).where(eq(oauthGrants.refreshHash, hash(form.refresh_token))) : [];
    if (!g || g.revokedAt || !g.refreshExpiresAt || g.refreshExpiresAt < new Date() || g.clientId !== form.client_id) throw tokenError('invalid_grant', 'Please connect again.');
    return { ...(await issueTokens(g.id)), scope: g.scope };
  }
  throw tokenError('unsupported_grant_type', 'Unsupported grant type.');
}

/** Resolves a bearer token to the candidate it acts for, inside the currently active demo dataset. */
export async function authenticate(authorization: string | null): Promise<{ base: BaseCtx; grantId: string; scope: string[] } | null> {
  const m = authorization?.match(/^Bearer\s+(\S+)$/i);
  if (!m) return null;
  const [g] = await db().select().from(oauthGrants).where(and(eq(oauthGrants.accessHash, hash(m[1])), isNull(oauthGrants.revokedAt), gt(oauthGrants.accessExpiresAt, new Date())));
  if (!g) return null;
  const ds = await getActiveDataset();
  if (!ds || ds.id !== g.datasetId || ds.maintenance) return null;
  const [u] = await db().select({ id: users.id, type: users.userType, status: users.status, candidateId: candidates.id, candStatus: candidates.status }).from(users).leftJoin(candidates, eq(candidates.userId, users.id)).where(eq(users.id, g.userId));
  if (!u || u.status !== 'active' || u.type !== 'candidate' || !u.candidateId || u.candStatus === 'deleting' || u.candStatus === 'deleted') return null;
  await db().update(oauthGrants).set({ lastUsedAt: new Date() }).where(eq(oauthGrants.id, g.id));
  return { grantId: g.id, scope: g.scope.split(' '), base: { datasetId: ds.id, generation: ds.generation, now: ds.businessNow ?? new Date(), actor: { kind: 'user', userId: u.id, userType: 'candidate', candidateId: u.candidateId } } };
}

/** The candidate's connected AI apps, for the Privacy page. */
export async function myConnections(ctx: Ctx) {
  const a = requireUser(ctx.actor, 'candidate');
  return ctx.tx.select({ id: oauthGrants.id, name: oauthClients.clientName, scope: oauthGrants.scope, createdAt: oauthGrants.createdAt, lastUsedAt: oauthGrants.lastUsedAt })
    .from(oauthGrants).innerJoin(oauthClients, eq(oauthClients.id, oauthGrants.clientId))
    .where(and(eq(oauthGrants.userId, a.userId), isNull(oauthGrants.revokedAt), isNull(oauthGrants.codeHash))).orderBy(desc(oauthGrants.createdAt));
}

/** Disconnect: the AI app loses access immediately. */
export async function disconnect(ctx: Ctx, grantId: string) {
  const a = requireUser(ctx.actor, 'candidate');
  const [g] = await ctx.tx.select().from(oauthGrants).where(eq(oauthGrants.id, grantId));
  if (!g || g.userId !== a.userId) throw notFound();
  if (g.revokedAt) return { id: g.id };
  await ctx.tx.update(oauthGrants).set({ revokedAt: new Date(), accessHash: null, refreshHash: null, updatedAt: new Date() }).where(eq(oauthGrants.id, g.id));
  await logActivity(ctx, { subjectType: 'connector', subjectId: g.id, action: 'connector.disconnected' });
  return { id: g.id };
}

/** RFC 7009 revocation by the AI app itself (token, either kind). Always succeeds. */
export async function revokeToken(tokenValue: string) {
  const h = hash(tokenValue);
  const [g] = await db().select().from(oauthGrants).where(eq(oauthGrants.accessHash, h));
  const [r] = g ? [g] : await db().select().from(oauthGrants).where(eq(oauthGrants.refreshHash, h));
  if (r) await db().update(oauthGrants).set({ revokedAt: new Date(), accessHash: null, refreshHash: null, updatedAt: new Date() }).where(eq(oauthGrants.id, r.id));
}

