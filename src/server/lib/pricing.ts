/**
 * Pure pricing functions. No database, no AI. All arithmetic uses BigInt on
 * integer units (1 credit = 10,000 units) and integer pence.
 */
import { prototype, type TermsSnapshot } from '../../config/prototype';

export type ServiceMode = 'standard' | 'full_search';

export class PricingError extends Error {
  constructor(public code: string, message: string) {
    super(message);
  }
}

const SCALE = BigInt(prototype.creditScale);

export function assertSalaryPence(salaryPence: unknown): bigint {
  if (typeof salaryPence === 'bigint') {
    if (salaryPence <= 0n) throw new PricingError('INVALID_SALARY', 'Salary must be a positive amount.');
    if (salaryPence > BigInt(prototype.maxSalaryPence))
      throw new PricingError('SALARY_ABOVE_DEMO_LIMIT', 'Salary is above the prototype technical limit of £1,000,000.');
    return salaryPence;
  }
  if (typeof salaryPence !== 'number' || !Number.isFinite(salaryPence) || !Number.isInteger(salaryPence))
    throw new PricingError('INVALID_SALARY', 'Salary must be a whole number of pence.');
  return assertSalaryPence(BigInt(salaryPence));
}

/** Standard salary credits in units. Upper endpoints inclusive, lower exclusive. */
export function quoteStandardCredits(salaryPence: number | bigint, terms?: Pick<TermsSnapshot, 'salaryBands' | 'extraSalaryStepPence' | 'extraCreditStepUnits'>): bigint {
  const s = assertSalaryPence(salaryPence);
  const bands = terms?.salaryBands ?? prototype.salaryBands;
  for (const [upper, units] of bands) {
    if (s <= BigInt(upper)) return BigInt(units);
  }
  const [lastUpper, lastUnits] = bands[bands.length - 1];
  const step = BigInt(terms?.extraSalaryStepPence ?? prototype.extraSalaryStepPence);
  const extraUnits = BigInt(terms?.extraCreditStepUnits ?? prototype.extraCreditStepUnits);
  const over = s - BigInt(lastUpper);
  const steps = (over + step - 1n) / step; // ceil
  return BigInt(lastUnits) + steps * extraUnits;
}

export function roundHalfUpDiv(numerator: bigint, denominator: bigint): bigint {
  if (denominator <= 0n) throw new Error('denominator must be positive');
  if (numerator >= 0n) return (numerator * 2n + denominator) / (denominator * 2n);
  return -((-numerator * 2n + denominator) / (denominator * 2n));
}

export function priceOrder(baseUnits: bigint, serviceMode: ServiceMode, fullSearchBps: number = prototype.fullSearchBps): bigint {
  if (serviceMode === 'standard') return baseUnits;
  return roundHalfUpDiv(baseUnits * BigInt(fullSearchBps), 10000n);
}

/** Deposit is a share of the STANDARD base units, never of the full-search total. */
export function depositForPrimary(baseUnits: bigint, depositBps: number = prototype.depositBps): bigint {
  return roundHalfUpDiv(baseUnits * BigInt(depositBps), 10000n);
}

export function penceForUnits(units: bigint, ratePence: number | bigint): bigint {
  return roundHalfUpDiv(units * BigInt(ratePence), SCALE);
}

export type LedgerAllocation = { deltaUnits: bigint; deltaPence: bigint };

/**
 * Remaining for an order given its total and the debits already allocated to it.
 * Debits are negative deltas. Reversals are positive deltas on the same order.
 */
export function remainingForOrder(order: { totalUnits: bigint; ratePence: number | bigint }, allocations: LedgerAllocation[]) {
  const paidUnits = allocations.reduce((a, t) => a - t.deltaUnits, 0n);
  const paidPence = allocations.reduce((a, t) => a - t.deltaPence, 0n);
  const totalPence = penceForUnits(order.totalUnits, order.ratePence);
  const remainingUnits = order.totalUnits - paidUnits;
  const remainingPence = totalPence - paidPence;
  return {
    totalUnits: order.totalUnits,
    totalPence,
    paidUnits,
    paidPence,
    remainingUnits: remainingUnits < 0n ? 0n : remainingUnits,
    remainingPence: remainingPence < 0n ? 0n : remainingPence,
  };
}

/** Pence for a final debit so that all debits on an order sum exactly to its total. */
export function finalDebitPence(totalPence: bigint, alreadyPaidPence: bigint): bigint {
  const r = totalPence - alreadyPaidPence;
  return r < 0n ? 0n : r;
}

export function formatCredits(units: bigint | number | string): string {
  const u = BigInt(units);
  const neg = u < 0n;
  const abs = neg ? -u : u;
  const whole = abs / SCALE;
  const frac = (abs % SCALE).toString().padStart(4, '0').replace(/0+$/, '');
  return `${neg ? '-' : ''}${whole}${frac ? '.' + frac : ''}`;
}

export function formatPence(pence: bigint | number | string): string {
  const p = BigInt(pence);
  const neg = p < 0n;
  const abs = neg ? -p : p;
  const pounds = abs / 100n;
  const rem = abs % 100n;
  const poundsStr = pounds.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return `${neg ? '-' : ''}£${poundsStr}${rem === 0n ? '' : '.' + rem.toString().padStart(2, '0')}`;
}

export type QuoteBreakdown = {
  salaryPence: bigint;
  baseUnits: bigint;
  serviceMode: ServiceMode;
  totalUnits: bigint;
  depositUnits: bigint;
  ratePence: number;
  totalPence: bigint;
  depositPence: bigint;
  remainingAfterDepositUnits: bigint;
  remainingAfterDepositPence: bigint;
  comparison: { feeBps: number; feePence: bigint; percentOfFee: number; differencePence: bigint; isAbove: boolean };
};

export function quoteRole(input: {
  salaryPence: number | bigint;
  serviceMode: ServiceMode;
  ratePence: number;
  terms?: TermsSnapshot;
  comparisonFeeBps?: number;
}): QuoteBreakdown {
  const salary = assertSalaryPence(input.salaryPence);
  const baseUnits = quoteStandardCredits(salary, input.terms);
  const totalUnits = priceOrder(baseUnits, input.serviceMode, input.terms?.fullSearchBps);
  const depositUnits = depositForPrimary(baseUnits, input.terms?.depositBps);
  const totalPence = penceForUnits(totalUnits, input.ratePence);
  const depositPence = penceForUnits(depositUnits, input.ratePence);
  const feeBps = input.comparisonFeeBps ?? input.terms?.comparisonFeeBps ?? prototype.comparisonFeeBps;
  const feePence = roundHalfUpDiv(salary * BigInt(feeBps), 10000n);
  const percentOfFee = feePence === 0n ? 0 : Number(roundHalfUpDiv(totalPence * 100n, feePence));
  return {
    salaryPence: salary,
    baseUnits,
    serviceMode: input.serviceMode,
    totalUnits,
    depositUnits,
    ratePence: input.ratePence,
    totalPence,
    depositPence,
    remainingAfterDepositUnits: totalUnits - depositUnits,
    remainingAfterDepositPence: totalPence - depositPence,
    comparison: {
      feeBps,
      feePence,
      percentOfFee,
      differencePence: totalPence > feePence ? totalPence - feePence : feePence - totalPence,
      isAbove: totalPence > feePence,
    },
  };
}
