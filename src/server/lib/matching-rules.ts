/** Pure eligibility and ranking rules. No AI, no database. */
import { prototype } from '../../config/prototype';

export type Level = 'specific' | 'partial' | 'unknown' | 'contradictory';
export const LEVEL_VALUE: Record<Level, number> = { specific: 100, partial: 60, unknown: 30, contradictory: 0 };

export type RoleShape = { roleFamily: string; salaryPence: bigint | number | string; locationRegion: string; workMode: string; workAuthorisationRequired: boolean };
export type CandidateShape = { preferredRoleFamilies: string[]; minSalaryPence: bigint | number | string | null; region: string; workModes: string[]; workAuthorisation: string };

/**
 * Location rule (prototype):
 * - remote roles need a candidate who selected remote work;
 * - onsite/hybrid roles need the candidate to have selected that work mode and a compatible region;
 * - remote_uk candidates are compatible with remote roles only;
 * - London and Hertfordshire are mutually compatible for hybrid roles when the candidate selected hybrid;
 * - Manchester is not compatible with London onsite/hybrid. Willingness to relocate is never inferred.
 */
export function locationCompatible(role: Pick<RoleShape, 'locationRegion' | 'workMode'>, cand: Pick<CandidateShape, 'region' | 'workModes'>): boolean {
  if (role.workMode === 'remote') return cand.workModes.includes('remote');
  if (!cand.workModes.includes(role.workMode)) return false;
  if (cand.region === 'remote_uk') return false;
  if (cand.region === role.locationRegion) return true;
  const pair = new Set([cand.region, role.locationRegion]);
  if (role.workMode === 'hybrid' && pair.has('london') && pair.has('hertfordshire')) return true;
  return false;
}

export function eligibilityFor(role: RoleShape, cand: CandidateShape): { eligibility: 'eligible' | 'needs_clarification' | 'incompatible'; reason: string | null } {
  if (cand.preferredRoleFamilies.length && !cand.preferredRoleFamilies.includes(role.roleFamily)) return { eligibility: 'incompatible', reason: 'role_family_preference' };
  if (cand.minSalaryPence != null && BigInt(cand.minSalaryPence) > BigInt(role.salaryPence)) return { eligibility: 'incompatible', reason: 'salary_preference' };
  if (!locationCompatible(role, cand)) return { eligibility: 'incompatible', reason: 'location_or_work_mode' };
  if (role.workAuthorisationRequired && cand.workAuthorisation !== 'confirmed') return { eligibility: 'needs_clarification', reason: 'work_authorisation_to_discuss' };
  return { eligibility: 'eligible', reason: null };
}

export type CriterionWeight = { criterionId: string; weight: number };

const roundHalfUp = (x: number) => Math.floor(x + 0.5 + 1e-9);

export function weightedScore(criteria: CriterionWeight[], levels: Map<string, Level>): number {
  const totalW = criteria.reduce((a, c) => a + c.weight, 0);
  if (!totalW) return 0;
  return criteria.reduce((a, c) => a + LEVEL_VALUE[levels.get(c.criterionId) ?? 'unknown'] * c.weight, 0) / totalW;
}

export function coverage(criteria: CriterionWeight[], levels: Map<string, Level>): number {
  const totalW = criteria.reduce((a, c) => a + c.weight, 0);
  if (!totalW) return 0;
  const covered = criteria.filter((c) => ['specific', 'partial'].includes(levels.get(c.criterionId) ?? 'unknown')).reduce((a, c) => a + c.weight, 0);
  return covered / totalW;
}

export function confidenceFor(cov: number): 'low' | 'medium' | 'high' {
  if (cov < 0.4) return 'low';
  if (cov < 0.8) return 'medium';
  return 'high';
}

export function combinedScore(args: { criteria: CriterionWeight[]; ai: Map<string, Level>; human: Map<string, Level> | null; adjustment: number }) {
  const ai = weightedScore(args.criteria, args.ai);
  const human = args.human ? weightedScore(args.criteria, args.human) : null;
  const w = prototype.matchWeights;
  const base = human == null ? ai : (ai * w.ai + human * w.human) / (w.ai + w.human);
  const adj = Math.max(prototype.consultantAdjustmentMin, Math.min(prototype.consultantAdjustmentMax, args.adjustment));
  const score = Math.max(0, Math.min(100, roundHalfUp(base + adj)));
  return { score, aiScore: roundHalfUp(ai), humanScore: human == null ? null : roundHalfUp(human), coverage: coverage(args.criteria, args.ai) };
}

export type Rankable = { eligibility: string; score: number; coverageBps: number; publicRef: string };

export function compareMatches(a: Rankable, b: Rankable): number {
  const er = (e: string) => (e === 'eligible' ? 0 : e === 'needs_clarification' ? 1 : 2);
  return er(a.eligibility) - er(b.eligibility) || b.score - a.score || b.coverageBps - a.coverageBps || (a.publicRef < b.publicRef ? -1 : a.publicRef > b.publicRef ? 1 : 0);
}

/**
 * Provisional automatic-screening picks. Candidates must already be permitted and
 * not incompatible. If any low-confidence or needs-clarification candidate has a
 * relevant approved tag, the last slot goes to the highest-ranked such candidate
 * not already selected; the other slots fill from medium/high confidence first.
 */
export function autoPicks<T extends Rankable & { id: string; confidence: string; hasRelevantTag: boolean }>(ranked: T[], slotsLeft: number): T[] {
  if (slotsLeft <= 0) return [];
  const pool = [...ranked].filter((r) => r.eligibility !== 'incompatible').sort(compareMatches);
  const isDiscovery = (r: T) => (r.confidence === 'low' || r.eligibility === 'needs_clarification') && r.hasRelevantTag;
  const reserve = pool.some(isDiscovery) && slotsLeft > 0;
  const mainSlots = reserve ? slotsLeft - 1 : slotsLeft;
  const picks: T[] = [];
  for (const r of pool) if (picks.length < mainSlots && r.confidence !== 'low') picks.push(r);
  for (const r of pool) if (picks.length < mainSlots && !picks.includes(r)) picks.push(r);
  if (reserve) {
    const d = pool.find((r) => isDiscovery(r) && !picks.includes(r));
    if (d) picks.push(d);
    else for (const r of pool) if (picks.length < slotsLeft && !picks.includes(r)) picks.push(r);
  }
  return picks;
}
