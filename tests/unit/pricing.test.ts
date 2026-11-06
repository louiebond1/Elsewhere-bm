import { describe, it, expect } from 'vitest';
import { quoteStandardCredits, priceOrder, depositForPrimary, penceForUnits, remainingForOrder, formatCredits, formatPence, quoteRole, finalDebitPence, roundHalfUpDiv } from '../../src/server/lib/pricing';

const gbp = (pounds: number) => pounds * 100;

describe('salary bands', () => {
  const vectors: Array<[number, number]> = [
    [gbp(1), 5000], [gbp(30000), 5000], [gbp(35000), 5000],
    [gbp(35001), 10000], [gbp(60000), 10000],
    [gbp(60001), 15000], [gbp(85000), 15000],
    [gbp(85001), 20000], [gbp(110000), 20000],
    [gbp(110001), 25000], [gbp(135000), 25000],
    [gbp(135001), 30000], [gbp(160000), 30000],
    [gbp(160001), 35000], [gbp(185000), 35000],
    [gbp(185001), 40000],
  ];
  for (const [salary, units] of vectors) {
    it(`£${salary / 100} -> ${units / 10000} credits`, () => expect(quoteStandardCredits(salary)).toBe(BigInt(units)));
  }
  it('one penny above a boundary moves up a band', () => {
    expect(quoteStandardCredits(3500001)).toBe(10000n);
    expect(quoteStandardCredits(3500000)).toBe(5000n);
    expect(quoteStandardCredits(16000001)).toBe(35000n);
  });
  it('rejects invalid salaries', () => {
    for (const bad of [0, -1, NaN, 1.5, undefined, null, '44000'] as unknown[]) {
      expect(() => quoteStandardCredits(bad as number)).toThrow();
    }
  });
  it('rejects above the technical limit', () => {
    expect(() => quoteStandardCredits(100000001)).toThrow(/technical limit/);
    expect(quoteStandardCredits(100000000)).toBeGreaterThan(0n);
  });
  it('is monotonic', () => {
    let prev = 0n;
    for (let s = 100; s <= 100000000; s += 123457) {
      const u = quoteStandardCredits(s);
      expect(u >= prev).toBe(true);
      prev = u;
    }
  });
});

describe('order amounts', () => {
  it('standard 1 credit at pack rate', () => {
    const q = quoteRole({ salaryPence: gbp(44000), serviceMode: 'standard', ratePence: 380000 });
    expect(q.totalUnits).toBe(10000n);
    expect(q.depositUnits).toBe(2500n);
    expect(q.depositPence).toBe(95000n);
    expect(q.remainingAfterDepositUnits).toBe(7500n);
    expect(q.remainingAfterDepositPence).toBe(285000n);
    expect(q.totalPence).toBe(380000n);
    expect(q.comparison.feePence).toBe(880000n);
    expect(q.comparison.percentOfFee).toBe(43);
  });
  it('full search 1 base credit at pack rate', () => {
    const q = quoteRole({ salaryPence: gbp(44000), serviceMode: 'full_search', ratePence: 380000 });
    expect(q.totalUnits).toBe(15000n);
    expect(q.totalPence).toBe(570000n);
    expect(q.depositUnits).toBe(2500n);
    expect(q.remainingAfterDepositUnits).toBe(12500n);
    expect(q.remainingAfterDepositPence).toBe(475000n);
  });
  it('standard 0.5 credit at single rate', () => {
    const q = quoteRole({ salaryPence: gbp(30000), serviceMode: 'standard', ratePence: 450000 });
    expect(q.totalPence).toBe(225000n);
    expect(q.depositUnits).toBe(1250n);
    expect(q.depositPence).toBe(56250n);
    expect(q.remainingAfterDepositUnits).toBe(3750n);
    expect(q.remainingAfterDepositPence).toBe(168750n);
  });
  it('standard 1.5 credits at pack rate', () => {
    const q = quoteRole({ salaryPence: gbp(70000), serviceMode: 'standard', ratePence: 380000 });
    expect(q.totalPence).toBe(570000n);
    expect(q.depositUnits).toBe(3750n);
    expect(q.depositPence).toBe(142500n);
    expect(q.remainingAfterDepositUnits).toBe(11250n);
    expect(q.remainingAfterDepositPence).toBe(427500n);
  });
  it('R8 outside hire remaining', () => {
    const r = remainingForOrder({ totalUnits: 10000n, ratePence: 450000 }, [{ deltaUnits: -2500n, deltaPence: -112500n }]);
    expect(r.totalPence).toBe(450000n);
    expect(r.remainingUnits).toBe(7500n);
    expect(r.remainingPence).toBe(337500n);
  });
  it('comparison can be above a discounted fee', () => {
    const q = quoteRole({ salaryPence: gbp(44000), serviceMode: 'full_search', ratePence: 450000, comparisonFeeBps: 1000 });
    expect(q.comparison.isAbove).toBe(true);
    expect(q.comparison.differencePence).toBe(675000n - 440000n);
  });
});

describe('property checks', () => {
  it('full search equals base x 1.5 and deposit + final = total, including fractional pennies', () => {
    for (const rate of [380000, 450000, 333333, 123457]) {
      for (let s = 100000; s < 40000000; s += 777777) {
        const base = quoteStandardCredits(s);
        expect(priceOrder(base, 'full_search') * 2n).toBe(base * 3n);
        for (const mode of ['standard', 'full_search'] as const) {
          const total = priceOrder(base, mode);
          const dep = depositForPrimary(base);
          const totalPence = penceForUnits(total, rate);
          const depPence = penceForUnits(dep, rate);
          const finalPence = finalDebitPence(totalPence, depPence);
          expect(depPence + finalPence).toBe(totalPence);
          expect(total - dep >= 0n).toBe(true);
          expect(total >= 5000n).toBe(true);
        }
      }
    }
  });
  it('rounds half up', () => {
    expect(roundHalfUpDiv(5n, 2n)).toBe(3n);
    expect(roundHalfUpDiv(4n, 2n)).toBe(2n);
    expect(roundHalfUpDiv(7n, 3n)).toBe(2n);
  });
});

describe('formatting', () => {
  it('formats credits and pence', () => {
    expect(formatCredits(1250n)).toBe('0.125');
    expect(formatCredits(95000n)).toBe('9.5');
    expect(formatCredits(10000n)).toBe('1');
    expect(formatCredits(-2500n)).toBe('-0.25');
    expect(formatPence(168750n)).toBe('£1,687.50');
    expect(formatPence(380000n)).toBe('£3,800');
  });
});
