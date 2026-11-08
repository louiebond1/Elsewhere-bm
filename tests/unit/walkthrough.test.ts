import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { SECTIONS, COVERAGE, COMMERCIAL_BASIS, COVERAGE_SOURCE } from '../../src/config/walkthrough';
import { prototype } from '../../src/config/prototype';

const root = join(__dirname, '../..');
/** Resolves a static path to its page file, allowing the (app) route group under /candidate. */
function pageExists(path: string) {
  const segs = path.replace(/^\//, '').split('/');
  const direct = join(root, 'app', ...segs, 'page.tsx');
  const grouped = segs[0] === 'candidate' ? join(root, 'app', 'candidate', '(app)', ...segs.slice(1), 'page.tsx') : '';
  return existsSync(direct) || (!!grouped && existsSync(grouped));
}
const steps = SECTIONS.flatMap((s) => s.steps);

describe('guided walkthrough content', () => {
  it('covers consultant, candidate and client and every required topic', () => {
    expect(new Set(steps.map((s) => s.who))).toEqual(new Set(['Facilitator', 'Consultant', 'Candidate', 'Client']));
    expect(SECTIONS.map((s) => s.id)).toEqual(['setup', 'evidence', 'matching', 'intro', 'hire', 'screening']);
  });
  it('every linked screen is an existing static page', () => {
    for (const s of steps) if (s.path) expect(pageExists(s.path), s.path).toBe(true);
  });
  it('the hire section is labelled NOT RUN END-TO-END', () => {
    expect(SECTIONS.find((s) => s.id === 'hire')!.warning).toMatch(/^NOT RUN END-TO-END/);
  });
  it('commercial figures match the provisional config and are labelled as assumptions', () => {
    expect(COMMERCIAL_BASIS).toContain(`£${(prototype.packCreditPence / 100).toLocaleString('en-GB')}`);
    expect(COMMERCIAL_BASIS).toContain(`£${(prototype.singleCreditPence / 100).toLocaleString('en-GB')}`);
    expect(COMMERCIAL_BASIS).toContain(`deposit ${prototype.depositBps / 100}%`);
    expect(COMMERCIAL_BASIS).toMatch(/not agreed or signed-off/);
  });
  it('coverage never claims everything is met and names its source', () => {
    expect(COVERAGE_SOURCE).toMatch(/does not claim that all criteria are met/);
    expect(COVERAGE.some((c) => c.status.includes('not tested'))).toBe(true);
    for (const c of COVERAGE) expect(c.status.length).toBeGreaterThan(0);
    expect(COVERAGE.map((c) => c.ref).join(' ')).toMatch(/§1\.2.*§1\.3.*§10\.7|§10\.6/);
  });
  it('the guide page has no buttons, forms or API calls and checks the gate', () => {
    const src = readFileSync(join(root, 'app/demo/guide/page.tsx'), 'utf8');
    expect(src).toContain('gateOk()');
    for (const bad of ['<button', '<form', 'ActionButton', 'useCommand', "api(", 'fetch(', "'use client'"]) expect(src, bad).not.toContain(bad);
  });
});
