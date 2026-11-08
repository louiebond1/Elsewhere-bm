import { describe, it, expect } from 'vitest';
import { withinReplacementWindow, withinOutsideHireWindow, addMonths, daysBetween, londonDateOf, defaultContractTerm } from '../../src/server/lib/dates';

describe('dates', () => {
  it('replacement window day 90 eligible, day 91 not, across DST', () => {
    expect(withinReplacementWindow('2026-09-01', '2026-11-30', 90)).toBe(true);
    expect(withinReplacementWindow('2026-09-01', '2026-12-01', 90)).toBe(false);
    expect(daysBetween('2026-03-01', '2026-04-01')).toBe(31);
    expect(withinReplacementWindow('2026-09-01', '2026-08-31', 90)).toBe(false);
  });
  it('outside hire window is 12 calendar months inclusive', () => {
    expect(withinOutsideHireWindow('2026-09-01', '2027-09-01', 12)).toBe(true);
    expect(withinOutsideHireWindow('2026-09-01', '2027-09-02', 12)).toBe(false);
    expect(withinOutsideHireWindow('2025-09-01', '2026-09-02', 12)).toBe(false);
    expect(addMonths('2026-01-31', 1)).toBe('2026-02-28');
  });
  it('london date', () => {
    expect(londonDateOf(new Date('2026-07-01T23:30:00Z'))).toBe('2026-07-02');
    expect(londonDateOf(new Date('2026-11-06T12:00:00Z'))).toBe('2026-11-06');
  });
  it('default contract term starts on the business date and runs one year inclusive (B4)', () => {
    expect(defaultContractTerm('2026-11-06')).toEqual({ startDate: '2026-11-06', endDate: '2027-11-05' });
    expect(defaultContractTerm('2028-02-29')).toEqual({ startDate: '2028-02-29', endDate: '2029-02-27' });
  });
});
