/**
 * Prototype commercial and technical defaults.
 *
 * PROVISIONAL: every commercial value in this file is a prototype choice for
 * testing. None of it is an agreement by BondMoran. Contracts snapshot the
 * pricing values at activation, so editing this file only affects new
 * contracts and roles. Changing pricing values requires a new pricingVersion.
 */
export const prototype = Object.freeze({
  version: 'prototype-v1',
  pricingVersion: 'half-steps-v1',
  currency: 'GBP',
  /** One credit is 10,000 integer units. Never use floats for credits. */
  creditScale: 10000,
  /** PROVISIONAL: single-credit rate, £4,500. */
  singleCreditPence: 450000,
  /** PROVISIONAL: pack-credit rate, £3,800. */
  packCreditPence: 380000,
  /** PROVISIONAL: annual pack size, 10 credits. */
  packCreditsUnits: 100000,
  /** PROVISIONAL: deposit is 25% of standard salary credits, once per role. */
  depositBps: 2500,
  /** PROVISIONAL: full search is 1.5 times standard salary credits. */
  fullSearchBps: 15000,
  /** Illustrative comparison only: 20% agency fee. Label as illustrative. */
  comparisonFeeBps: 2000,
  /**
   * PROVISIONAL salary steps: [upper bound in pence (inclusive), units].
   * Lower endpoints are exclusive.
   */
  salaryBands: Object.freeze([
    [3500000, 5000],
    [6000000, 10000],
    [8500000, 15000],
    [11000000, 20000],
    [13500000, 25000],
    [16000000, 30000],
  ] as ReadonlyArray<readonly [number, number]>),
  /** PROVISIONAL: above £160,000 add 0.5 credits per started £25,000. */
  extraSalaryStepPence: 2500000,
  extraCreditStepUnits: 5000,
  /** Technical demo cap, not a commercial salary restriction. */
  maxSalaryPence: 100000000,
  /** PROVISIONAL limits per role. */
  maxAcceptedIntros: 10,
  includedScreenings: 5,
  introExpiryDays: 7,
  /** PROVISIONAL: 90 calendar days from start date, inclusive. */
  replacementWindowDays: 90,
  freeReplacementsPerPaidHire: 1,
  /** PROVISIONAL: 12 calendar months from accepted introduction, inclusive. */
  outsideHireMonths: 12,
  depositBasis: 'standard_salary_credits',
  replacementCreatesLinkedRole: true,
  replacementConsumesOpenSlot: false,
  allowClientCloseRole: true,
  reopenResetsLimits: false,
  /** Rollover is "To be agreed". No automated rollover or forfeiture. */
  automaticRollover: false,
  /** Real top-ups are disabled. Consultants can grant simulated credits. */
  realTopUps: false,
  /** Demo checkout: clients can simulate buying whole credits at their contract rate. No money is taken. */
  simulatedCheckout: true,
  /** Largest simulated purchase in one checkout, in whole credits. */
  maxSimulatedPurchaseCredits: 20,
  /** VAT treatment to be agreed. No VAT is calculated. */
  taxMode: 'not_configured',
  timezone: 'Europe/London',
  checkInMode: 'text',
  aiDefaultProvider: 'fixture',
  aiCheapModel: 'claude-haiku-5-5',
  aiReviewModel: 'claude-sonnet-5-5',
  maxCvBytes: 5242880,
  maxCvPages: 15,
  maxCvTextChars: 30000,
  maxRecordingBytes: 26214400,
  maxAnswerChars: 4000,
  maxRoleTextChars: 8000,
  /** PROVISIONAL technical limits. */
  aiConcurrency: 2,
  aiDailyTokenLimit: 200000,
  aiRequestsPerUserHour: 60,
  aiTimeoutMs: 30000,
  aiMaxRetries: 2,
  sessionHours: 12,
  matchWeights: Object.freeze({ ai: 70, human: 30 }),
  consultantAdjustmentMin: -10,
  consultantAdjustmentMax: 10,
  /** Fixed demo business clock: 6 November 2026 at 12:00 Europe/London (GMT). */
  demoBusinessNow: '2026-11-06T12:00:00Z',
  seedVersion: 'bondmoran-demo-v1',
});

export type PrototypeConfig = typeof prototype;

/** Terms snapshotted onto a contract at activation. */
export type TermsSnapshot = {
  depositBps: number;
  fullSearchBps: number;
  salaryBands: Array<[number, number]>;
  extraSalaryStepPence: number;
  extraCreditStepUnits: number;
  maxAcceptedIntros: number;
  includedScreenings: number;
  replacementWindowDays: number;
  freeReplacementsPerPaidHire: number;
  outsideHireMonths: number;
  comparisonFeeBps: number;
  currency: string;
};

export function currentTermsSnapshot(): TermsSnapshot {
  return {
    depositBps: prototype.depositBps,
    fullSearchBps: prototype.fullSearchBps,
    salaryBands: prototype.salaryBands.map(([a, b]) => [a, b] as [number, number]),
    extraSalaryStepPence: prototype.extraSalaryStepPence,
    extraCreditStepUnits: prototype.extraCreditStepUnits,
    maxAcceptedIntros: prototype.maxAcceptedIntros,
    includedScreenings: prototype.includedScreenings,
    replacementWindowDays: prototype.replacementWindowDays,
    freeReplacementsPerPaidHire: prototype.freeReplacementsPerPaidHire,
    outsideHireMonths: prototype.outsideHireMonths,
    comparisonFeeBps: prototype.comparisonFeeBps,
    currency: prototype.currency,
  };
}

/** Public, non-secret labels the browser may receive. */
export const publicConfig = Object.freeze({
  currency: prototype.currency,
  maxAcceptedIntros: prototype.maxAcceptedIntros,
  includedScreenings: prototype.includedScreenings,
  introExpiryDays: prototype.introExpiryDays,
  maxCvBytes: prototype.maxCvBytes,
  maxAnswerChars: prototype.maxAnswerChars,
  taxLabel: 'VAT treatment to be agreed',
  rolloverLabel: 'To be agreed',
});
