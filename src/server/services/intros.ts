import { and, eq, lte, sql } from 'drizzle-orm';
import { introductions, identityGrants, pipelineEntries, creditHolds, candidates, roles, hireOrders, clients, organisations, users } from '../db/schema';
import { conflict, notFound, policy, AppError } from '../lib/errors';
import { prototype } from '../../config/prototype';
import { lockCandidates, requireUser, type Ctx } from './context';
import { requireActiveContract, terms } from './contracts';
import { lockWallet, balances, insertTransaction, orderPaymentState, shortfallError } from './ledger';
import { roleForActor, primaryOrder, releaseHoldIfUnneeded, roleCounters } from './roles';
import { discoveryState, isBlockedForClient } from '../policies/privacy';
import { logActivity, notify, clientUserIds } from './audit';
import { roleScopedRef } from '../dto/refs';
import { eligibilityFor } from '../lib/matching-rules';

export async function resolveRoleRef(ctx: Ctx, roleId: string, ref: string): Promise<string> {
  const all = await ctx.tx.select({ id: candidates.id }).from(candidates).where(eq(candidates.datasetId, ctx.datasetId));
  const hit = all.find((c) => roleScopedRef(roleId, c.id) === ref);
  if (!hit) throw notFound();
  return hit.id;
}

/** Expire due pending requests for a role inside the current transaction. */
export async function expireDueForRole(ctx: Ctx, roleId: string) {
  const expired = await ctx.tx.update(introductions).set({ state: 'expired', updatedAt: new Date() }).where(and(eq(introductions.roleId, roleId), eq(introductions.state, 'pending'), lte(introductions.expiresAt, ctx.now))).returning({ id: introductions.id });
  if (expired.length) await releaseHoldIfUnneeded(ctx, roleId);
  return expired.length;
}

export async function requestIntroduction(ctx: Ctx, input: { roleId: string; candidateRef: string; message: string; idempotencyKey: string }) {
  const actor = requireUser(ctx.actor);
  if (actor.userType === 'candidate') throw notFound();
  const pre = await roleForActor(ctx, input.roleId);
  const candidateId = await resolveRoleRef(ctx, input.roleId, input.candidateRef);
  await lockCandidates(ctx.tx, [candidateId]);
  const contract = await requireActiveContract(ctx, pre.clientId, true);
  const walletId = await lockWallet(ctx, pre.clientId);
  const role = await roleForActor(ctx, input.roleId, { lock: true });
  if (role.status !== 'open') throw conflict('ROLE_NOT_OPEN', 'This role is not open.');
  await expireDueForRole(ctx, role.id);

  const ds = await discoveryState(ctx, candidateId);
  if (!ds.discoverable || (await isBlockedForClient(ctx, candidateId, role.clientId))) throw notFound();
  const [cand] = await ctx.tx.select().from(candidates).where(eq(candidates.id, candidateId));
  if (eligibilityFor(role, cand).eligibility === 'incompatible') throw notFound();

  const [existing] = await ctx.tx.select().from(introductions).where(and(eq(introductions.roleId, role.id), eq(introductions.candidateId, candidateId))).for('update');
  if (existing && (existing.state === 'pending' || existing.state === 'accepted' || existing.acceptedAt)) throw conflict('INTRO_EXISTS', 'An introduction for this candidate already exists on this role.');
  if (existing && actor.userType !== 'consultant') throw conflict('INTRO_PREVIOUSLY_CLOSED', 'This candidate did not take up an earlier request. Your consultant can re-request it if appropriate.');

  const t = terms(contract);
  const c = await roleCounters(ctx, role.id);
  if (c.accepted >= t.maxAcceptedIntros) throw conflict('INTRO_LIMIT_REACHED', `This role has used all ${t.maxAcceptedIntros} accepted introductions.`);
  if (c.accepted + c.pending >= t.maxAcceptedIntros) throw conflict('INTRO_CAPACITY_RESERVED', `This role has ${c.pending} requests awaiting a response, which reserve the remaining introductions. Cancel a pending request to free one.`, { pending: c.pending });

  const order = await primaryOrder(ctx, role.id, true);
  if (!order) throw conflict('ORDER_MISSING', 'This role has no order.');
  const pay = await orderPaymentState(ctx, order);
  const depositDue = BigInt(order.depositDueUnits);
  const expiresAt = new Date(ctx.now.getTime() + prototype.introExpiryDays * 86400000);
  if (!pay.depositPaid && depositDue > 0n) {
    const [hold] = await ctx.tx.select().from(creditHolds).where(and(eq(creditHolds.roleId, role.id), eq(creditHolds.status, 'active'))).for('update');
    if (!hold) {
      const b = await balances(ctx, walletId);
      if (b.spendable < depositDue) throw shortfallError(depositDue, b.spendable);
      await ctx.tx.insert(creditHolds).values({ datasetId: ctx.datasetId, walletId, roleId: role.id, orderId: order.id, units: depositDue, status: 'active', createdByUserId: actor.userId, expiresAt });
      await logActivity(ctx, { subjectType: 'role', subjectId: role.id, action: 'hold.created', clientId: role.clientId, metadata: { units: depositDue.toString() } });
    } else if (hold.expiresAt < expiresAt) {
      await ctx.tx.update(creditHolds).set({ expiresAt, updatedAt: new Date() }).where(eq(creditHolds.id, hold.id));
    }
  }
  let intro;
  if (existing) {
    [intro] = await ctx.tx.update(introductions).set({ state: 'pending', requestedAt: ctx.now, expiresAt, respondedAt: null, requestedByUserId: actor.userId, messageToCandidate: input.message, attemptCount: existing.attemptCount + 1, updatedAt: new Date(), rowVersion: existing.rowVersion + 1 }).where(eq(introductions.id, existing.id)).returning();
  } else {
    [intro] = await ctx.tx.insert(introductions).values({ datasetId: ctx.datasetId, roleId: role.id, candidateId, clientId: role.clientId, requestedByUserId: actor.userId, state: 'pending', messageToCandidate: input.message, requestedAt: ctx.now, expiresAt }).returning();
  }
  await notify(ctx, [cand.userId], { type: 'intro_requested', subjectRefType: 'introduction', subjectRefId: intro.id, safeTitle: 'An employer would like an introduction' });
  await logActivity(ctx, { subjectType: 'introduction', subjectId: intro.id, action: 'intro.requested', clientId: role.clientId, metadata: { roleId: role.id, attempt: intro.attemptCount } });
  return intro;
}

async function introForCandidate(ctx: Ctx, introId: string) {
  const a = requireUser(ctx.actor, 'candidate');
  const [intro] = await ctx.tx.select().from(introductions).where(and(eq(introductions.id, introId), eq(introductions.datasetId, ctx.datasetId)));
  if (!intro || intro.candidateId !== a.candidateId) throw notFound();
  return intro;
}

/** Candidate acceptance: charges the role deposit only if due, then grants identity for this role only. */
export async function acceptIntroduction(ctx: Ctx, introId: string, idempotencyKey: string) {
  const pre = await introForCandidate(ctx, introId);
  await lockCandidates(ctx.tx, [pre.candidateId]);
  await ctx.tx.execute(sql`select id from contracts where client_id = ${pre.clientId} for update`);
  const walletId = await lockWallet(ctx, pre.clientId);
  const [role] = await ctx.tx.select().from(roles).where(eq(roles.id, pre.roleId)).for('update');
  const order = await primaryOrder(ctx, role.id, true);
  const [intro] = await ctx.tx.select().from(introductions).where(eq(introductions.id, introId)).for('update');
  if (intro.state === 'accepted') return intro;
  if (intro.state !== 'pending') throw conflict('INTRO_NOT_PENDING', 'This request is no longer open.');
  if (intro.expiresAt <= ctx.now) {
    await ctx.tx.update(introductions).set({ state: 'expired', updatedAt: new Date() }).where(eq(introductions.id, intro.id));
    await releaseHoldIfUnneeded(ctx, role.id);
    throw conflict('INTRO_EXPIRED', 'This request has expired. Nothing was shared.');
  }
  if (role.status !== 'open') throw conflict('ROLE_NOT_OPEN', 'This role has closed. Nothing was shared.');
  if (await isBlockedForClient(ctx, intro.candidateId, intro.clientId)) throw conflict('INTRO_BLOCKED', 'You have hidden your profile from this employer. Nothing was shared.');
  const [cand] = await ctx.tx.select().from(candidates).where(eq(candidates.id, intro.candidateId));
  if (cand.status !== 'active' && cand.status !== 'paused') throw conflict('INTRO_BLOCKED', 'Your profile is not active.');

  const [contract] = await ctx.tx.execute(sql`select terms_snapshot from contracts where id = ${role.contractId}`).then((r) => r.rows as { terms_snapshot: { maxAcceptedIntros: number } | null }[]);
  const max = contract?.terms_snapshot?.maxAcceptedIntros ?? prototype.maxAcceptedIntros;
  const counters = await roleCounters(ctx, role.id);
  if (counters.accepted >= max) throw conflict('INTRO_LIMIT_REACHED', `This role has used all ${max} accepted introductions.`);

  if (!order) throw conflict('ORDER_MISSING', 'This role has no order.');
  const pay = await orderPaymentState(ctx, order);
  const depositDue = BigInt(order.depositDueUnits);
  if (!pay.depositPaid && depositDue > 0n) {
    const [hold] = await ctx.tx.select().from(creditHolds).where(and(eq(creditHolds.roleId, role.id), eq(creditHolds.status, 'active'))).for('update');
    const b = await balances(ctx, walletId);
    const available = b.spendable + (hold ? BigInt(hold.units) : 0n);
    if (available < depositDue) throw shortfallError(depositDue, available);
    const tx = await insertTransaction(ctx, { walletId, clientId: role.clientId, contractId: order.contractId, orderId: order.id, roleId: role.id, type: 'deposit_debit', deltaUnits: -depositDue, ratePence: order.rateSnapshotPence, idempotencyKey: `${idempotencyKey}:deposit:${order.id}`, reason: 'Role deposit charged when the first introduction was accepted' });
    if (hold) await ctx.tx.update(creditHolds).set({ status: 'consumed', consumedByTransactionId: tx.id, updatedAt: new Date() }).where(eq(creditHolds.id, hold.id));
    await ctx.tx.update(hireOrders).set({ status: 'deposit_paid', updatedAt: new Date() }).where(eq(hireOrders.id, order.id));
  }
  const [updated] = await ctx.tx.update(introductions).set({ state: 'accepted', acceptedAt: ctx.now, respondedAt: ctx.now, acceptedProfileVersionId: cand.latestProfileVersionId, updatedAt: new Date(), rowVersion: intro.rowVersion + 1 }).where(eq(introductions.id, intro.id)).returning();
  await ctx.tx.insert(identityGrants).values({ datasetId: ctx.datasetId, introductionId: intro.id, candidateId: intro.candidateId, clientId: intro.clientId, roleId: role.id, grantedAt: ctx.now }).onConflictDoUpdate({ target: identityGrants.introductionId, set: { revokedAt: null, revocationReason: null, grantedAt: ctx.now } });
  await ctx.tx.insert(pipelineEntries).values({ datasetId: ctx.datasetId, introductionId: intro.id, stage: 'introduced', updatedByUserId: cand.userId }).onConflictDoNothing();
  await notify(ctx, await clientUserIds(ctx, role.clientId), { type: 'intro_accepted', subjectRefType: 'introduction', subjectRefId: intro.id, safeTitle: `A candidate accepted your introduction for ${role.title}` });
  await logActivity(ctx, { subjectType: 'introduction', subjectId: intro.id, action: 'intro.accepted', clientId: role.clientId, metadata: { roleId: role.id } });
  return updated;
}

export async function declineIntroduction(ctx: Ctx, introId: string) {
  const pre = await introForCandidate(ctx, introId);
  await lockCandidates(ctx.tx, [pre.candidateId]);
  await lockWallet(ctx, pre.clientId);
  await ctx.tx.execute(sql`select id from roles where id = ${pre.roleId} for update`);
  const [intro] = await ctx.tx.select().from(introductions).where(eq(introductions.id, introId)).for('update');
  if (intro.state === 'declined') return intro;
  if (intro.state !== 'pending') throw conflict('INTRO_NOT_PENDING', 'This request is no longer open.');
  const [u] = await ctx.tx.update(introductions).set({ state: 'declined', respondedAt: ctx.now, updatedAt: new Date() }).where(eq(introductions.id, intro.id)).returning();
  await releaseHoldIfUnneeded(ctx, intro.roleId);
  const [role] = await ctx.tx.select({ title: roles.title, clientId: roles.clientId }).from(roles).where(eq(roles.id, intro.roleId));
  await notify(ctx, await clientUserIds(ctx, role.clientId), { type: 'intro_declined', subjectRefType: 'role', subjectRefId: intro.roleId, safeTitle: `An introduction request for ${role.title} was declined` });
  await logActivity(ctx, { subjectType: 'introduction', subjectId: intro.id, action: 'intro.declined', clientId: intro.clientId });
  return u;
}

/** Withdrawal revokes identity; accepted_at stays set so the slot and any deposit remain consumed. */
export async function withdrawIntroduction(ctx: Ctx, introId: string) {
  const pre = await introForCandidate(ctx, introId);
  await lockCandidates(ctx.tx, [pre.candidateId]);
  const [intro] = await ctx.tx.select().from(introductions).where(eq(introductions.id, introId)).for('update');
  if (intro.state === 'withdrawn') return intro;
  if (intro.state !== 'accepted') throw conflict('INTRO_NOT_ACCEPTED', 'Only an accepted introduction can be withdrawn.');
  const [u] = await ctx.tx.update(introductions).set({ state: 'withdrawn', withdrawnAt: ctx.now, updatedAt: new Date() }).where(eq(introductions.id, intro.id)).returning();
  await ctx.tx.update(identityGrants).set({ revokedAt: ctx.now, revocationReason: 'candidate_withdrew', updatedAt: new Date() }).where(eq(identityGrants.introductionId, intro.id));
  await ctx.tx.update(pipelineEntries).set({ stage: 'withdrawn', updatedAt: new Date() }).where(eq(pipelineEntries.introductionId, intro.id));
  const [role] = await ctx.tx.select({ title: roles.title }).from(roles).where(eq(roles.id, intro.roleId));
  await notify(ctx, await clientUserIds(ctx, intro.clientId), { type: 'system', subjectRefType: 'role', subjectRefId: intro.roleId, safeTitle: `A candidate withdrew from ${role.title}` });
  await logActivity(ctx, { subjectType: 'introduction', subjectId: intro.id, action: 'intro.withdrawn', clientId: intro.clientId });
  return u;
}

/** Client or consultant cancels a pending request, freeing capacity and any unneeded hold. */
export async function cancelIntroduction(ctx: Ctx, introId: string) {
  const a = requireUser(ctx.actor);
  if (a.userType === 'candidate') throw notFound();
  const [pre] = await ctx.tx.select().from(introductions).where(and(eq(introductions.id, introId), eq(introductions.datasetId, ctx.datasetId)));
  if (!pre || (a.userType === 'client' && pre.clientId !== a.clientId)) throw notFound();
  await lockCandidates(ctx.tx, [pre.candidateId]);
  await lockWallet(ctx, pre.clientId);
  const [intro] = await ctx.tx.select().from(introductions).where(eq(introductions.id, introId)).for('update');
  if (intro.state !== 'pending') throw conflict('INTRO_NOT_PENDING', 'Only a pending request can be cancelled.');
  const [u] = await ctx.tx.update(introductions).set({ state: 'cancelled', respondedAt: ctx.now, updatedAt: new Date() }).where(eq(introductions.id, introId)).returning();
  await releaseHoldIfUnneeded(ctx, intro.roleId);
  await logActivity(ctx, { subjectType: 'introduction', subjectId: intro.id, action: 'intro.cancelled', clientId: intro.clientId });
  return u;
}

/** Candidate view of a request: real employer, role, salary and exact disclosure. Never the client's balance. */
export async function candidateIntroductions(ctx: Ctx) {
  const a = requireUser(ctx.actor, 'candidate');
  const rows = await ctx.tx
    .select({ intro: introductions, role: { id: roles.id, title: roles.title, salaryPence: roles.salaryPence, workMode: roles.workMode, locationRegion: roles.locationRegion }, org: { displayName: organisations.displayName }, consultant: { displayName: users.displayName } })
    .from(introductions)
    .innerJoin(roles, eq(roles.id, introductions.roleId))
    .innerJoin(clients, eq(clients.id, introductions.clientId))
    .innerJoin(organisations, eq(organisations.id, clients.organisationId))
    .innerJoin(users, eq(users.id, clients.consultantUserId))
    .where(eq(introductions.candidateId, a.candidateId!));
  return rows.map((r) => ({
    id: r.intro.id,
    state: r.intro.state === 'pending' && r.intro.expiresAt <= ctx.now ? 'expired' : r.intro.state,
    employer: r.org.displayName,
    roleTitle: r.role.title,
    salaryPence: r.role.salaryPence.toString(),
    workMode: r.role.workMode,
    location: r.role.locationRegion,
    serviceContact: r.consultant.displayName,
    message: r.intro.messageToCandidate,
    requestedAt: r.intro.requestedAt.toISOString(),
    expiresAt: r.intro.expiresAt.toISOString(),
    acceptedAt: r.intro.acceptedAt?.toISOString() ?? null,
    disclosure: ['Your full name', 'Your email address', 'Your approved Elsewhere profile for this role'],
    notShared: ['Your CV file', 'Your full conversation', 'Your phone number'],
  }));
}

export { AppError, policy };
