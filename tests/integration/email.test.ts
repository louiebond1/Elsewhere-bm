import { describe, it, expect, afterEach } from 'vitest';
import { eq, sql } from 'drizzle-orm';
import { load } from './helpers';
import { db } from '../../src/server/db/client';
import * as S from '../../src/server/db/schema';
import { notify } from '../../src/server/services/audit';
import { drainJobs } from '../../src/server/services/worker-handlers';
import { resetEnvCacheForTests } from '../../src/server/env';
import { setEmailTransportForTests, EmailSendError, isAllowed, parseAllowlist, maskAddress, type OutgoingEmail } from '../../src/server/email';

const KEYS = ['EMAIL_DRIVER', 'RESEND_API_KEY', 'EMAIL_FROM', 'EMAIL_ALLOWLIST'] as const;
const saved = Object.fromEntries(KEYS.map((k) => [k, process.env[k]]));
function useResend(allow: string) {
  Object.assign(process.env, { EMAIL_DRIVER: 'resend', RESEND_API_KEY: 'dummy-test-value', EMAIL_FROM: 'Demo <demo@sender.test>', EMAIL_ALLOWLIST: allow });
  resetEnvCacheForTests();
}
afterEach(() => {
  for (const k of KEYS) { if (saved[k] === undefined) delete process.env[k]; else process.env[k] = saved[k]; }
  resetEnvCacheForTests();
  setEmailTransportForTests(null);
});

const outboxFor = (userId: string) => db().select().from(S.emailOutbox).where(eq(S.emailOutbox.recipientUserId, userId));
const emailOf = async (userId: string) => (await db().select().from(S.users).where(eq(S.users.id, userId)))[0].emailNormalized;
const makeDue = () => db().execute(sql`update jobs set available_at = now() - interval '1 second' where kind = 'send_email' and status = 'queued'`);

describe('Email outbox', () => {
  it('allow-list matching and masking', () => {
    const a = parseAllowlist(' Me@Example.com , @team.test ');
    expect(isAllowed('me@example.com', a)).toBe(true);
    expect(isAllowed('x@team.test', a)).toBe(true);
    expect(isAllowed('x@sub.team.test', a)).toBe(false);
    expect(isAllowed('other@example.com', a)).toBe(false);
    expect(maskAddress('maya@example.com')).toBe('m***@example.com');
  });

  it('fixture driver records eligible notifications, sends nothing, and skips other types', async () => {
    const w = await load();
    const uid = w.ids.users.C01;
    const calls: OutgoingEmail[] = [];
    setEmailTransportForTests(async (m) => { calls.push(m); return { id: 'x' }; });
    await w.T(w.consultant(), (c) => notify(c, [uid], { type: 'intro_requested', subjectRefType: 'introduction', subjectRefId: uid, safeTitle: 'An employer asked to be introduced' }));
    await w.T(w.consultant(), (c) => notify(c, [uid], { type: 'system', subjectRefType: 'candidate', subjectRefId: uid, safeTitle: 'Internal' }));
    const rows = await outboxFor(uid);
    expect(rows).toHaveLength(1);
    expect(Object.keys(rows[0]).some((k) => /email|address/i.test(k))).toBe(false);
    await drainJobs();
    expect((await outboxFor(uid))[0]).toMatchObject({ status: 'recorded', driver: 'fixture' });
    expect(calls).toHaveLength(0);
  });

  it('resend driver sends once to an allow-listed address and suppresses everyone else', async () => {
    const w = await load();
    const ok = w.ids.users.C01;
    const other = w.ids.users.C02;
    useResend(await emailOf(ok));
    const calls: OutgoingEmail[] = [];
    setEmailTransportForTests(async (m) => { calls.push(m); return { id: 'msg_1' }; });
    await w.T(w.consultant(), (c) => notify(c, [ok, other], { type: 'intro_requested', subjectRefType: 'introduction', subjectRefId: ok, safeTitle: 'An employer asked to be introduced' }));
    await drainJobs();
    await drainJobs();
    expect(calls).toHaveLength(1);
    expect(calls[0]).toMatchObject({ to: await emailOf(ok), subject: 'An employer asked to be introduced' });
    expect(calls[0].text).toContain('/candidate/introductions');
    expect((await outboxFor(ok))[0]).toMatchObject({ status: 'sent', providerMessageId: 'msg_1' });
    expect((await outboxFor(other))[0]).toMatchObject({ status: 'suppressed', suppressedReason: 'not_on_allowlist' });
  });

  it('a retryable failure is retried and sent once; a permanent failure is not retried', async () => {
    const w = await load();
    const uid = w.ids.users.C01;
    useResend(await emailOf(uid));
    let n = 0;
    setEmailTransportForTests(async () => { n++; if (n === 1) throw new EmailSendError('email_http_503', true); return { id: 'msg_2' }; });
    await w.T(w.consultant(), (c) => notify(c, [uid], { type: 'intro_requested', subjectRefType: 'introduction', subjectRefId: uid, safeTitle: 'Retry me' }));
    await drainJobs();
    expect((await outboxFor(uid))[0]).toMatchObject({ status: 'queued', lastError: 'email_http_503' });
    await makeDue();
    await drainJobs();
    expect(n).toBe(2);
    expect((await outboxFor(uid))[0]).toMatchObject({ status: 'sent', providerMessageId: 'msg_2' });

    const w2 = await load();
    const u2 = w2.ids.users.C01;
    useResend(await emailOf(u2));
    let m = 0;
    setEmailTransportForTests(async () => { m++; throw new EmailSendError('email_http_422', false); });
    await w2.T(w2.consultant(), (c) => notify(c, [u2], { type: 'hire_recorded', subjectRefType: 'hire', subjectRefId: u2, safeTitle: 'Bad request' }));
    await drainJobs();
    await makeDue();
    await drainJobs();
    expect(m).toBe(1);
    expect((await outboxFor(u2))[0]).toMatchObject({ status: 'failed', lastError: 'email_http_422' });
  });

  it('an inactive recipient is suppressed and never sent', async () => {
    const w = await load();
    const uid = w.ids.users.C01;
    useResend(await emailOf(uid));
    const calls: OutgoingEmail[] = [];
    setEmailTransportForTests(async (m) => { calls.push(m); return { id: 'x' }; });
    await w.T(w.consultant(), (c) => notify(c, [uid], { type: 'intro_accepted', subjectRefType: 'introduction', subjectRefId: uid, safeTitle: 'Accepted' }));
    await db().update(S.users).set({ status: 'disabled' }).where(eq(S.users.id, uid));
    await drainJobs();
    expect(calls).toHaveLength(0);
    expect((await outboxFor(uid))[0]).toMatchObject({ status: 'suppressed', suppressedReason: 'recipient_inactive' });
  });
});
