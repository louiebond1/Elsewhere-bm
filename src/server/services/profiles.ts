import { and, eq, inArray, desc } from 'drizzle-orm';
import { createHash } from 'node:crypto';
import { candidates, evidenceItems, profileVersions } from '../db/schema';
import { fixtureProvider } from '../ai/providers/fixture';
import { recomputeCandidate } from './matching';
import type { Ctx } from './context';

const TAG_LABEL = (t: string) => t.replace(/_/g, ' ');

export async function currentValidEvidence(ctx: Pick<Ctx, 'tx'>, candidateId: string) {
  const ev = await ctx.tx.select().from(evidenceItems).where(and(eq(evidenceItems.candidateId, candidateId), inArray(evidenceItems.reviewState, ['candidate_approved', 'consultant_verified'])));
  return ev.filter((e) => e.anonymityReview === 'approved' && !!e.safeClaim);
}

/**
 * Builds a new approved profile version when the set of valid evidence changed.
 * Profile text derives only from approved safe claims; no new claims are introduced.
 * If nothing valid remains, the candidate has no published profile and is undiscoverable.
 */
export async function rebuildProfile(ctx: Ctx, candidateId: string, opts: { headline?: string; summary?: string } = {}) {
  const [cand] = await ctx.tx.select().from(candidates).where(eq(candidates.id, candidateId)).for('update');
  if (!cand) return null;
  const ev = (await currentValidEvidence(ctx, candidateId)).sort((a, b) => (a.createdAt < b.createdAt ? -1 : a.createdAt > b.createdAt ? 1 : a.id < b.id ? -1 : 1));
  const [latest] = await ctx.tx.select().from(profileVersions).where(eq(profileVersions.candidateId, candidateId)).orderBy(desc(profileVersions.versionNumber)).limit(1);
  if (!ev.length) {
    if (cand.latestProfileVersionId) {
      await ctx.tx.update(profileVersions).set({ reviewState: 'superseded', updatedAt: new Date() }).where(eq(profileVersions.id, cand.latestProfileVersionId));
      await ctx.tx.update(candidates).set({ latestProfileVersionId: null, updatedAt: new Date() }).where(eq(candidates.id, candidateId));
      await recomputeCandidate(ctx, candidateId);
    }
    return null;
  }
  const tags = [...new Set(ev.flatMap((e) => e.tags))].slice(0, 3);
  const headline = (opts.headline ?? (latest && cand.latestProfileVersionId ? latest.headlineSafe : `Evidence covering ${tags.map(TAG_LABEL).join(', ')}`)).slice(0, 100);
  const summary = (opts.summary ?? ev.map((e) => e.safeClaim).join(' ')).slice(0, 600);
  const prefs = { region: cand.region, workModes: cand.workModes, minSalaryPence: cand.minSalaryPence?.toString() ?? null, noticeWeeks: cand.noticeWeeks };
  const fb = await fixtureProvider.feedback({ evidence: ev.map((e) => ({ id: e.id, safeClaim: e.safeClaim!, tags: e.tags, strength: e.strength })) });
  const hash = createHash('sha256').update(JSON.stringify({ ids: ev.map((e) => e.id), headline, summary, prefs })).digest('hex');
  if (latest && latest.profileHash === hash && cand.latestProfileVersionId === latest.id) return latest;
  if (cand.latestProfileVersionId) await ctx.tx.update(profileVersions).set({ reviewState: 'superseded', updatedAt: new Date() }).where(eq(profileVersions.id, cand.latestProfileVersionId));
  const [pv] = await ctx.tx.insert(profileVersions).values({
    datasetId: ctx.datasetId, candidateId, versionNumber: (latest?.versionNumber ?? 0) + 1, headlineSafe: headline, summarySafe: summary, preferencesSnapshot: prefs,
    evidenceIds: ev.map((e) => e.id), feedback: { strengths: fb.output.strengths, gaps: fb.output.gaps, suggestedQuestionIds: [], nextQuestion: fb.output.nextQuestion, provider: 'fixture' },
    reviewState: 'approved', approvalAt: ctx.now, profileHash: hash,
  }).returning();
  await ctx.tx.update(candidates).set({ latestProfileVersionId: pv.id, updatedAt: new Date() }).where(eq(candidates.id, candidateId));
  await recomputeCandidate(ctx, candidateId);
  return pv;
}
