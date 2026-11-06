import { describe, it, expect } from 'vitest';
import { eligibilityFor, locationCompatible, combinedScore, compareMatches, autoPicks, type Level } from '../../src/server/lib/matching-rules';

const role = { roleFamily: 'finance', salaryPence: 4400000n, locationRegion: 'london', workMode: 'hybrid', workAuthorisationRequired: true };
const cand = { preferredRoleFamilies: ['finance'], minSalaryPence: 4000000n, region: 'london', workModes: ['hybrid', 'remote'], workAuthorisation: 'confirmed' };

describe('eligibility', () => {
  it('eligible baseline', () => expect(eligibilityFor(role, cand).eligibility).toBe('eligible'));
  it('salary preference above role is incompatible', () => expect(eligibilityFor(role, { ...cand, minSalaryPence: 5500000n }).eligibility).toBe('incompatible'));
  it('unknown work authorisation needs clarification, not rejection', () => expect(eligibilityFor(role, { ...cand, workAuthorisation: 'unknown' }).eligibility).toBe('needs_clarification'));
  it('location helper', () => {
    expect(locationCompatible({ locationRegion: 'london', workMode: 'hybrid' }, { region: 'hertfordshire', workModes: ['hybrid'] })).toBe(true);
    expect(locationCompatible({ locationRegion: 'london', workMode: 'onsite' }, { region: 'hertfordshire', workModes: ['onsite'] })).toBe(false);
    expect(locationCompatible({ locationRegion: 'london', workMode: 'hybrid' }, { region: 'manchester', workModes: ['hybrid', 'remote'] })).toBe(false);
    expect(locationCompatible({ locationRegion: 'london', workMode: 'remote' }, { region: 'manchester', workModes: ['remote'] })).toBe(true);
    expect(locationCompatible({ locationRegion: 'london', workMode: 'hybrid' }, { region: 'remote_uk', workModes: ['hybrid', 'remote'] })).toBe(false);
    expect(locationCompatible({ locationRegion: 'london', workMode: 'remote' }, { region: 'remote_uk', workModes: ['remote'] })).toBe(true);
  });
});

describe('scoring', () => {
  const criteria = [{ criterionId: 'a', weight: 5 }, { criterionId: 'b', weight: 3 }, { criterionId: 'c', weight: 2 }];
  const L = (o: Record<string, Level>) => new Map(Object.entries(o));
  it('AI only without screening', () => {
    const r = combinedScore({ criteria, ai: L({ a: 'specific', b: 'unknown', c: 'specific' }), human: null, adjustment: 0 });
    expect(r.score).toBe(79);
    expect(r.coverage).toBeCloseTo(0.7);
  });
  it('70/30 with screening and bounded adjustment', () => {
    const r = combinedScore({ criteria, ai: L({ a: 'specific', b: 'unknown', c: 'specific' }), human: L({ a: 'specific', b: 'specific', c: 'unknown' }), adjustment: 25 });
    // ai 79, human (500+300+60)/10 = 86 -> 0.7*79 + 0.3*86 = 81.1, +10 clamp = 91.1 -> 91
    expect(r.score).toBe(91);
  });
  it('stable tie-break', () => {
    const xs = [{ eligibility: 'eligible', score: 50, coverageBps: 5000, publicRef: 'b' }, { eligibility: 'eligible', score: 50, coverageBps: 5000, publicRef: 'a' }, { eligibility: 'needs_clarification', score: 90, coverageBps: 9000, publicRef: 'c' }];
    expect(xs.sort(compareMatches).map((x) => x.publicRef)).toEqual(['a', 'b', 'c']);
  });
  it('auto picks reserve a discovery slot', () => {
    const mk = (id: string, score: number, confidence: string, hasRelevantTag = true) => ({ id, eligibility: 'eligible', score, coverageBps: confidence === 'low' ? 3000 : 7000, publicRef: id, confidence, hasRelevantTag });
    const pool = [mk('s1', 90, 'high'), mk('s2', 85, 'medium'), mk('s3', 80, 'medium'), mk('s4', 75, 'medium'), mk('s5', 70, 'medium'), mk('low', 39, 'low'), mk('none', 30, 'low', false)];
    expect(autoPicks(pool, 5).map((p) => p.id)).toEqual(['s1', 's2', 's3', 's4', 'low']);
    expect(autoPicks(pool, 0)).toEqual([]);
    expect(autoPicks(pool.slice(5), 5).map((p) => p.id)).toEqual(['none', 'low']);
  });
});
