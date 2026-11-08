import { describe, it, expect, afterEach } from 'vitest';
import { scrubEvent, sentryOptions, reportError, setErrorReporter } from '../../src/server/monitoring';

afterEach(() => { delete process.env.SENTRY_DSN; setErrorReporter(null); });

describe('error monitoring', () => {
  it('is off without SENTRY_DSN', () => {
    delete process.env.SENTRY_DSN;
    expect(sentryOptions('web')).toBeNull();
    process.env.SENTRY_DSN = '  ';
    expect(sentryOptions('worker')).toBeNull();
  });
  it('sends no personal data, breadcrumbs or tracing when on', () => {
    process.env.SENTRY_DSN = 'https://public@o0.ingest.example.test/1';
    const o = sentryOptions('web')!;
    expect(o).toMatchObject({ sendDefaultPii: false, maxBreadcrumbs: 0, sendClientReports: false });
    expect('tracesSampleRate' in o).toBe(false);
    expect(o.beforeBreadcrumb()).toBeNull();
  });
  it('scrubs request data, user, extra, breadcrumbs and exception text', () => {
    const e = scrubEvent({
      request: { method: 'POST', url: 'https://x.test/api/a?email=maya@example.com', data: '{"password":"p"}', cookies: { bm_session: 's' }, headers: { cookie: 'bm_session=s' } },
      user: { email: 'maya@example.com', ip_address: '1.2.3.4' }, extra: { body: 'CV text' }, breadcrumbs: [{ message: 'Maya Ellis' }],
      contexts: { runtime: { name: 'node' }, state: { cv: 'text' } }, tags: { service: 'web' },
      exception: { values: [{ type: 'TypeError', value: 'Cannot read Maya Ellis', stacktrace: { frames: [{ filename: 'a.ts', lineno: 3, context_line: 'Maya', pre_context: ['Maya'], post_context: ['Maya'], vars: { email: 'maya@example.com' } }] } }] }, message: 'Maya',
    });
    const s = JSON.stringify(e);
    for (const x of ['maya@example.com', 'password', 'bm_session', '1.2.3.4', 'CV text', 'Maya']) expect(s).not.toContain(x);
    expect(e.request).toEqual({ method: 'POST', url: 'https://x.test/api/a' });
    expect(e.exception.values[0].value).toBe('TypeError');
    expect(e.tags).toEqual({ service: 'web' });
    expect(Object.keys(e.contexts)).toEqual(['runtime']);
  });
  it('a failing reporter never breaks the caller', () => {
    setErrorReporter(() => { throw new Error('down'); });
    expect(() => reportError(new Error('x'), { where: 'test' })).not.toThrow();
  });
});
