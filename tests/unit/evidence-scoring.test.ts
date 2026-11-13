import { describe, it, expect } from 'vitest';
import { weightedScore, coverage, combinedScore, assessmentReady, ASSESSMENT_VERSION, type Level } from '../../src/server/lib/matching-rules';
import { validateAssessment } from '../../src/server/ai/validate';
const criteria = [{ criterionId: 'driving', weight: 3 }, { criterionId: 'routes', weight: 2 }];
const levels = (entries: Record<string, Level>) => new Map(Object.entries(entries));
describe('evidence scoring', () => {
  it('a thin profile cannot earn 100 from one known requirement', () => {
    const thin = levels({ driving: 'strong', routes: 'unknown' });
    expect(weightedScore(criteria, thin)).toBe(60);
    expect(coverage(criteria, thin)).toBe(.6);
    expect(weightedScore(criteria, levels({ driving: 'clear', routes: 'clear' }))).toBe(75);
  });
  it('distinguishes missing evidence from an explicit unmet requirement', () => {
    expect(weightedScore(criteria, levels({ driving: 'unknown' }))).toBe(0);
    expect(coverage(criteria, levels({ driving: 'unknown' }))).toBe(0);
    expect(coverage(criteria, levels({ driving: 'contradictory' }))).toBe(.6);
  });
  it('retains supported criteria when screening has no information and ignores bonuses', () => {
    const ai = levels({ driving: 'strong', routes: 'partial' });
    const human = levels({ driving: 'unknown', routes: 'clear' });
    expect(combinedScore({ criteria, ai, human, adjustment: 10 }).score).toBe(90);
  });
  it('requires current approval and versioned live results', () => {
    const role = { roleVersion: 2, rubricApprovedVersion: 2 };
    const match = { roleVersion: 2, provider: 'anthropic', stale: false, assessmentVersion: `${ASSESSMENT_VERSION}:fingerprint` };
    expect(assessmentReady(match, role)).toBe(true);
    expect(assessmentReady({ ...match, provider: 'fixture' }, role)).toBe(false);
    expect(assessmentReady({ ...match, assessmentVersion: null }, role)).toBe(false);
    expect(assessmentReady({ ...match, stale: true }, role)).toBe(false);
    expect(assessmentReady(match, { ...role, rubricApprovedVersion: 1 })).toBe(false);
  });
  it('requires real quotes even for an explicit contradiction and permits shared evidence', () => {
    const source = { id: 'e1', safeClaim: 'I drive a van and plan my daily routes.' };
    const out = { criteria: criteria.map((c) => ({ criterionId: c.criterionId, level: 'clear' as const, evidenceIds: ['e1'], quote: source.safeClaim, reasonSafe: 'Direct experience.' })) };
    expect(validateAssessment(out, criteria.map(c => c.criterionId), ['e1'], [source]).ok).toBe(true);
    out.criteria[0].quote = 'invented';
    expect(validateAssessment(out, criteria.map(c => c.criterionId), ['e1'], [source]).ok).toBe(false);
    expect(validateAssessment({ criteria: [{ criterionId: 'driving', level: 'contradictory', quote: '', evidenceIds: [], reasonSafe: 'No experience mentioned.' }] }, ['driving'], ['e1'], [source]).ok).toBe(false);
  });
});
