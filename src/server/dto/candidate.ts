import 'server-only';
/**
 * Explicit allow-list serializers. Never spread database rows into responses.
 * The candidate's own preview uses exactly the same anonymous serializer as clients.
 */
import { and, eq, isNull } from 'drizzle-orm';
import { candidates, candidateIdentity, profileVersions, screenings, introductions, identityGrants, roles } from '../db/schema';
import type { Ctx } from '../services/context';
import { validEvidenceForProfile } from '../services/matching';
import { roleScopedRef, roleScopedEvidenceRef } from './refs';
import { activeGrant } from '../policies/privacy';
import { criteriaFor } from '../services/roles';

const REGION: Record<string, string> = { london: 'London', hertfordshire: 'Hertfordshire', manchester: 'North West England', remote_uk: 'Remote, UK' };
const BAND: Record<string, string> = { early_career: 'Early career', established: 'Established practitioner', leadership: 'Leadership experience', unknown: 'Unknown' };

export type AnonymousMatchDTO = {
  roleScopedReference: string;
  safeHeadline: string;
  safeSummary: string;
  broadRegion: string;
  experienceBand: string;
  workModes: string[];
  safeEvidence: { id: string; claim: string; strength: string; uncertainty: string | null; criterionKeys: string[] }[];
  criteria: { key: string; label: string; level: string; humanLevel: string | null; evidenceIds: string[]; reasonSafe: string }[];
  unknowns: string[];
  confidence: string | null;
  eligibility: string | null;
  needsClarification: string | null;
  screeningStatus: string | null;
  screeningSummary: string | null;
  introState: string | null;
  permittedActionFlags: { canRequestIntro: boolean; canRequestScreening: boolean };
};

export type AcceptedCandidateDTO = AnonymousMatchDTO & { identity: { fullName: string; email: string } | null };

type MatchRow = { criterionResults: unknown; confidence: string; eligibility: string; missingEvidence: string[]; incompatibilityReason: string | null } | null;

export async function anonymousDTO(ctx: Ctx, args: { roleId: string; candidateId: string; match: MatchRow; actionFlags?: AnonymousMatchDTO['permittedActionFlags'] }): Promise<AnonymousMatchDTO> {
  const [cand] = await ctx.tx.select({ id: candidates.id, region: candidates.region, workModes: candidates.workModes, experienceBand: candidates.experienceBand, latestProfileVersionId: candidates.latestProfileVersionId }).from(candidates).where(eq(candidates.id, args.candidateId));
  const [pv] = cand?.latestProfileVersionId ? await ctx.tx.select({ headlineSafe: profileVersions.headlineSafe, summarySafe: profileVersions.summarySafe }).from(profileVersions).where(eq(profileVersions.id, cand.latestProfileVersionId)) : [];
  const evidence = cand ? await validEvidenceForProfile(ctx, cand.id, cand.latestProfileVersionId) : [];
  const crit = await criteriaFor(ctx, args.roleId);
  const results = ((args.match?.criterionResults as { criterionId: string; aiLevel: string; humanLevel: string | null; evidenceIds: string[]; reasonSafe: string }[]) ?? []);
  const validIds = new Set(evidence.map((e) => e.id));
  const evRef = (id: string) => roleScopedEvidenceRef(args.roleId, id);
  const [scr] = await ctx.tx.select({ status: screenings.status, summarySafe: screenings.summarySafe }).from(screenings).where(and(eq(screenings.roleId, args.roleId), eq(screenings.candidateId, args.candidateId)));
  const [intro] = await ctx.tx.select({ state: introductions.state }).from(introductions).where(and(eq(introductions.roleId, args.roleId), eq(introductions.candidateId, args.candidateId)));
  return {
    roleScopedReference: roleScopedRef(args.roleId, args.candidateId),
    safeHeadline: pv?.headlineSafe ?? 'Profile not yet published',
    safeSummary: pv?.summarySafe ?? '',
    broadRegion: REGION[cand?.region ?? ''] ?? 'Unknown',
    experienceBand: BAND[cand?.experienceBand ?? 'unknown'],
    workModes: cand?.workModes ?? [],
    safeEvidence: evidence.map((e) => ({ id: evRef(e.id), claim: e.safeClaim!, strength: e.strength, uncertainty: e.uncertainty, criterionKeys: crit.filter((c) => results.find((r) => r.criterionId === c.id)?.evidenceIds.includes(e.id)).map((c) => c.criterionKey) })),
    criteria: crit.map((c) => {
      const r = results.find((x) => x.criterionId === c.id);
      const ids = (r?.evidenceIds ?? []).filter((id) => validIds.has(id));
      // If evidence was withdrawn since computation, never show the old level as supported.
      const level = r && (r.aiLevel === 'unknown' || r.aiLevel === 'contradictory' || ids.length) ? r.aiLevel : 'unknown';
      return { key: c.criterionKey, label: c.label, level, humanLevel: r?.humanLevel ?? null, evidenceIds: ids.map(evRef), reasonSafe: r && level === r.aiLevel ? r.reasonSafe : `No approved evidence yet for ${c.label.toLowerCase()}.` };
    }),
    unknowns: args.match?.missingEvidence ?? [],
    confidence: args.match?.confidence ?? null,
    eligibility: args.match?.eligibility ?? null,
    needsClarification: args.match?.eligibility === 'needs_clarification' ? 'Right to work to be discussed' : null,
    screeningStatus: scr?.status ?? null,
    screeningSummary: scr?.status === 'completed' ? scr.summarySafe : null,
    introState: intro?.state ?? null,
    permittedActionFlags: args.actionFlags ?? { canRequestIntro: false, canRequestScreening: false },
  };
}

/** Adds name and email only while a valid role-specific grant exists. No phone, CV or transcript. */
export async function clientCandidateDTO(ctx: Ctx, args: { roleId: string; clientId: string; candidateId: string; match: MatchRow; actionFlags?: AnonymousMatchDTO['permittedActionFlags'] }): Promise<AcceptedCandidateDTO> {
  const base = await anonymousDTO(ctx, args);
  const g = await activeGrant(ctx, { candidateId: args.candidateId, clientId: args.clientId, roleId: args.roleId });
  if (!g) return { ...base, identity: null };
  const [id] = await ctx.tx.select({ fullName: candidateIdentity.fullName, email: candidateIdentity.email }).from(candidateIdentity).where(eq(candidateIdentity.candidateId, args.candidateId));
  return { ...base, identity: id ? { fullName: id.fullName, email: id.email } : null };
}

/** For pipelines and hires: a display label that resolves identity only under a current grant. */
export async function candidateLabelForClient(ctx: Ctx, args: { roleId: string; clientId: string; candidateId: string | null; fallbackRef: string }) {
  if (!args.candidateId) return { label: `Former candidate ${args.fallbackRef.slice(0, 8)}`, identified: false };
  const g = await activeGrant(ctx, { candidateId: args.candidateId, clientId: args.clientId, roleId: args.roleId });
  if (g) {
    const [id] = await ctx.tx.select({ fullName: candidateIdentity.fullName }).from(candidateIdentity).where(eq(candidateIdentity.candidateId, args.candidateId));
    if (id) return { label: id.fullName, identified: true };
  }
  return { label: `Candidate ${roleScopedRef(args.roleId, args.candidateId).slice(0, 9)}`, identified: false };
}

export async function anyGrantForClient(ctx: Ctx, clientId: string, candidateId: string) {
  const rows = await ctx.tx.select({ roleId: identityGrants.roleId }).from(identityGrants).innerJoin(roles, eq(roles.id, identityGrants.roleId)).where(and(eq(identityGrants.clientId, clientId), eq(identityGrants.candidateId, candidateId), isNull(identityGrants.revokedAt)));
  return rows;
}
