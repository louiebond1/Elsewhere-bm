import { describe, it, expect } from 'vitest';
import { eq } from 'drizzle-orm';
import { load } from './helpers';
import { db } from '../../src/server/db/client';
import * as S from '../../src/server/db/schema';
import { onboardClient } from '../../src/server/services/onboard-client';
import { activeContractForClient } from '../../src/server/services/contracts';
import { readCtx } from '../../src/server/services/context';
import { walletView } from '../../src/server/views/client';
import { login } from '../../src/server/auth';

describe('BondMoran onboards a new client', () => {
  it('creates the company, a login with the chosen password, and a live plan with starting credits', async () => {
    const w = await load();
    const r = await w.T(w.consultant(), (c) => onboardClient(c, { companyName: 'Thornfield Fabrics', contactName: 'Sam Rivers', contactEmail: 'Sam@Thornfield.test', password: 'a-long-starting-pw', startingCredits: 12 }));
    expect(r.email).toBe('sam@thornfield.test');
    const [cl] = await db().select().from(S.clients).where(eq(S.clients.id, r.clientId));
    expect(cl.status).toBe('active');
    expect(await activeContractForClient(readCtx(w.consultant()), r.clientId)).toBeTruthy();
    expect((await walletView(readCtx(w.consultant()), r.clientId)).spendable).toBe(String(12 * 10000));
    const session = await login('sam@thornfield.test', 'a-long-starting-pw', '127.0.0.9');
    expect(session).toBeTruthy();
    await expect(login('sam@thornfield.test', 'wrong-password!', '127.0.0.9')).rejects.toMatchObject({ status: 401 });
  });

  it('refuses a duplicate email or company, and only a consultant can do it', async () => {
    const w = await load();
    const input = { companyName: 'Thornfield Fabrics', contactName: 'Sam Rivers', contactEmail: 'sam@thornfield.test', password: 'a-long-starting-pw', startingCredits: 5 };
    await w.T(w.consultant(), (c) => onboardClient(c, input));
    await expect(w.T(w.consultant(), (c) => onboardClient(c, { ...input, companyName: 'Other Co' }))).rejects.toMatchObject({ code: 'EMAIL_IN_USE' });
    await expect(w.T(w.consultant(), (c) => onboardClient(c, { ...input, contactEmail: 'x@y.test' }))).rejects.toMatchObject({ code: 'ORG_EXISTS' });
    await expect(w.T(w.client('A'), (c) => onboardClient(c, { ...input, companyName: 'Z', contactEmail: 'z@z.test' }))).rejects.toMatchObject({ status: 403 });
  });
});
