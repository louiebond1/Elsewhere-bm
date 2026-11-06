import { createHash, createHmac, randomBytes } from 'node:crypto';

/** RFC 4122 UUIDv5. */
export function uuidv5(name: string, namespace: string): string {
  const ns = Buffer.from(namespace.replace(/-/g, ''), 'hex');
  const hash = createHash('sha1').update(ns).update(name, 'utf8').digest();
  hash[6] = (hash[6] & 0x0f) | 0x50;
  hash[8] = (hash[8] & 0x3f) | 0x80;
  const h = hash.subarray(0, 16).toString('hex');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20, 32)}`;
}

export const sha256 = (s: string | Buffer) => createHash('sha256').update(s).digest('hex');
export const randomToken = () => randomBytes(32).toString('base64url');
export const hmac = (secret: string, value: string) => createHmac('sha256', secret).update(value).digest('hex');

export const isUuid = (s: unknown): s is string => typeof s === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s);
