import { describe, it, expect } from 'vitest';
import { cronAuthorized } from '../../src/server/cron-auth';

describe('cron bearer check', () => {
  const secret = 'cron-secret-value';
  it('rejects a missing secret, a missing header and a mismatch', () => {
    expect(cronAuthorized(`Bearer ${secret}`, undefined)).toBe(false);
    expect(cronAuthorized(`Bearer ${secret}`, '')).toBe(false);
    expect(cronAuthorized(null, secret)).toBe(false);
    expect(cronAuthorized('Bearer wrong-secret-value', secret)).toBe(false);
    expect(cronAuthorized(`Bearer ${secret} `, secret)).toBe(false);
  });
  it('accepts the exact bearer token', () => {
    expect(cronAuthorized(`Bearer ${secret}`, secret)).toBe(true);
  });
});
