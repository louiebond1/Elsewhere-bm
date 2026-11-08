import { describe, it, expect } from 'vitest';
import { eq } from 'drizzle-orm';
import { load } from './helpers';
import { db } from '../../src/server/db/client';
import * as S from '../../src/server/db/schema';
import { readCtx } from '../../src/server/services/context';
import { recordOutsideHire, recordHire, hirePreview } from '../../src/server/services/hires';
import { previewAutoPicks } from '../../src/server/services/screenings';

const outside = (w: Awaited<ReturnType<typeof load>>, introId: string, startDate: string) => ({ clientId: w.ids.clients.C, introductionId: introId, acceptedOfferDate: '2026-10-15', startDate, salaryPence: 6000000n });

describe('B1/B1a: an already-recorded hire is recognised and never repeated', () => {
  it('preview says already recorded with no charge; same date returns existing; different date is refused', async () => {
    const w = await load('S10');
    const intro = await w.intro('R8', 'C36');
    const before = await w.txs('C');
    const p = await hirePreview(readCtx(w.consultant()), intro.id);
    expect(p).toMatchObject({ kind: 'already_recorded', remainingUnits: '0', remainingPence: '0', totalPence: '450000', paidPence: '450000', isNewFullPrice: false });
    expect(p?.recorded).toMatchObject({ offerDate: '2026-10-15', startDate: '2026-11-01', source: 'outside_system' });
    const same = await w.T(w.consultant(), (c) => recordOutsideHire(c, { ...outside(w, intro.id, '2026-11-01'), idempotencyKey: w.key() }));
    expect(same.existing).toBe(true);
    await expect(w.T(w.consultant(), (c) => recordOutsideHire(c, { ...outside(w, intro.id, '2026-12-01'), idempotencyKey: w.key() }))).rejects.toMatchObject({ code: 'HIRE_ALREADY_RECORDED', status: 409 });
    expect((await w.txs('C')).length).toBe(before.length);
    expect(await db().select().from(S.hires).where(eq(S.hires.introductionId, intro.id))).toHaveLength(1);
    expect((await w.wallet('C')).posted).toBe('3');
  });
  it('the in-system path refuses a repeat hire of the same introduction with a new start date', async () => {
    const w = await load('S08');
    const i1 = await w.intro('R1', 'C01');
    const n = (await w.txs('A')).length;
    await expect(w.T(w.client('A'), (c) => recordHire(c, { introductionId: i1.id, acceptedOfferDate: '2026-11-06', startDate: '2026-12-15', salaryPence: 4400000n, idempotencyKey: w.key() }))).rejects.toMatchObject({ code: 'HIRE_ALREADY_RECORDED' });
    expect((await w.txs('A')).length).toBe(n);
  });
  it('S08 regression: a different accepted candidate is still a new full price', async () => {
    const w = await load('S08');
    const i2 = await w.intro('R1', 'C02');
    const p = await hirePreview(readCtx(w.client('A')), i2.id);
    expect(p).toMatchObject({ kind: 'additional', isNewFullPrice: true, remainingPence: '380000' });
    const r = await w.T(w.client('A'), (c) => recordHire(c, { introductionId: i2.id, acceptedOfferDate: '2026-11-06', startDate: '2026-11-20', salaryPence: 4400000n, idempotencyKey: w.key() }));
    expect([r.chargedUnits, r.chargedPence]).toEqual([10000n, 380000n]);
  });
});

describe('B3: only the reserved pick is labelled as the discovery slot', () => {
  it('S19 preview has five picks and exactly one discovery slot', async () => {
    const w = await load('S19');
    const p = await previewAutoPicks(readCtx(w.client('A')), w.ids.roles.R1);
    expect(p.picks).toHaveLength(5);
    expect(p.picks.filter((x) => x.discoverySlot)).toHaveLength(1);
    expect(p.picks.find((x) => x.discoverySlot)?.ref).toBe(w.ref('R1', 'C07'));
    expect(p.picks.map((x) => x.ref)).toEqual(['C01', 'C09', 'C02', 'C04', 'C07'].map((c) => w.ref('R1', c)));
  });
});
