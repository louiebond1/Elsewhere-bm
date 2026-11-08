/**
 * Error monitoring settings shared by the web server and the worker. Disabled unless SENTRY_DSN is set.
 * Nothing personal is sent: no request bodies, cookies, headers, query strings, user records or
 * breadcrumbs, and no performance tracing. Exception messages are replaced with the error class name
 * plus any code, so text that might quote user input never leaves the server.
 */
type Ev = {
  request?: { method?: string; url?: string; [k: string]: unknown };
  user?: unknown; extra?: unknown; contexts?: Record<string, unknown>; breadcrumbs?: unknown; tags?: Record<string, unknown>;
  exception?: { values?: Array<{ type?: string; value?: string; stacktrace?: { frames?: Array<Record<string, unknown>> } }> };
  message?: string;
};

export function scrubEvent<T>(event: T): T {
  const e = event as unknown as Ev;
  if (e.request) {
    const url = typeof e.request.url === 'string' ? e.request.url.split('?')[0] : undefined;
    e.request = { method: e.request.method, url };
  }
  delete e.user;
  delete e.extra;
  delete e.breadcrumbs;
  if (e.contexts) for (const k of Object.keys(e.contexts)) if (!['runtime', 'os', 'app', 'trace'].includes(k)) delete e.contexts[k];
  if (e.exception?.values) for (const v of e.exception.values) {
    v.value = v.type ?? 'Error';
    // Keep file, function and line numbers; drop source lines and local variables.
    for (const f of v.stacktrace?.frames ?? []) { delete f.pre_context; delete f.context_line; delete f.post_context; delete f.vars; }
  }
  if (e.message) e.message = 'redacted';
  return event;
}

export function sentryOptions(service: 'web' | 'worker') {
  const dsn = process.env.SENTRY_DSN?.trim();
  if (!dsn) return null;
  return {
    dsn,
    environment: process.env.SENTRY_ENVIRONMENT?.trim() || 'demo',
    initialScope: { tags: { service } },
    sendDefaultPii: false,
    // tracesSampleRate is left unset so no spans are created at all (setting 0 still instruments).
    sendClientReports: false,
    maxBreadcrumbs: 0,
    beforeBreadcrumb: () => null,
    beforeSend: scrubEvent,
  };
}

type Reporter = (err: unknown, tags: Record<string, string>) => void;
let reporter: Reporter | null = null;
/** The worker registers Sentry here when enabled; with nothing registered, reports are dropped. */
export function setErrorReporter(r: Reporter | null) { reporter = r; }
export function reportError(err: unknown, tags: Record<string, string>) {
  try { reporter?.(err, tags); } catch { /* monitoring must never break the caller */ }
}
