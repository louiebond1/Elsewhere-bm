import 'server-only';
import { and, desc, eq, inArray, sql, ne, isNotNull } from 'drizzle-orm';
import * as S from '../db/schema';
import type { Ctx } from '../services/context';
import { walletView } from './client';
import { roleScopedRef } from '../dto/refs';

export async function workQueue(ctx: Ctx) {
  const ds = ctx.datasetId;
  const scr = await ctx.tx.select({ s: S.screenings, title: S.roles.title, name: S.candidateIdentity.fullName }).from(S.screenings).innerJoin(S.roles, eq(S.roles.id, S.screenings.roleId)).leftJoin(S.candidateIdentity, eq(S.candidateIdentity.candidateId, S.screenings.candidateId)).where(and(eq(S.screenings.datasetId, ds), inArray(S.screenings.status, ['requested', 'scheduled'])));
  const review = await ctx.tx.select({ e: S.evidenceItems, name: S.candidateIdentity.fullName, ref: S.candidates.publicRef }).from(S.evidenceItems).innerJoin(S.candidates, eq(S.candidates.id, S.evidenceItems.candidateId)).leftJoin(S.candidateIdentity, eq(S.candidateIdentity.candidateId, S.candidates.id)).where(and(eq(S.evidenceItems.datasetId, ds), eq(S.evidenceItems.anonymityReview, 'pending'), inArray(S.evidenceItems.reviewState, ['candidate_approved', 'consultant_verified'])));
  const unresolved = await ctx.tx.select({ id: S.candidates.id, ref: S.candidates.publicRef, label: S.candidateIdentity.currentEmployerLabel, name: S.candidateIdentity.fullName }).from(S.candidates).leftJoin(S.candidateIdentity, eq(S.candidateIdentity.candidateId, S.candidates.id)).where(and(eq(S.candidates.datasetId, ds), eq(S.candidates.employerResolutionStatus, 'unresolved')));
  const drafts = await ctx.tx.select({ id: S.contracts.id, clientId: S.contracts.clientId, name: S.organisations.displayName }).from(S.contracts).innerJoin(S.clients, eq(S.clients.id, S.contracts.clientId)).innerJoin(S.organisations, eq(S.organisations.id, S.clients.organisationId)).where(and(eq(S.contracts.datasetId, ds), eq(S.contracts.status, 'draft')));
  const soon = new Date(ctx.now.getTime() + 2 * 86400000);
  const expiring = await ctx.tx.select({ i: S.introductions, title: S.roles.title }).from(S.introductions).innerJoin(S.roles, eq(S.roles.id, S.introductions.roleId)).where(and(eq(S.introductions.datasetId, ds), eq(S.introductions.state, 'pending'), sql`${S.introductions.expiresAt} <= ${soon.toISOString()}::timestamptz`));
  const repl = await ctx.tx.select().from(S.replacementCases).where(and(eq(S.replacementCases.datasetId, ds), eq(S.replacementCases.status, 'requested')));
  const failed = await ctx.tx.select().from(S.jobs).where(and(eq(S.jobs.datasetId, ds), eq(S.jobs.status, 'failed')));
  const minutes = await ctx.tx.execute(sql`select coalesce(sum(minutes),0)::int as m from work_logs where dataset_id = ${ds}`);
  const activeRoles = await ctx.tx.execute(sql`select count(*)::int as n from roles where dataset_id = ${ds} and status = 'open'`);
  const consumed = await ctx.tx.execute(sql`select coalesce(-sum(delta_units),0)::bigint as u from credit_transactions where dataset_id = ${ds} and type <> 'grant'`);
  return { scr, review, unresolved, drafts, expiring, repl, failed, minutes: (minutes.rows[0] as { m: number }).m, activeRoles: (activeRoles.rows[0] as { n: number }).n, consumedUnits: String((consumed.rows[0] as { u: string }).u) };
}

export async function clientsList(ctx: Ctx) {
  const rows = await ctx.tx.select({ c: S.clients, name: S.organisations.displayName, consultant: S.users.displayName }).from(S.clients).innerJoin(S.organisations, eq(S.organisations.id, S.clients.organisationId)).innerJoin(S.users, eq(S.users.id, S.clients.consultantUserId)).where(eq(S.clients.datasetId, ctx.datasetId)).orderBy(S.organisations.displayName);
  const out = [];
  for (const r of rows) out.push({ ...r, wallet: await walletView(ctx, r.c.id) });
  return out;
}

export async function candidatesList(ctx: Ctx, q: string) {
  const rows = await ctx.tx.select({ c: S.candidates, name: S.candidateIdentity.fullName }).from(S.candidates).leftJoin(S.candidateIdentity, eq(S.candidateIdentity.candidateId, S.candidates.id)).where(eq(S.candidates.datasetId, ctx.datasetId)).orderBy(S.candidates.publicRef);
  const pend = await ctx.tx.select({ c: S.evidenceItems.candidateId }).from(S.evidenceItems).where(and(eq(S.evidenceItems.datasetId, ctx.datasetId), eq(S.evidenceItems.anonymityReview, 'pending'), ne(S.evidenceItems.reviewState, 'superseded'), ne(S.evidenceItems.reviewState, 'rejected')));
  const pendSet = new Set(pend.map((p) => p.c));
  const ql = q.toLowerCase();
  return rows.filter((r) => !ql || `${r.name ?? ''} ${r.c.publicRef} ${r.c.preferredRoleFamilies.join(' ')}`.toLowerCase().includes(ql)).map((r) => ({ ...r, pendingReview: pendSet.has(r.c.id) }));
}

export async function candidateRecord(ctx: Ctx, id: string) {
  const [c] = await ctx.tx.select().from(S.candidates).where(and(eq(S.candidates.id, id), eq(S.candidates.datasetId, ctx.datasetId)));
  if (!c) return null;
  const [idn] = await ctx.tx.select().from(S.candidateIdentity).where(eq(S.candidateIdentity.candidateId, id));
  const ev = await ctx.tx.select().from(S.evidenceItems).where(eq(S.evidenceItems.candidateId, id)).orderBy(S.evidenceItems.createdAt);
  const answers = await ctx.tx.select({ a: S.checkInAnswers, q: S.checkInQuestions.questionText }).from(S.checkInAnswers).innerJoin(S.checkInQuestions, eq(S.checkInQuestions.id, S.checkInAnswers.questionId)).where(and(eq(S.checkInAnswers.candidateId, id), eq(S.checkInAnswers.status, 'submitted')));
  const fls = await ctx.tx.select().from(S.files).where(and(eq(S.files.candidateId, id), ne(S.files.uploadState, 'deleted')));
  const blocks = await ctx.tx.select({ name: S.organisations.displayName, reason: S.candidateBlocks.reason }).from(S.candidateBlocks).innerJoin(S.organisations, eq(S.organisations.id, S.candidateBlocks.organisationId)).where(eq(S.candidateBlocks.candidateId, id));
  const intros = await ctx.tx.select({ i: S.introductions, title: S.roles.title, client: S.organisations.displayName }).from(S.introductions).innerJoin(S.roles, eq(S.roles.id, S.introductions.roleId)).innerJoin(S.clients, eq(S.clients.id, S.introductions.clientId)).innerJoin(S.organisations, eq(S.organisations.id, S.clients.organisationId)).where(eq(S.introductions.candidateId, id));
  const orgs = await ctx.tx.select({ id: S.organisations.id, name: S.organisations.displayName }).from(S.organisations).where(eq(S.organisations.datasetId, ctx.datasetId));
  return { c, idn: idn ?? null, ev, answers, files: fls, blocks, intros, orgs };
}

export async function outsideHireOptions(ctx: Ctx, clientId: string | null) {
  if (!clientId) return [];
  const rows = await ctx.tx.select({ i: S.introductions, title: S.roles.title, key: S.roles.vacancyKey, name: S.candidateIdentity.fullName, ref: S.candidates.publicRef, status: S.candidates.status }).from(S.introductions).innerJoin(S.roles, eq(S.roles.id, S.introductions.roleId)).innerJoin(S.candidates, eq(S.candidates.id, S.introductions.candidateId)).leftJoin(S.candidateIdentity, eq(S.candidateIdentity.candidateId, S.candidates.id)).where(and(eq(S.introductions.clientId, clientId), isNotNull(S.introductions.acceptedAt)));
  const out = [];
  for (const r of rows) {
    const [hire] = await ctx.tx.select({ id: S.hires.id }).from(S.hires).where(eq(S.hires.introductionId, r.i.id));
    out.push({ introId: r.i.id, role: `${r.title} (${r.key})`, name: r.name ?? 'Deleted profile', ref: r.ref, acceptedAt: r.i.acceptedAt!.toISOString(), state: r.i.state, hired: !!hire, deleted: r.status === 'deleting' || r.status === 'deleted', scoped: roleScopedRef(r.i.roleId, r.i.candidateId) });
  }
  return out;
}

export { desc };
