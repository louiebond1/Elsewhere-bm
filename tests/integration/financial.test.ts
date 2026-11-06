import { describe, it, expect } from 'vitest';
import { eq, and } from 'drizzle-orm';
import { load } from './helpers';
import { db } from '../../src/server/db/client';
import * as S from '../../src/server/db/schema';
import { requestIntroduction, acceptIntroduction, declineIntroduction, withdrawIntroduction } from '../../src/server/services/intros';
import { activateRole, closeRole, reopenRole, upgradeSearch, roleCharges } from '../../src/server/services/roles';
import { recordHire, recordOutsideHire, recordDeparture, requestReplacement, approveReplacement, grantCredits, reverseTransaction } from '../../src/server/services/hires';
import { requestScreening, previewAutoPicks, confirmAutoPicks } from '../../src/server/services/screenings';

const HIRE = { acceptedOfferDate: '2026-11-06', startDate: '2026-11-20', salaryPence: 4400000n };

describe('baseline', () => {
  it('seeds exact counts and balances', async () => {
    const w = await load();
    expect((await w.wallet('A')).posted).toBe('9.5');
    expect((await w.wallet('B')).posted).toBe('5.25');
    expect((await w.wallet('C')).posted).toBe('3.75');
    const ch = await w.T(w.client('A'), (c) => roleCharges(c, w.ids.roles.R1));
    expect(ch.totalPence).toBe('380000');
    expect(ch.depositPence).toBe('95000');
    expect(ch.comparison.feePence).toBe('880000');
    expect(ch.comparison.percentOfFee).toBe(43);
  });
});

describe('S02 standard deposit and hire', () => {
  it('holds, charges £950 on acceptance, then £2,850 on hire', async () => {
    const w = await load('S02');
    expect(await w.wallet('A')).toEqual({ posted: '9.5', held: '0.25', spendable: '9.25' });
    const i = await w.intro('R1', 'C01');
    await w.T(w.cand('C01'), (c) => acceptIntroduction(c, i.id, w.key()));
    expect(await w.wallet('A')).toEqual({ posted: '9.25', held: '0', spendable: '9.25' });
    const r = await w.T(w.client('A'), (c) => recordHire(c, { introductionId: i.id, ...HIRE, idempotencyKey: w.key() }));
    expect(r.chargedPence).toBe(285000n);
    expect((await w.wallet('A')).posted).toBe('8.5');
    const t = (await w.txs('A')).filter((x) => x.roleId === w.ids.roles.R1);
    expect(t.map((x) => [x.type, x.deltaPence])).toEqual([['deposit_debit', -95000n], ['hire_balance_debit', -285000n]]);
  });
  it('a repeated hire for the same candidate and start date charges nothing (F13)', async () => {
    const w = await load('S02');
    const i = await w.intro('R1', 'C01');
    await w.T(w.cand('C01'), (c) => acceptIntroduction(c, i.id, w.key()));
    const a = await w.T(w.client('A'), (c) => recordHire(c, { introductionId: i.id, ...HIRE, idempotencyKey: w.key() }));
    const b = await w.T(w.client('A'), (c) => recordHire(c, { introductionId: i.id, ...HIRE, idempotencyKey: w.key() }));
    expect(b.existing).toBe(true);
    expect(b.hire.id).toBe(a.hire.id);
    expect((await w.wallet('A')).posted).toBe('8.5');
  });
});

describe('S03 further intro free', () => {
  it('second acceptance makes no debit', async () => {
    const w = await load('S03');
    const before = (await w.txs('A')).length;
    const i = await w.intro('R1', 'C02');
    await w.T(w.cand('C02'), (c) => acceptIntroduction(c, i.id, w.key()));
    expect((await w.txs('A')).length).toBe(before);
    const ch = await w.T(w.client('A'), (c) => roleCharges(c, w.ids.roles.R1));
    expect(ch.accepted).toBe(2);
  });
});

describe('S04 extra role', () => {
  it('requires confirmation then debits £475 once; no second deposit on acceptance', async () => {
    const w = await load('S04');
    await expect(w.T(w.client('A'), (c) => activateRole(c, w.ids.roles.R3, { confirmExtraDeposit: false, idempotencyKey: w.key() }))).rejects.toMatchObject({ code: 'EXTRA_ROLE_CONFIRMATION_REQUIRED' });
    await w.T(w.client('A'), (c) => activateRole(c, w.ids.roles.R3, { confirmExtraDeposit: true, idempotencyKey: w.key() }));
    const t = (await w.txs('A')).filter((x) => x.roleId === w.ids.roles.R3);
    expect(t.map((x) => [x.type, x.deltaUnits, x.deltaPence])).toEqual([['deposit_debit', -1250n, -47500n]]);
    const intro = await w.T(w.client('A'), (c) => requestIntroduction(c, { roleId: w.ids.roles.R3, candidateRef: w.ref('R3', 'C03'), message: '', idempotencyKey: w.key() }));
    expect((await w.wallet('A')).held).toBe('0');
    await w.T(w.cand('C03'), (c) => acceptIntroduction(c, intro.id, w.key()));
    expect((await w.txs('A')).filter((x) => x.roleId === w.ids.roles.R3)).toHaveLength(1);
  });
});

describe('S05 full search upgrade', () => {
  it('changes the total, not the deposit, and charges nothing at upgrade', async () => {
    const w = await load('S05');
    const n = (await w.txs('A')).length;
    await w.T(w.client('A'), (c) => upgradeSearch(c, w.ids.roles.R1));
    expect((await w.txs('A')).length).toBe(n);
    const ch = await w.T(w.client('A'), (c) => roleCharges(c, w.ids.roles.R1));
    expect([ch.totalUnits, ch.totalPence, ch.remainingUnits, ch.remainingPence]).toEqual(['15000', '570000', '12500', '475000']);
    const i = await w.intro('R1', 'C01');
    const r = await w.T(w.client('A'), (c) => recordHire(c, { introductionId: i.id, ...HIRE, idempotencyKey: w.key() }));
    expect([r.chargedUnits, r.chargedPence]).toEqual([12500n, 475000n]);
  });
});

describe('S06/S07 replacement', () => {
  it('inside window: zero-price linked role with fresh limits and a zero hire', async () => {
    const w = await load('S06');
    const h = (await db().select().from(S.hires).where(eq(S.hires.roleId, w.ids.roles.R5)))[0];
    const rc = await w.T(w.client('B'), (c) => requestReplacement(c, h.id, 'Left in probation'));
    expect(rc.eligibility).toBe('eligible');
    const n = (await w.txs('B')).length;
    const ap = await w.T(w.consultant(), (c) => approveReplacement(c, rc.id));
    const rid = ap.replacementRoleId!;
    const ch = await w.T(w.client('B'), (c) => roleCharges(c, rid));
    expect([ch.totalUnits, ch.accepted, ch.screeningsUsed, ch.isReplacementRole]).toEqual(['0', 0, 0, true]);
    const { roleScopedRef } = await import('../../src/server/dto/refs');
    const intro = await w.T(w.client('B'), (c) => requestIntroduction(c, { roleId: rid, candidateRef: roleScopedRef(rid, w.ids.candidates.C24), message: '', idempotencyKey: w.key() }));
    await w.T(w.cand('C24'), (c) => acceptIntroduction(c, intro.id, w.key()));
    const r = await w.T(w.client('B'), (c) => recordHire(c, { introductionId: intro.id, acceptedOfferDate: '2026-11-06', startDate: '2026-12-01', salaryPence: 11000000n, idempotencyKey: w.key() }));
    expect(r.chargedUnits).toBe(0n);
    expect((await w.txs('B')).length).toBe(n);
    const [after] = await db().select().from(S.replacementCases).where(eq(S.replacementCases.id, rc.id));
    expect(after.status).toBe('fulfilled');
    // F17: the replacement hire cannot create another free replacement
    await w.T(w.client('B'), (c) => recordDeparture(c, r.hire.id, { leftDate: '2026-12-10', reason: 'Left' }));
    const rc2 = await w.T(w.client('B'), (c) => requestReplacement(c, r.hire.id, 'Left again'));
    expect(rc2.eligibility).toBe('already_used');
  });
  it('outside window: not eligible and cannot be approved', async () => {
    const w = await load('S07');
    const h = (await db().select().from(S.hires).where(eq(S.hires.roleId, w.ids.roles.R6)))[0];
    const rc = await w.T(w.client('B'), (c) => requestReplacement(c, h.id, 'Left'));
    expect(rc.eligibility).toBe('outside_window');
    await expect(w.T(w.consultant(), (c) => approveReplacement(c, rc.id))).rejects.toMatchObject({ code: 'REPLACEMENT_NOT_ELIGIBLE' });
  });
});

describe('S08 second hire', () => {
  it('creates a new full-price order and leaves the first hire unchanged', async () => {
    const w = await load('S08');
    const i = await w.intro('R1', 'C02');
    const r = await w.T(w.client('A'), (c) => recordHire(c, { introductionId: i.id, ...HIRE, idempotencyKey: w.key() }));
    expect([r.chargedUnits, r.chargedPence]).toEqual([10000n, 380000n]);
    const orders = await db().select().from(S.hireOrders).where(eq(S.hireOrders.roleId, w.ids.roles.R1));
    expect(orders.map((o) => [o.orderNumber, o.kind, o.status]).sort()).toEqual([[1, 'primary', 'paid'], [2, 'additional', 'paid']]);
    expect((await w.txs('A')).filter((t) => t.roleId === w.ids.roles.R1).map((t) => t.type)).toEqual(['deposit_debit', 'hire_balance_debit', 'second_hire_debit']);
  });
});

describe('S09/S10/S25 outside-system hire', () => {
  it('collects only £3,375, then a duplicate charges nothing', async () => {
    const w = await load('S09');
    const i = await w.intro('R8', 'C36');
    const args = { clientId: w.ids.clients.C, introductionId: i.id, acceptedOfferDate: '2026-10-15', startDate: '2026-11-01', salaryPence: 6000000n };
    const r = await w.T(w.consultant(), (c) => recordOutsideHire(c, { ...args, idempotencyKey: w.key() }));
    expect([r.chargedUnits, r.chargedPence]).toEqual([7500n, 337500n]);
    expect((await w.wallet('C')).posted).toBe('3');
    const again = await w.T(w.consultant(), (c) => recordOutsideHire(c, { ...args, idempotencyKey: w.key() }));
    expect(again.existing).toBe(true);
    expect((await w.wallet('C')).posted).toBe('3');
  });
  it('outside the 12-month window is blocked', async () => {
    const w = await load('S25');
    const i = await w.intro('R8', 'C36');
    await expect(w.T(w.consultant(), (c) => recordOutsideHire(c, { clientId: w.ids.clients.C, introductionId: i.id, acceptedOfferDate: '2026-09-02', startDate: '2026-09-15', salaryPence: 6000000n, idempotencyKey: w.key() }))).rejects.toMatchObject({ code: 'OUTSIDE_HIRE_WINDOW' });
  });
});

describe('S11 intro cap', () => {
  it('ten accepted blocks further requests; withdrawn still counts', async () => {
    const w = await load('S11');
    const i = await w.intro('R1', 'C11');
    await w.T(w.cand('C11'), (c) => acceptIntroduction(c, i.id, w.key()));
    await expect(w.T(w.client('A'), (c) => requestIntroduction(c, { roleId: w.ids.roles.R1, candidateRef: w.ref('R1', 'C12'), message: '', idempotencyKey: w.key() }))).rejects.toMatchObject({ code: 'INTRO_LIMIT_REACHED' });
    await w.T(w.cand('C11'), (c) => withdrawIntroduction(c, i.id));
    await expect(w.T(w.client('A'), (c) => requestIntroduction(c, { roleId: w.ids.roles.R1, candidateRef: w.ref('R1', 'C12'), message: '', idempotencyKey: w.key() }))).rejects.toMatchObject({ code: 'INTRO_LIMIT_REACHED' });
  });
});

describe('S13 close and reopen', () => {
  it('keeps deposit and counters, cancels pending and clears the hold', async () => {
    const w = await load('S13');
    expect((await w.wallet('A')).held).toBe('0');
    await w.T(w.client('A'), (c) => closeRole(c, w.ids.roles.R1, 'on_hold'));
    expect((await w.intro('R1', 'C03')).state).toBe('cancelled');
    const n = (await w.txs('A')).length;
    await w.T(w.client('A'), (c) => reopenRole(c, w.ids.roles.R1, { confirmDeposit: false, idempotencyKey: w.key() }));
    expect((await w.txs('A')).length).toBe(n);
    const ch = await w.T(w.client('A'), (c) => roleCharges(c, w.ids.roles.R1));
    expect([ch.accepted, ch.depositPaid, ch.orderStatus]).toEqual([2, true, 'deposit_paid']);
  });
});

describe('S14/S15 insufficient credits then fund and retry', () => {
  it('blocks the hire without recording anything, then succeeds after a grant', async () => {
    const w = await load('S14');
    const i = await w.intro('R7', 'C33');
    await w.T(w.cand('C33'), (c) => acceptIntroduction(c, i.id, w.key()));
    expect((await w.wallet('C')).spendable).toBe('0');
    await expect(w.T(w.client('C'), (c) => recordHire(c, { introductionId: i.id, acceptedOfferDate: '2026-11-06', startDate: '2026-11-20', salaryPence: 3200000n, idempotencyKey: w.key() }))).rejects.toMatchObject({ code: 'INSUFFICIENT_CREDITS' });
    expect(await db().select().from(S.hires).where(eq(S.hires.roleId, w.ids.roles.R7))).toHaveLength(0);
    const [pe] = await db().select().from(S.pipelineEntries).where(eq(S.pipelineEntries.introductionId, i.id));
    expect(pe.stage).toBe('introduced');
    await w.T(w.consultant(), (c) => grantCredits(c, { clientId: w.ids.clients.C, credits: 1, reason: 'Demo top-up', idempotencyKey: w.key() }));
    const r = await w.T(w.client('C'), (c) => recordHire(c, { introductionId: i.id, acceptedOfferDate: '2026-11-06', startDate: '2026-11-20', salaryPence: 3200000n, idempotencyKey: w.key() }));
    expect([r.chargedUnits, r.chargedPence]).toEqual([3750n, 168750n]);
    expect((await w.wallet('C')).posted).toBe('0.625');
  });
});

describe('S16/S17 decline and withdraw', () => {
  it('decline releases the hold without a deposit', async () => {
    const w = await load('S16');
    const i = await w.intro('R1', 'C01');
    await w.T(w.cand('C01'), (c) => declineIntroduction(c, i.id));
    expect(await w.wallet('A')).toEqual({ posted: '9.5', held: '0', spendable: '9.5' });
  });
  it('withdraw revokes the grant but keeps the deposit and the slot', async () => {
    const w = await load('S17');
    const i = await w.intro('R1', 'C01');
    await w.T(w.cand('C01'), (c) => withdrawIntroduction(c, i.id));
    const [g] = await db().select().from(S.identityGrants).where(eq(S.identityGrants.introductionId, i.id));
    expect(g.revokedAt).not.toBeNull();
    expect((await w.wallet('A')).posted).toBe('9.25');
    const ch = await w.T(w.client('A'), (c) => roleCharges(c, w.ids.roles.R1));
    expect(ch.accepted).toBe(1);
  });
});

describe('S19/S20 screenings', () => {
  it('auto picks five with a discovery slot and no charges', async () => {
    const w = await load('S19');
    const p = await w.T(w.client('A'), (c) => previewAutoPicks(c, w.ids.roles.R1));
    expect(p.picks).toHaveLength(5);
    expect(p.picks.some((x) => x.discoverySlot)).toBe(true);
    const n = (await w.txs('A')).length;
    await w.T(w.client('A'), (c) => confirmAutoPicks(c, w.ids.roles.R1, p.picks.map((x) => x.ref)));
    expect((await w.txs('A')).length).toBe(n);
    await expect(w.T(w.client('A'), (c) => requestScreening(c, { roleId: w.ids.roles.R1, candidateRef: w.ref('R1', 'C12') }))).rejects.toMatchObject({ code: 'INCLUDED_SCREENING_LIMIT' });
  });
  it('a sixth screening is blocked after five completed', async () => {
    const w = await load('S20');
    await expect(w.T(w.client('A'), (c) => requestScreening(c, { roleId: w.ids.roles.R1, candidateRef: w.ref('R1', 'C11') }))).rejects.toMatchObject({ code: 'INCLUDED_SCREENING_LIMIT' });
  });
});

describe('S24/S26 and corrections', () => {
  it('salary mismatch blocks the hire with no debit', async () => {
    const w = await load('S24');
    const i = await w.intro('R1', 'C01');
    const n = (await w.txs('A')).length;
    await expect(w.T(w.client('A'), (c) => recordHire(c, { introductionId: i.id, ...HIRE, salaryPence: 4500000n, idempotencyKey: w.key() }))).rejects.toMatchObject({ code: 'SALARY_REVIEW' });
    expect((await w.txs('A')).length).toBe(n);
  });
  it('full search from the outset still uses the standard-base deposit', async () => {
    const w = await load('S26');
    await w.T(w.client('A'), (c) => activateRole(c, w.ids.roles.R1, { confirmExtraDeposit: false, idempotencyKey: w.key() }));
    const intro = await w.T(w.client('A'), (c) => requestIntroduction(c, { roleId: w.ids.roles.R1, candidateRef: w.ref('R1', 'C01'), message: '', idempotencyKey: w.key() }));
    await w.T(w.cand('C01'), (c) => acceptIntroduction(c, intro.id, w.key()));
    const ch = await w.T(w.client('A'), (c) => roleCharges(c, w.ids.roles.R1));
    expect([ch.depositUnits, ch.totalUnits, ch.remainingUnits]).toEqual(['2500', '15000', '12500']);
  });
  it('an exact reversal cannot be reversed twice (F32)', async () => {
    const w = await load();
    const g = await w.T(w.consultant(), (c) => grantCredits(c, { clientId: w.ids.clients.A, credits: 1, reason: 'Mistake', idempotencyKey: w.key() }));
    await w.T(w.consultant(), (c) => reverseTransaction(c, { transactionId: g.id, reason: 'Entered in error', idempotencyKey: w.key() }));
    await expect(w.T(w.consultant(), (c) => reverseTransaction(c, { transactionId: g.id, reason: 'Again', idempotencyKey: w.key() }))).rejects.toMatchObject({ code: 'ALREADY_REVERSED' });
    expect((await w.wallet('A')).posted).toBe('9.5');
    await expect(db().execute((await import('drizzle-orm')).sql`update credit_transactions set reason = 'x' where id = ${g.id}`)).rejects.toThrow();
  });
});

describe('concurrency (real PostgreSQL connections)', () => {
  it('C04: two simultaneous accepts create exactly one deposit', async () => {
    const w = await load('S16');
    await w.T(w.client('A'), (c) => requestIntroduction(c, { roleId: w.ids.roles.R1, candidateRef: w.ref('R1', 'C02'), message: '', idempotencyKey: w.key() }));
    const i1 = await w.intro('R1', 'C01');
    const i2 = await w.intro('R1', 'C02');
    await Promise.all([w.T(w.cand('C01'), (c) => acceptIntroduction(c, i1.id, w.key())), w.T(w.cand('C02'), (c) => acceptIntroduction(c, i2.id, w.key()))]);
    const deps = (await w.txs('A')).filter((t) => t.roleId === w.ids.roles.R1 && t.type === 'deposit_debit');
    expect(deps).toHaveLength(1);
  });
  it('C10: simultaneous hire requests cannot double charge', async () => {
    const w = await load('S24');
    const i = await w.intro('R1', 'C01');
    const rs = await Promise.allSettled([1, 2, 3].map(() => w.T(w.client('A'), (c) => recordHire(c, { introductionId: i.id, ...HIRE, idempotencyKey: w.key() }))));
    expect(rs.filter((r) => r.status === 'fulfilled').length).toBeGreaterThan(0);
    expect((await w.txs('A')).filter((t) => t.type === 'hire_balance_debit')).toHaveLength(1);
    expect((await w.wallet('A')).posted).toBe('8.5');
  });
  it('C05: simultaneous activations both count against the limit', async () => {
    const w = await load();
    await w.T(w.client('A'), (c) => closeRole(c, w.ids.roles.R1, 'on_hold'));
    const mk = async (k: string) => (await w.T(w.client('A'), (c) => import('../../src/server/services/roles').then((m) => m.createDraftRole(c, { vacancyKey: k, title: `Analyst ${k}`, roleFamily: 'finance', salaryPounds: 44000, locationRegion: 'london', workMode: 'hybrid', outcomes: ['Do the work'], criteria: [ { key: 'a1', label: 'Reconciliations', importance: 'essential', weight: 3, evidenceTags: ['reconciliations'] }, { key: 'a2', label: 'Reporting', importance: 'essential', weight: 3, evidenceTags: ['reporting'] }, { key: 'a3', label: 'Learning', importance: 'desirable', weight: 2, evidenceTags: ['learning'] } ] })))).id;
    const a = await mk('NEW-1');
    const b = await mk('NEW-2');
    const rs = await Promise.allSettled([a, b].map((id) => w.T(w.client('A'), (c) => activateRole(c, id, { confirmExtraDeposit: true, idempotencyKey: w.key() }))));
    expect(rs.every((r) => r.status === 'fulfilled')).toBe(true);
    const roles = await db().select().from(S.roles).where(and(eq(S.roles.clientId, w.ids.clients.A), eq(S.roles.status, 'open')));
    expect(roles.filter((r) => r.isExtraRole)).toHaveLength(1);
  });
});
