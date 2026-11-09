import { describe, it, expect } from 'vitest';
import { EMPTY, readMessage, demoReply, readyToSave, missingSlots, toCriteria, sanitise, notJobRelated, QUICK_ANSWERS, type Understanding, type Slot } from '../../src/lib/hiring';
import { criterionInput } from '../../src/server/services/inputs';

function talk(lines: string[]) {
  let u: Understanding = structuredClone(EMPTY);
  let asked: Slot | null = null;
  const replies: string[] = [];
  for (const t of lines) {
    const n = readMessage(u, t, asked);
    const r = demoReply(u, n, notJobRelated(t));
    replies.push(r.text);
    u = n;
    asked = r.asked;
  }
  return { u, replies, asked };
}

describe('hiring assistant demo reader', () => {
  it('a natural conversation reaches a saveable role with plain-language items', () => {
    const { u, replies, asked } = talk([
      'We need an assistant accountant to help with reconciliations and month-end. Ideally they know Excel.',
      'In six months they should own the month-end close without me checking every line.',
      'Good with chasing invoices too.',
      'We will teach our systems',
      'about 44k',
      'London',
      'Hybrid',
    ]);
    expect(u).toMatchObject({ title: 'Assistant Accountant', roleFamily: 'finance', salaryPounds: 44000, locationRegion: 'london', workMode: 'hybrid' });
    expect(u.mustHaves.map((i) => i.label)).toEqual(['Reconciliations', 'Month-end close', 'Credit control']);
    expect(u.niceToHaves.map((i) => i.label)).toEqual(['Excel']);
    expect(u.teachable).toEqual(['our systems']);
    expect(readyToSave(u)).toBe(true);
    expect(asked).toBeNull();
    expect(replies.at(-1)).toMatch(/That’s everything I need/);
  });

  it('asks one plain question at a time, in order', () => {
    expect(missingSlots(EMPTY)).toEqual(['title', 'outcomes', 'skills', 'teachable', 'salary', 'family', 'location', 'workMode']);
    expect(demoReply(EMPTY, EMPTY, null).text).toBe('Thanks. What is the job called?');
  });

  it('reads common salary formats', () => {
    for (const [t, v] of [['about 44k', 44000], ['£44,000', 44000], ['45,500 a year', 45500], ['52.5k', 52500], ['£60000', 60000]] as const) expect(readMessage(EMPTY, t, 'salary').salaryPounds, t).toBe(v);
  });

  it('every quick answer fills the slot it was offered for', () => {
    const slotField: Record<string, keyof Understanding> = { family: 'roleFamily', location: 'locationRegion', workMode: 'workMode' };
    for (const [slot, answers] of Object.entries(QUICK_ANSWERS)) {
      for (const a of answers!) {
        const u = readMessage(EMPTY, a, slot as Slot);
        if (slot === 'teachable') expect(u.askedTeachable, a).toBe(true);
        else expect(u[slotField[slot]], `${slot}: ${a}`).not.toBeNull();
      }
    }
    expect(readMessage(EMPTY, 'Nothing to teach', 'teachable').teachable).toEqual([]);
  });

  it('leaves out non-job-related requests but keeps the rest of the sentence', () => {
    const { u, replies } = talk(['We need a finance assistant for payroll and I want someone young']);
    expect(u.mustHaves.map((i) => i.label)).toContain('Payroll');
    expect(JSON.stringify(u)).not.toMatch(/young/i);
    expect(replies[0]).toMatch(/left out “young”/);
  });

  it('a correction overwrites the earlier value', () => {
    const { u } = talk(['Salary 40k', 'actually make it 48k']);
    expect(u.salaryPounds).toBe(48000);
  });

  it('builds 3 to 6 valid structured items for matching, must-haves first', () => {
    const u: Understanding = { ...structuredClone(EMPTY), mustHaves: [{ label: 'Reconciliations', tags: ['reconciliations'] }, { label: 'Month-end close', tags: ['month_end'] }], niceToHaves: [{ label: 'Excel', tags: ['excel'] }, { label: 'Reconciliations', tags: ['reporting'] }] };
    const c = toCriteria(u);
    expect(c.map((x) => [x.importance, x.weight])).toEqual([['essential', 5], ['essential', 4], ['desirable', 2], ['desirable', 2]]);
    expect(new Set(c.map((x) => x.key)).size).toBe(4);
    for (const x of c) expect(criterionInput.safeParse(x).success, x.key).toBe(true);
  });

  it('clamps a live model proposal to allowed values', () => {
    const prev = structuredClone(EMPTY);
    const s = sanitise({ title: 'Ops Lead', salaryPounds: 5, locationRegion: 'paris', workMode: 'hybrid', roleFamily: 'operations', outcomes: ['Fix handoffs'], mustHaves: [{ label: 'Process design', tags: ['process_design', 'made_up'] }, { label: 'Young and energetic', tags: ['learning'] }, { label: 'No tags', tags: [] }], niceToHaves: [], teachable: [] } as never, prev);
    expect(s).toMatchObject({ title: 'Ops Lead', salaryPounds: null, locationRegion: null, workMode: 'hybrid', roleFamily: 'operations' });
    expect(s.mustHaves).toEqual([{ label: 'Process design', tags: ['process_design'] }]);
  });
});
