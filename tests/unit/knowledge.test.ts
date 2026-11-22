import { describe, it, expect } from 'vitest';
import { categoryOf, KNOWLEDGE_CATEGORIES } from '../../src/config/knowledge';
import { ONBOARDING } from '../../src/config/onboarding';
import { rankRecords, words } from '../../src/lib/knowledge-search';
import { knowledgePosition, AREA_CENTRES, AREA_SPREAD, decorativeParticles, arc, centroid } from '../../src/components/knowledge-globe/geometry';

describe('knowledge areas', () => {
  it('every checklist question lands in one of the eight areas', () => {
    const keys = new Set(KNOWLEDGE_CATEGORIES.map((c) => c.key));
    for (const s of ONBOARDING) for (const q of s.questions) expect(keys.has(categoryOf(q.key, s.key, [], null).category)).toBe(true);
    expect(categoryOf('qualifications', 'experience', [], null).category).toBe('education');
    expect(categoryOf('career_goal', 'next', [], null).category).toBe('goals');
  });
  it('extras use the candidate’s choice first, then the heading, then the detail', () => {
    expect(categoryOf('extra:1', null, ['Travel', 'Been to 14 countries'], null).category).toBe('interests');
    expect(categoryOf('extra:1', null, ['Travel'], 'values')).toEqual({ category: 'values', chosen: true });
    expect(categoryOf('extra:1', null, ['Bookkeeping', 'I did the books for a charity'], null).category).not.toBe('interests');
    expect(categoryOf('extra:1', null, ['Of course', 'Happy to help'], null).category).not.toBe('education');
    expect(categoryOf('extra:1', null, ['Something', 'Nothing matches here'], null).category).toBe('other');
    expect(categoryOf('extra:1', null, ['x'], 'not-an-area').chosen).toBe(false);
  });
});

describe('plain matching', () => {
  const recs = [
    { id: 'a', title: 'Best at', question: 'What are the three things you’re best at?', text: 'Reconciliations and Excel.' },
    { id: 'b', title: 'Current job', question: 'What is your job title?', text: 'Accounts assistant in a small team.' },
    { id: 'c', title: 'Why move now', question: 'Why are you open to a new job?', text: 'I want more variety.' },
  ];
  it('finds the record a question is about', () => {
    expect(rankRecords('What am I best at?', recs)[0].record.id).toBe('a');
    expect(rankRecords('Why do I want to move?', recs)[0]).toMatchObject({ record: { id: 'c' }, coverage: 1 });
  });
  it('a single shared word is weak coverage', () => {
    const r = rankRecords('Which football team do I support?', recs);
    expect(r.every((x) => x.coverage < 0.5)).toBe(true);
  });
  it('drops filler words and folds word endings', () => {
    expect(words('What do I do when moving?')).toEqual(['mov']);
    expect(words('move')).toEqual(['mov']);
  });
});

describe('globe geometry', () => {
  it('a dot’s position depends only on its id and area, is on the sphere and inside its area', () => {
    const p = knowledgePosition('extra:abc', 'interests');
    expect(knowledgePosition('extra:abc', 'interests')).toEqual(p);
    expect(Math.hypot(...p)).toBeCloseTo(1, 6);
    const c = AREA_CENTRES.interests;
    const angle = Math.acos(p[0] * c[0] + p[1] * c[1] + p[2] * c[2]);
    expect(angle).toBeLessThanOrEqual(AREA_SPREAD + 1e-6);
    expect(knowledgePosition('x', 'nope')).toEqual(knowledgePosition('x', 'other'));
  });
  it('decorative particles are separate and plentiful; arcs join two dots', () => {
    expect(decorativeParticles(2600, 700).count).toBe(3300);
    const a = knowledgePosition('a', 'work'), b = knowledgePosition('b', 'goals');
    const line = arc(a, b);
    expect(line[0].map((x, i) => x / 1.005 - a[i]).every((d) => Math.abs(d) < 1e-6)).toBe(true);
    expect(centroid([])).toBeNull();
  });
});
