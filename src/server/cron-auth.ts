import { timingSafeEqual } from 'node:crypto';

/** Bearer check for the drain route. Missing or mismatched secrets are the same result. */
export function cronAuthorized(authorization: string | null, secret: string | undefined): boolean {
  if (!secret) return false;
  const expected = Buffer.from(`Bearer ${secret}`);
  const got = Buffer.from(authorization ?? '');
  if (got.length !== expected.length) {
    timingSafeEqual(expected, expected);
    return false;
  }
  return timingSafeEqual(got, expected);
}
