import 'server-only';
import { hmac } from '../lib/ids';

const secret = () => {
  const s = process.env.PUBLIC_REF_SECRET;
  if (!s || s.length < 64) throw new Error('PUBLIC_REF_SECRET is not configured');
  return s;
};

/** Role-scoped opaque candidate reference. Different per role to reduce cross-role linkage. */
export const roleScopedRef = (roleId: string, candidateId: string) => 'R' + hmac(secret(), `cand:${roleId}:${candidateId}`).slice(0, 20);
export const roleScopedEvidenceRef = (roleId: string, evidenceId: string) => 'E' + hmac(secret(), `ev:${roleId}:${evidenceId}`).slice(0, 16);
