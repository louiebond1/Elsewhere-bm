import 'server-only';
import { and, desc, eq, inArray, isNull } from 'drizzle-orm';
import { candidateBlocks, candidates, consentEvents, identityGrants, organisations, clients, profileVersions } from '../db/schema';
import type { Ctx } from '../services/context';

type Ex = Pick<Ctx, 'tx' | 'datasetId'>;

export async function orgRoot(ex: Ex, organisationId: string): Promise<string> {
  const [o] = await ex.tx.select({ id: organisations.id, groupId: organisations.groupId }).from(organisations).where(eq(organisations.id, organisationId));
  return o?.groupId ?? o?.id ?? organisationId;
}

/** True when the candidate has blocked the client's organisation, or its group when include_group is set. */
export async function isBlockedForClient(ex: Ex, candidateId: string, clientId: string): Promise<boolean> {
  const [c] = await ex.tx.select({ orgId: clients.organisationId }).from(clients).where(eq(clients.id, clientId));
  if (!c) return true;
  const blocks = await ex.tx.select().from(candidateBlocks).where(eq(candidateBlocks.candidateId, candidateId));
  if (!blocks.length) return false;
  const clientRoot = await orgRoot(ex, c.orgId);
  for (const b of blocks) {
    if (b.organisationId === c.orgId) return true;
    if (b.includeGroup && (await orgRoot(ex, b.organisationId)) === clientRoot) return true;
  }
  return false;
}

/** Bulk version for matching: returns candidate IDs blocked for this client. */
export async function blockedCandidateIdsForClient(ex: Ex, clientId: string): Promise<Set<string>> {
  const [c] = await ex.tx.select({ orgId: clients.organisationId }).from(clients).where(eq(clients.id, clientId));
  const out = new Set<string>();
  if (!c) return out;
  const orgs = await ex.tx.select({ id: organisations.id, groupId: organisations.groupId }).from(organisations).where(eq(organisations.datasetId, ex.datasetId));
  const rootOf = new Map(orgs.map((o) => [o.id, o.groupId ?? o.id]));
  const clientRoot = rootOf.get(c.orgId) ?? c.orgId;
  const blocks = await ex.tx.select().from(candidateBlocks).where(eq(candidateBlocks.datasetId, ex.datasetId));
  for (const b of blocks) {
    if (b.organisationId === c.orgId || (b.includeGroup && rootOf.get(b.organisationId) === clientRoot)) out.add(b.candidateId);
  }
  return out;
}

export async function latestConsents(ex: Ex, candidateId: string) {
  const rows = await ex.tx.select().from(consentEvents).where(eq(consentEvents.candidateId, candidateId)).orderBy(desc(consentEvents.eventAt), desc(consentEvents.createdAt));
  const out: Record<string, { granted: boolean; termsVersion: string; at: Date } | undefined> = {};
  for (const r of rows) if (!out[r.kind] && r.kind !== 'screening_recording') out[r.kind] = { granted: r.granted, termsVersion: r.termsVersion, at: r.eventAt };
  return out;
}

export type DiscoveryState = { discoverable: boolean; reasons: string[] };

/** Discoverability for new matching and new introduction requests. */
export async function discoveryState(ex: Ex, candidateId: string): Promise<DiscoveryState> {
  const [c] = await ex.tx.select().from(candidates).where(eq(candidates.id, candidateId));
  const reasons: string[] = [];
  if (!c) return { discoverable: false, reasons: ['missing'] };
  if (c.status !== 'active') reasons.push(`status_${c.status}`);
  if (!c.discoveryEnabled) reasons.push('discovery_off');
  if (!['resolved', 'not_employed'].includes(c.employerResolutionStatus)) reasons.push('employer_unresolved');
  if (!c.latestProfileVersionId) reasons.push('no_approved_profile');
  else {
    const [pv] = await ex.tx.select({ s: profileVersions.reviewState }).from(profileVersions).where(eq(profileVersions.id, c.latestProfileVersionId));
    if (pv?.s !== 'approved') reasons.push('no_approved_profile');
  }
  const cons = await latestConsents(ex, candidateId);
  if (!cons.terms?.granted) reasons.push('terms_missing');
  if (!cons.ai_processing?.granted) reasons.push('ai_consent_missing');
  return { discoverable: reasons.length === 0, reasons };
}

/** Candidates eligible for new discovery by a specific client: discoverable and not blocked. */
export async function permittedCandidateIdsForClient(ex: Ex, clientId: string): Promise<Set<string>> {
  const all = await ex.tx.select({ id: candidates.id }).from(candidates).where(and(eq(candidates.datasetId, ex.datasetId), eq(candidates.status, 'active'), eq(candidates.discoveryEnabled, true)));
  const blocked = await blockedCandidateIdsForClient(ex, clientId);
  const out = new Set<string>();
  for (const { id } of all) {
    if (blocked.has(id)) continue;
    if ((await discoveryState(ex, id)).discoverable) out.add(id);
  }
  return out;
}

/** An active role-specific identity grant, rechecked against current blocks and status. */
export async function activeGrant(ex: Ex, args: { candidateId: string; clientId: string; roleId: string }) {
  const [g] = await ex.tx.select().from(identityGrants).where(and(eq(identityGrants.candidateId, args.candidateId), eq(identityGrants.clientId, args.clientId), eq(identityGrants.roleId, args.roleId), isNull(identityGrants.revokedAt)));
  if (!g) return null;
  const [c] = await ex.tx.select({ status: candidates.status }).from(candidates).where(eq(candidates.id, args.candidateId));
  if (!c || c.status === 'deleting' || c.status === 'deleted') return null;
  if (await isBlockedForClient(ex, args.candidateId, args.clientId)) return null;
  return g;
}

/**
 * May this client see this candidate's anonymous profile on this role?
 * Either the candidate is currently discoverable and unblocked, or there is an
 * existing introduction (pending or accepted) on the role and no block or deletion.
 */
export async function clientMaySeeCandidateOnRole(ex: Ex, args: { candidateId: string; clientId: string; roleId: string; hasIntro: boolean }) {
  const [c] = await ex.tx.select({ status: candidates.status }).from(candidates).where(eq(candidates.id, args.candidateId));
  if (!c || c.status === 'deleting' || c.status === 'deleted') return false;
  if (await isBlockedForClient(ex, args.candidateId, args.clientId)) return false;
  if (args.hasIntro) return true;
  return (await discoveryState(ex, args.candidateId)).discoverable;
}

export async function grantsForCandidate(ex: Ex, candidateIds: string[]) {
  if (!candidateIds.length) return [];
  return ex.tx.select().from(identityGrants).where(and(inArray(identityGrants.candidateId, candidateIds), isNull(identityGrants.revokedAt)));
}
