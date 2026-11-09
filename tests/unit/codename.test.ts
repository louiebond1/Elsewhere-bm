import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { codename } from '../../src/lib/codename';

describe('made-up names for anonymous candidates', () => {
  it('are stable, look like "Word 12", and differ across references', () => {
    expect(codename('R1')).toBe(codename('R1'));
    expect(codename('R1')).toMatch(/^[A-Z][a-z]+ \d{2}$/);
    const names = new Set(Array.from({ length: 200 }, (_, i) => codename(`ref-${i}`)));
    expect(names.size).toBeGreaterThan(150);
  });
  it('never use a word from any person or organisation name in the demo data', () => {
    const seed = readFileSync('src/server/services/demo-seed.ts', 'utf8') + readFileSync('fixtures/candidates.ts', 'utf8');
    const used = new Set((seed.match(/[A-Z][a-z]{2,}/g) ?? []).map((w) => w.toLowerCase()));
    const words = new Set(Array.from({ length: 2000 }, (_, i) => codename(`x${i}`).split(' ')[0].toLowerCase()));
    for (const w of words) expect([...used].some((u) => u.startsWith(w)), w).toBe(false);
  });
});
