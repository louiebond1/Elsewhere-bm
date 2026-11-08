import { describe, it, expect, afterEach } from 'vitest';
import { env, resetEnvCacheForTests } from '../../src/server/env';

const base = {
  APP_MODE: 'demo', APP_URL: 'http://localhost:3000', DATABASE_URL: 'postgres://x/y', STORAGE_DRIVER: 'database',
  DEMO_ACCESS_PASSWORD: 'access-password-1', DEMO_LOGIN_PASSWORD: 'login-password-1', SESSION_PEPPER: 'a'.repeat(64), PUBLIC_REF_SECRET: 'b'.repeat(64),
};
const snapshot = { ...process.env };
function withEnv(extra: Record<string, string>) {
  for (const k of Object.keys(process.env)) delete process.env[k];
  Object.assign(process.env, base, extra);
  resetEnvCacheForTests();
}
afterEach(() => { for (const k of Object.keys(process.env)) delete process.env[k]; Object.assign(process.env, snapshot); resetEnvCacheForTests(); });

describe('email and monitoring environment', () => {
  it('defaults to the fixture email driver with nothing else required', () => {
    withEnv({ EMAIL_REPLY_TO: '', SENTRY_DSN: '', EMAIL_ALLOWLIST: '' });
    expect(env().EMAIL_DRIVER).toBe('fixture');
    expect(env().SENTRY_DSN).toBeUndefined();
  });
  it('the resend driver requires a key, a sender and an allow-list, and reports names only', () => {
    withEnv({ EMAIL_DRIVER: 'resend', RESEND_API_KEY: 'secret-value-should-not-appear' });
    let msg = '';
    try { env(); } catch (e) { msg = (e as Error).message; }
    expect(msg).toContain('EMAIL_FROM');
    expect(msg).toContain('EMAIL_ALLOWLIST');
    expect(msg).not.toContain('secret-value-should-not-appear');
  });
  it('accepts a complete resend configuration and an optional Sentry DSN', () => {
    withEnv({ EMAIL_DRIVER: 'resend', RESEND_API_KEY: 'k', EMAIL_FROM: 'Demo <demo@sender.test>', EMAIL_ALLOWLIST: '@team.test', SENTRY_DSN: 'https://public@o0.ingest.example.test/1' });
    expect(env().EMAIL_DRIVER).toBe('resend');
  });
});
