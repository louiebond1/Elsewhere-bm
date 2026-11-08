import { describe, it, expect } from 'vitest';
import { eq } from 'drizzle-orm';
import { load } from './helpers';
import { db } from '../../src/server/db/client';
import * as S from '../../src/server/db/schema';
import { createCheckout, simulateSuccess, simulateDecline, cancelCheckout } from '../../src/server/services/checkout';
import { reconcileWallet } from '../../src/server/services/ledger';
import { acceptIntroduction } from '../../src/server/services/intros';
import { recordHire } from '../../src/server/services/hires';

const holds = async (walletClient: string) => db().select().from(S.creditHolds).innerJoin(S.wallets, eq(S.wallets.id, S.creditHolds.walletId)).where(eq(S.wallets.clientId, walletClient));

describe('Demo checkout (no money charged)', () => {
  it('opening a checkout changes no balance, hold or ledger entry', async () => {
    const w = await load();
    const before = await w.wallet('A');
    const n = (await w.txs('A')).length;
    const h = (await holds(w.ids.clients.A)).length;
    const c = await w.T(w.client('A'), (x) => createCheckout(x, { credits: 2 }));
    expect(c.status).toBe('open');
    expect(c.units).toBe(20000n);
    expect(c.totalPence).toBe(BigInt(c.ratePence) * 2n);
    expect(await w.wallet('A')).toEqual(before);
    expect((await w.txs('A')).length).toBe(n);
    expect((await holds(w.ids.clients.A)).length).toBe(h);
  });

  it('success posts exactly one simulated_purchase entry; repeats and parallel clicks post nothing more', async () => {
    const w = await load();
    const c = await w.T(w.client('A'), (x) => createCheckout(x, { credits: 3 }));
    const n = (await w.txs('A')).length;
    const results = await Promise.allSettled([1, 2, 3, 4].map(() => w.T(w.client('A'), (x) => simulateSuccess(x, c.id))));
    expect(results.every((r) => r.status === 'fulfilled')).toBe(true);
    await w.T(w.client('A'), (x) => simulateSuccess(x, c.id));
    const txs = await w.txs('A');
    expect(txs.length).toBe(n + 1);
    const t = txs[txs.length - 1];
    expect(t).toMatchObject({ type: 'simulated_purchase', deltaUnits: 30000n, idempotencyKey: `checkout:${c.id}`, deltaPence: BigInt(c.totalPence) });
    const [row] = await db().select().from(S.simulatedCheckouts).where(eq(S.simulatedCheckouts.id, c.id));
    expect(row).toMatchObject({ status: 'succeeded', transactionId: t.id });
    const [wal] = await db().select().from(S.wallets).where(eq(S.wallets.clientId, w.ids.clients.A));
    const rec = await w.T(w.consultant(), (x) => reconcileWallet(x, wal.id));
    expect(rec).toMatchObject({ discrepancy: false, chainOk: true });
  });

  it('decline and cancel post nothing and cannot later succeed; a new checkout works', async () => {
    const w = await load();
    const before = await w.wallet('A');
    const n = (await w.txs('A')).length;
    const d = await w.T(w.client('A'), (x) => createCheckout(x, { credits: 1 }));
    await w.T(w.client('A'), (x) => simulateDecline(x, d.id));
    await w.T(w.client('A'), (x) => simulateDecline(x, d.id)); // repeat is harmless
    await expect(w.T(w.client('A'), (x) => simulateSuccess(x, d.id))).rejects.toMatchObject({ code: 'CHECKOUT_ALREADY_RESOLVED', status: 409 });
    const k = await w.T(w.client('A'), (x) => createCheckout(x, { credits: 1 }));
    await w.T(w.client('A'), (x) => cancelCheckout(x, k.id));
    await expect(w.T(w.client('A'), (x) => simulateSuccess(x, k.id))).rejects.toMatchObject({ code: 'CHECKOUT_ALREADY_RESOLVED' });
    expect(await w.wallet('A')).toEqual(before);
    expect((await w.txs('A')).length).toBe(n);
    const retry = await w.T(w.client('A'), (x) => createCheckout(x, { credits: 1 }));
    await w.T(w.client('A'), (x) => simulateSuccess(x, retry.id));
    expect((await w.txs('A')).length).toBe(n + 1);
    await expect(w.T(w.client('A'), (x) => simulateDecline(x, retry.id))).rejects.toMatchObject({ code: 'CHECKOUT_ALREADY_RESOLVED' });
  });

  it('refuses without a contract in effect (including a future-dated one)', async () => {
    const w = await load();
    await db().update(S.contracts).set({ startDate: '2026-12-01' }).where(eq(S.contracts.clientId, w.ids.clients.A));
    await expect(w.T(w.client('A'), (x) => createCheckout(x, { credits: 1 }))).rejects.toMatchObject({ code: 'CONTRACT_NOT_ACTIVE' });
  });

  it('only the owning client can act on a checkout', async () => {
    const w = await load();
    const c = await w.T(w.client('A'), (x) => createCheckout(x, { credits: 1 }));
    await expect(w.T(w.client('B'), (x) => simulateSuccess(x, c.id))).rejects.toMatchObject({ status: 404 });
    await expect(w.T(w.consultant(), (x) => simulateSuccess(x, c.id))).rejects.toMatchObject({ status: 403 });
    await expect(w.T(w.cand('C01'), (x) => createCheckout(x, { credits: 1 }))).rejects.toMatchObject({ status: 403 });
    await expect(w.T(w.client('A'), (x) => simulateSuccess(x, 'not-a-uuid'))).rejects.toMatchObject({ status: 404 });
  });

  it('S14 shortfall clears after a simulated purchase; deposit and hire rules are unchanged', async () => {
    const w = await load('S14');
    const intro = await w.intro('R7', 'C33');
    await w.T(w.cand('C33'), (x) => acceptIntroduction(x, intro.id, w.key()));
    expect((await w.wallet('C')).spendable).toBe('0');
    const hire = { introductionId: intro.id, acceptedOfferDate: '2026-11-06', startDate: '2026-11-20', salaryPence: 3200000n };
    await expect(w.T(w.client('C'), (x) => recordHire(x, { ...hire, idempotencyKey: w.key() }))).rejects.toMatchObject({ code: 'INSUFFICIENT_CREDITS' });
    const c = await w.T(w.client('C'), (x) => createCheckout(x, { credits: 1 }));
    await w.T(w.client('C'), (x) => simulateSuccess(x, c.id));
    expect((await w.wallet('C')).spendable).toBe('1');
    const r = await w.T(w.client('C'), (x) => recordHire(x, { ...hire, idempotencyKey: w.key() }));
    expect(r.chargedUnits).toBe(3750n);
    const all = await w.txs('C');
    const types = all.map((t) => t.type);
    expect(all.filter((t) => t.type === 'deposit_debit' && t.roleId === w.ids.roles.R7)).toHaveLength(1);
    expect(types.filter((t) => t === 'simulated_purchase')).toHaveLength(1);
  });
});
