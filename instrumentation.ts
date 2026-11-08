import { sentryOptions } from './src/server/monitoring';

export async function register() {
  if (process.env.NEXT_RUNTIME !== 'nodejs') return;
  const opts = sentryOptions('web');
  if (!opts) return;
  const Sentry = await import('@sentry/nextjs');
  Sentry.init(opts);
}

/** Reports unhandled server errors only when monitoring is enabled. */
export async function onRequestError(...args: unknown[]) {
  if (!process.env.SENTRY_DSN?.trim()) return;
  const Sentry = await import('@sentry/nextjs');
  return (Sentry.captureRequestError as (...a: unknown[]) => void)(...args);
}
