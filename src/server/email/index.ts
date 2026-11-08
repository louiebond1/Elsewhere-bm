import { and, eq, inArray } from 'drizzle-orm';
import { emailOutbox, users } from '../db/schema';
import { env } from '../env';
import { prototype } from '../../config/prototype';
import { withTx, type BaseCtx, type Ctx } from '../services/context';
import { enqueue } from '../services/jobs';

/**
 * Email delivery. Default driver "fixture" records each email in the outbox and sends nothing.
 * Driver "resend" sends only to addresses on EMAIL_ALLOWLIST (exact address or @domain); everything
 * else is suppressed. Emails carry the notification's safe title and a sign-in link only: no candidate
 * names, employers or evidence. The outbox stores no address; the recipient is resolved at send time.
 */
export type OutgoingEmail = { to: string; from: string; replyTo?: string; subject: string; text: string; idempotencyKey: string };
export type Transport = (m: OutgoingEmail) => Promise<{ id: string | null }>;

export class EmailSendError extends Error {
  constructor(public code: string, public retryable: boolean) { super(code); }
}

let override: Transport | null = null;
/** Tests only: replace the Resend transport. */
export function setEmailTransportForTests(t: Transport | null) { override = t; }

export function parseAllowlist(raw: string | undefined): string[] {
  return (raw ?? '').split(',').map((s) => s.trim().toLowerCase()).filter(Boolean);
}

export function isAllowed(address: string, allow: string[]): boolean {
  const a = address.trim().toLowerCase();
  const at = a.lastIndexOf('@');
  if (at < 1) return false;
  const domain = a.slice(at);
  return allow.some((x) => (x.startsWith('@') ? x === domain : x === a));
}

/** Sends through the Resend HTTP API. Status codes map to retryable or permanent failures. */
const resendTransport: Transport = async (m) => {
  const e = env();
  let res: Response;
  try {
    res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { authorization: `Bearer ${e.RESEND_API_KEY}`, 'content-type': 'application/json', 'idempotency-key': m.idempotencyKey },
      body: JSON.stringify({ from: m.from, to: [m.to], subject: m.subject, text: m.text, ...(m.replyTo ? { reply_to: m.replyTo } : {}) }),
      signal: AbortSignal.timeout(15000),
    });
  } catch {
    throw new EmailSendError('email_network', true);
  }
  if (res.ok) {
    const j = (await res.json().catch(() => null)) as { id?: string } | null;
    return { id: j?.id ?? null };
  }
  const retryable = res.status === 429 || res.status >= 500;
  throw new EmailSendError(`email_http_${res.status}`, retryable);
};

function linkPathFor(userType: string) {
  return userType === 'candidate' ? '/candidate/introductions' : userType === 'client' ? '/client/home' : '/consultant/home';
}

/** Called inside the notifying transaction. Queues one outbox row and one send job per eligible recipient. */
export async function queueEmails(ctx: Ctx, recipientUserIds: string[], n: { type: string; safeTitle: string }) {
  if (!prototype.emailNotificationTypes.includes(n.type) || !recipientUserIds.length) return;
  const rs = await ctx.tx.select({ id: users.id, type: users.userType }).from(users).where(and(inArray(users.id, recipientUserIds), eq(users.status, 'active')));
  for (const r of rs) {
    const [row] = await ctx.tx.insert(emailOutbox).values({ datasetId: ctx.datasetId, recipientUserId: r.id, notificationType: n.type as typeof emailOutbox.$inferInsert.notificationType, subject: n.safeTitle, linkPath: linkPathFor(r.type) }).returning();
    await enqueue(ctx, 'send_email', row.id, `email:${row.id}`);
  }
}

function bodyText(subject: string, link: string) {
  return [`BondMoran Hiring Partnership (demo)`, '', subject, '', `Sign in to see the details: ${link}`, '', 'This is a demo service using fictional data. You received this because your address is on the demo allow-list.'].join('\n');
}

/** Worker handler. Safe to re-run: only a queued row is processed, and a processed row is never sent again. */
export async function handleSendEmail(base: BaseCtx, outboxId: string) {
  const claimed = await withTx(base, async (ctx) => {
    const [row] = await ctx.tx.select().from(emailOutbox).where(eq(emailOutbox.id, outboxId)).for('update');
    if (!row || row.status !== 'queued') return null;
    const [u] = await ctx.tx.select({ email: users.emailNormalized, status: users.status }).from(users).where(eq(users.id, row.recipientUserId));
    const e = env();
    const finish = async (status: 'recorded' | 'suppressed', reason: string | null) => {
      await ctx.tx.update(emailOutbox).set({ status, driver: e.EMAIL_DRIVER, suppressedReason: reason, processedAt: new Date(), updatedAt: new Date(), attempts: row.attempts + 1 }).where(eq(emailOutbox.id, row.id));
      return null;
    };
    if (!u || u.status !== 'active') return finish('suppressed', 'recipient_inactive');
    if (e.EMAIL_DRIVER === 'fixture') return finish('recorded', null);
    if (!isAllowed(u.email, parseAllowlist(e.EMAIL_ALLOWLIST))) return finish('suppressed', 'not_on_allowlist');
    await ctx.tx.update(emailOutbox).set({ attempts: row.attempts + 1, updatedAt: new Date() }).where(eq(emailOutbox.id, row.id));
    return { row, to: u.email, from: e.EMAIL_FROM!, replyTo: e.EMAIL_REPLY_TO, link: new URL(row.linkPath, e.APP_URL).toString() };
  });
  if (!claimed) return;
  // The provider call happens outside any database transaction.
  try {
    const r = await (override ?? resendTransport)({ to: claimed.to, from: claimed.from, replyTo: claimed.replyTo, subject: claimed.row.subject, text: bodyText(claimed.row.subject, claimed.link), idempotencyKey: `bm-email-${claimed.row.id}` });
    await withTx(base, (ctx) => ctx.tx.update(emailOutbox).set({ status: 'sent', driver: 'resend', providerMessageId: r.id, lastError: null, processedAt: new Date(), updatedAt: new Date() }).where(and(eq(emailOutbox.id, claimed.row.id), eq(emailOutbox.status, 'queued'))));
  } catch (err) {
    const code = err instanceof EmailSendError ? err.code : 'email_error';
    const retryable = err instanceof EmailSendError ? err.retryable : true;
    const permanent = !retryable || claimed.row.attempts + 1 >= 3;
    await withTx(base, (ctx) => ctx.tx.update(emailOutbox).set({ status: permanent ? 'failed' : 'queued', lastError: code, processedAt: permanent ? new Date() : null, updatedAt: new Date() }).where(eq(emailOutbox.id, claimed.row.id)));
    if (!permanent) throw err; // the job runner re-queues with backoff
  }
}

/** Consultant view of the outbox: masked recipient, never the full address. */
export function maskAddress(a: string) {
  const at = a.lastIndexOf('@');
  if (at < 1) return '***';
  return `${a[0]}***${a.slice(at)}`;
}
