import { describe, it, expect } from 'vitest';
import { eq, and } from 'drizzle-orm';
import { load } from './helpers';
import { db } from '../../src/server/db/client';
import * as S from '../../src/server/db/schema';
import { readCtx } from '../../src/server/services/context';
import { requestScreening, returnScreening, respondToScreening, completeScreening } from '../../src/server/services/screenings';
import { roleCounters, criteriaFor } from '../../src/server/services/roles';
import { requestSimulations } from '../../src/server/services/simulation';
import { drainJobs } from '../../src/server/services/worker-handlers';
import { bestPeople } from '../../src/server/views/client';

describe('BondMoran screening coupons', () => {
  it('a coupon comes back when BondMoran says the person is not right, and the client is told', async () => {
    const w = await load();
    const R1 = w.ids.roles.R1;
    const s = await w.T(w.client('A'), (c) => requestScreening(c, { roleId: R1, candidateRef: w.ref('R1', 'C01') }));
    expect((await roleCounters(readCtx(w.client('A')), R1)).screeningsUsed).toBe(0);
    await w.T(w.cand('C01'),c=>respondToScreening(c,s.id,true));
    expect((await roleCounters(readCtx(w.client('A')), R1)).screeningsUsed).toBe(1);
    await expect(w.T(w.client('A'), (c) => returnScreening(c, s.id, 'x'))).rejects.toMatchObject({ status: 403 });
    const criteria=await criteriaFor(readCtx(w.consultant()),R1);
    await w.T(w.consultant(),c=>completeScreening(c,s.id,{outcome:'fail',minutes:15,notesPrivate:'',summarySafe:'Not right for the agreed requirements.',assessments:criteria.map(x=>({criterionId:x.id,level:'unknown',evidenceIds:[],observationPrivate:''}))}));
    expect((await roleCounters(readCtx(w.client('A')), R1)).screeningsUsed).toBe(0);
    const [row] = await db().select().from(S.screenings).where(eq(S.screenings.id, s.id));
    expect(row).toMatchObject({ status: 'returned', outcome:'fail' });
    const notes = await db().select().from(S.notifications).where(and(eq(S.notifications.recipientUserId, w.ids.users['client:A']), eq(S.notifications.type, 'screening_updated')));
    expect(notes.some((n) => /screening coupon is back/.test(n.safeTitle))).toBe(true);
    // Returning again is harmless; the same person cannot be re-sent, but someone else can.
    await w.T(w.consultant(), (c) => returnScreening(c, s.id, 'again'));
    await expect(w.T(w.client('A'), (c) => requestScreening(c, { roleId: R1, candidateRef: w.ref('R1', 'C01') }))).rejects.toBeTruthy();
    const next=await w.T(w.client('A'), (c) => requestScreening(c, { roleId: R1, candidateRef: w.ref('R1', 'C02') }));
    await w.T(w.cand('C02'),c=>respondToScreening(c,next.id,true));
    expect((await roleCounters(readCtx(w.client('A')), R1)).screeningsUsed).toBe(1);
  });
});

describe('Start my own test (fresh start)', () => {
  it('has clients with credits and 40 candidates, but no jobs, meetings, hires or screenings', async () => {
    const w = await load('FRESH');
    const count = async (t: typeof S.roles | typeof S.introductions | typeof S.hires | typeof S.screenings | typeof S.candidates) => (await db().select().from(t).where(eq((t as typeof S.roles).datasetId, w.ids.datasetId))).length;
    expect(await count(S.roles)).toBe(0);
    expect(await count(S.introductions)).toBe(0);
    expect(await count(S.hires)).toBe(0);
    expect(await count(S.screenings)).toBe(0);
    expect(await count(S.candidates)).toBe(40);
    expect((await w.wallet('A')).posted).toBe('10');
  });
});

describe('how many good fits to show', () => {
  it('the delivered list stays the same ten regardless of an old display-limit query', async () => {
    const w = await load();
    await w.T(w.client('A'), (c) => requestSimulations(c, w.ids.roles.R1));
    await drainJobs();
    const five = await bestPeople(readCtx(w.client('A')), w.ids.roles.R1, 5);
    const ten = await bestPeople(readCtx(w.client('A')), w.ids.roles.R1, 10);
    expect(five.best.length).toBeLessThanOrEqual(10);
    expect(five.best).toEqual(ten.best);
    expect(ten.best.slice(0, five.best.length).map((b) => b.dto.roleScopedReference)).toEqual(five.best.map((b) => b.dto.roleScopedReference));
    expect(five.best.length + five.rest.length).toBe(ten.best.length + ten.rest.length);
  });
});
