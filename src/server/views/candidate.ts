import 'server-only';
import { and, desc, eq, inArray, ne } from 'drizzle-orm';
import * as S from '../db/schema';
import type { Ctx } from '../services/context';
import { candidateSelf } from '../services/candidates';
import { discoveryState, latestConsents } from '../policies/privacy';
import { latestCv } from '../services/files';
import { anonymousDTO } from '../dto/candidate';

export async function candidateOverview(ctx: Ctx) {
  const self = await candidateSelf(ctx);
  const ds = await discoveryState(ctx, self.candidate.id);
  const consents = await latestConsents(ctx, self.candidate.id);
  const cv = await latestCv(ctx, self.candidate.id);
  const convs = await ctx.tx.select().from(S.conversations).where(eq(S.conversations.candidateId, self.candidate.id)).orderBy(desc(S.conversations.createdAt));
  const blocks = await ctx.tx.select({ id: S.candidateBlocks.organisationId, name: S.organisations.displayName, reason: S.candidateBlocks.reason, includeGroup: S.candidateBlocks.includeGroup }).from(S.candidateBlocks).innerJoin(S.organisations, eq(S.organisations.id, S.candidateBlocks.organisationId)).where(eq(S.candidateBlocks.candidateId, self.candidate.id));
  const pending = await ctx.tx.select({ id: S.introductions.id }).from(S.introductions).where(and(eq(S.introductions.candidateId, self.candidate.id), eq(S.introductions.state, 'pending')));
  const jobs = await ctx.tx.select().from(S.jobs).where(and(eq(S.jobs.subjectId, self.candidate.id), eq(S.jobs.kind, 'build_profile'))).orderBy(desc(S.jobs.createdAt)).limit(1);
  const drafts = self.evidence.filter((e) => e.reviewState === 'draft');
  const awaitingReview = self.evidence.filter((e) => (e.reviewState === 'candidate_approved' || e.reviewState === 'consultant_verified') && e.anonymityReview === 'pending');
  return { ...self, discovery: ds, consents, cv, conversations: convs, blocks, pendingIntros: pending.length, profileJob: jobs[0] ?? null, drafts, awaitingReview };
}

/** The candidate's preview uses exactly the same serializer as client views, for one of their matched roles. */
export async function anonymousPreview(ctx: Ctx, candidateId: string) {
  const [m] = await ctx.tx.select().from(S.matches).where(and(eq(S.matches.candidateId, candidateId), ne(S.matches.eligibility, 'incompatible'))).orderBy(desc(S.matches.score)).limit(1);
  if (!m) return null;
  const [role] = await ctx.tx.select({ title: S.roles.title }).from(S.roles).where(eq(S.roles.id, m.roleId));
  return { roleTitle: role.title, dto: await anonymousDTO(ctx, { roleId: m.roleId, candidateId, match: m }) };
}

export async function evidenceSources(ctx: Ctx, candidateId: string, evIds: string[]) {
  if (!evIds.length) return new Map<string, string>();
  const ev = await ctx.tx.select({ id: S.evidenceItems.id, a: S.evidenceItems.sourceAnswerId, f: S.evidenceItems.sourceFileId, k: S.evidenceItems.sourceKind }).from(S.evidenceItems).where(and(eq(S.evidenceItems.candidateId, candidateId), inArray(S.evidenceItems.id, evIds)));
  const ans = await ctx.tx.select({ id: S.checkInAnswers.id, q: S.checkInQuestions.questionText }).from(S.checkInAnswers).innerJoin(S.checkInQuestions, eq(S.checkInQuestions.id, S.checkInAnswers.questionId)).where(eq(S.checkInAnswers.candidateId, candidateId));
  const out = new Map<string, string>();
  for (const e of ev) out.set(e.id, e.k === 'answer' ? `Your answer to: ${ans.find((a) => a.id === e.a)?.q ?? 'a question'}` : e.k === 'cv' ? 'Your CV' : e.k === 'candidate_edit' ? 'Your edit' : 'Screening');
  return out;
}
