// Local check only: proves the scrubbed event shape reaches a Sentry endpoint. Not run in production.
import * as Sentry from '@sentry/node';
import { sentryOptions, setErrorReporter, reportError } from '../src/server/monitoring';
(async () => {
  const o = sentryOptions('worker');
  if (!o) throw new Error('set SENTRY_DSN');
  Sentry.init(o);
  setErrorReporter((err, tags) => Sentry.captureException(err, { tags }));
  Sentry.setUser({ email: 'maya@example.com' });
  reportError(new Error('job_failed for Maya Ellis maya@example.com'), { where: 'job', kind: 'extract_cv', code: 'smoke_test' });
  await Sentry.flush(5000);
})();
