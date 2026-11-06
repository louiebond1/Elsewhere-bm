import { and, eq, inArray, ne, sql, gte } from 'drizzle-orm';
import { roles, roleCriteria, hireOrders, introductions, creditHolds, screenings, hires, matches, contracts, clients } from '../db/schema';
import { AppError, conflict, invalid, notFound, policy } from '../lib/errors';
import { quoteStandardCredits, priceOrder, depositForPrimary, penceForUnits, formatCredits, formatPence, type ServiceMode } from '../lib/pricing';
import { prototype } from '../../config/prototype';
import { requireActiveContract, terms, businessDate, contractCurrentlyActive } from './contracts';
import { lockWallet, balances, insertTransaction, orderPaymentState, shortfallError, getWallet } from './ledger';
import { logActivity } from './audit';
import { requireUser, type Ctx } from './context';
import { roleDraftInput, roleUpdateInput, type RoleDraftInput } from './inputs';
import type { z } from 'zod';

export type Role = typeof roles.$inferSelect;
export type Order = typeof hireOrders.$inferSelect;

/** Resolves the client a request acts for. Clients are derived from membership, never from input. */
export function actingClientId(ctx: Ctx, requested?: string | null): string {
  const a = requireUser(ctx.actor);
  if (a.userType === 'client') {
    if (!a.clientId) throw new AppError('FORBIDDEN', 403, 'You do not have access to this area.');
    return a.clientId;
  }
  if (a.userType === 'consultant') {
    if (!requested) throw invalid('Choose a client.');
    return requested;
  }
  throw new AppError('FORBIDDEN', 403, 'You do not have access to this area.');
}

/** Loads a role the actor may act on. Foreign or unknown IDs are indistinguishable 404s. */
export async function roleForActor(ctx: Ctx, roleId: string, opts: { lock?: boolean } = {}): Promise<Role> {
  const a = requireUser(ctx.actor);
  if (a.userType === 'candidate') throw notFound();
  const q = ctx.tx.select().from(roles).where(and(eq(roles.id, roleId), eq(roles.datasetId, ctx.datasetId)));
  const [r] = opts.lock ? await q.for('update') : await q;
  if (!r) throw notFound();
  if (a.userType === 'client' && r.clientId !== a.clientId) throw notFound();
  return r;
}

export async function primaryOrder(ctx: Ctx, roleId: string, lock = false): Promise<Order | null> {
  const q = ctx.tx.select().from(hireOrders).where(and(eq(hireOrders.roleId, roleId), eq(hireOrders.orderNumber, 1)));
  const [o] = lock ? await q.for('update') : await q;
  return o ?? null;
}

export async function criteriaFor(ctx: Ctx, roleId: string) {
  return ctx.tx.select().from(roleCriteria).where(eq(roleCriteria.roleId, roleId)).orderBy(roleCriteria.ordinal);
}

function validateCriteria(criteria: RoleDraftInput['criteria']) {
  const keys = new Set<string>();
  for (const c of criteria) {
    if (keys.has(c.key)) throw invalid('Each criterion needs a distinct key.', { criteria: 'Duplicate criterion key' });
    keys.add(c.key);
  }
}

async function replaceCriteria(ctx: Ctx, roleId: string, criteria: RoleDraftInput['criteria']) {
  validateCriteria(criteria);
  await ctx.tx.delete(roleCriteria).where(eq(roleCriteria.roleId, roleId));
  if (criteria.length)
    await ctx.tx.insert(roleCriteria).values(criteria.map((c, i) => ({ datasetId: ctx.datasetId, roleId, criterionKey: c.key, label: c.label, description: c.description || c.label, importance: c.importance, weight: c.weight, evidenceTags: c.evidenceTags, ordinal: i + 1 })));
}

const normTitle = (t: string) => t.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

export async function createDraftRole(ctx: Ctx, raw: unknown) {
  const input = roleDraftInput.parse(raw);
  const clientId = actingClientId(ctx, input.clientId);
  const [client] = await ctx.tx.select().from(clients).where(and(eq(clients.id, clientId), eq(clients.datasetId, ctx.datasetId)));
  if (!client) throw notFound();
  const contract = await requireActiveContract(ctx, clientId, false);
  const [dup] = await ctx.tx.select({ id: roles.id }).from(roles).where(and(eq(roles.clientId, clientId), eq(roles.vacancyKey, input.vacancyKey)));
  if (dup) throw conflict('DUPLICATE_VACANCY', 'This vacancy reference already exists. Open the existing role instead.', { existingRoleId: dup.id });
  const salaryPence = BigInt(input.salaryPounds) * 100n;
  const [role] = await ctx.tx.insert(roles).values({
    datasetId: ctx.datasetId,
    clientId,
    contractId: contract.id,
    vacancyKey: input.vacancyKey,
    title: input.title,
    roleFamily: input.roleFamily,
    locationRegion: input.locationRegion,
    workMode: input.workMode,
    salaryPence,
    workAuthorisationRequired: input.workAuthorisationRequired,
    briefText: input.briefText,
    outcomes: input.outcomes,
    teachableSkills: input.teachableSkills,
    status: 'draft',
    assignedConsultantId: client.consultantUserId,
    defaultServiceMode: input.serviceMode,
    createdByUserId: (ctx.actor as { userId: string }).userId,
  }).returning();
  await replaceCriteria(ctx, role.id, input.criteria);
  await logActivity(ctx, { subjectType: 'role', subjectId: role.id, action: 'role.draft_created', clientId });
  return role;
}

export async function updateRoleBrief(ctx: Ctx, roleId: string, raw: unknown) {
  const input = roleUpdateInput.parse(raw);
  const role = await roleForActor(ctx, roleId, { lock: true });
  if (role.rowVersion !== input.expectedRowVersion) throw conflict('STALE_VERSION', 'This changed in another session. Refresh to review the latest position.');
  const patch: Partial<typeof roles.$inferInsert> = { updatedAt: new Date(), rowVersion: role.rowVersion + 1 };
  if (role.status !== 'draft') {
    if (input.salaryPounds !== undefined && BigInt(input.salaryPounds) * 100n !== BigInt(role.salaryPence))
      throw policy('SALARY_LOCKED', 'The charge salary is locked once a role is active. Ask BondMoran to review the pricing.');
    if (input.serviceMode !== undefined && input.serviceMode !== role.defaultServiceMode) throw policy('USE_UPGRADE', 'Use Request full search to change the service.');
    if (input.vacancyKey !== undefined && input.vacancyKey !== role.vacancyKey) throw policy('VACANCY_LOCKED', 'The vacancy reference is locked once a role is active.');
    if (input.criteria !== undefined && (input.criteria.length < 3 || input.criteria.length > 6)) throw invalid('An active role needs 3 to 6 criteria.', { criteria: 'Use 3 to 6 criteria' });
    patch.roleVersion = role.roleVersion + 1;
  } else {
    if (input.salaryPounds !== undefined) patch.salaryPence = BigInt(input.salaryPounds) * 100n;
    if (input.serviceMode !== undefined) patch.defaultServiceMode = input.serviceMode;
    if (input.vacancyKey !== undefined && input.vacancyKey !== role.vacancyKey) {
      const [dup] = await ctx.tx.select({ id: roles.id }).from(roles).where(and(eq(roles.clientId, role.clientId), eq(roles.vacancyKey, input.vacancyKey), ne(roles.id, role.id)));
      if (dup) throw conflict('DUPLICATE_VACANCY', 'This vacancy reference already exists. Open the existing role instead.', { existingRoleId: dup.id });
      patch.vacancyKey = input.vacancyKey;
    }
  }
  for (const k of ['title', 'roleFamily', 'locationRegion', 'workMode', 'workAuthorisationRequired', 'outcomes', 'teachableSkills', 'briefText'] as const) {
    if (input[k] !== undefined) (patch as Record<string, unknown>)[k] = input[k];
  }
  const [updated] = await ctx.tx.update(roles).set(patch).where(eq(roles.id, role.id)).returning();
  if (input.criteria !== undefined) await replaceCriteria(ctx, role.id, input.criteria);
  if (role.status !== 'draft') {
    await ctx.tx.update(matches).set({ stale: true }).where(eq(matches.roleId, role.id));
    const { recomputeRole } = await import('./matching');
    await recomputeRole(ctx, role.id);
  }
  await logActivity(ctx, { subjectType: 'role', subjectId: role.id, action: 'role.brief_updated', clientId: role.clientId, metadata: { roleVersion: updated.roleVersion } });
  return updated;
}

export async function openOrdinaryRoleCount(ctx: Ctx, clientId: string, excludeRoleId?: string) {
  const rows = await ctx.tx.select({ id: roles.id }).from(roles).where(and(eq(roles.clientId, clientId), eq(roles.status, 'open'), eq(roles.isReplacementRole, false)));
  return rows.filter((r) => r.id !== excludeRoleId).length;
}

/** Duplicate heuristic: same normalised title, family, salary and location within 30 business days. Provisional. */
export async function suspectedDuplicate(ctx: Ctx, role: Role) {
  const since = new Date(ctx.now.getTime() - 30 * 86400000);
  const rows = await ctx.tx.select().from(roles).where(and(eq(roles.clientId, role.clientId), ne(roles.id, role.id), eq(roles.roleFamily, role.roleFamily), eq(roles.salaryPence, role.salaryPence), eq(roles.locationRegion, role.locationRegion), eq(roles.isReplacementRole, false), gte(roles.createdAt, since)));
  return rows.find((r) => normTitle(r.title) === normTitle(role.title) && r.status !== 'draft') ?? null;
}

export async function confirmNewVacancy(ctx: Ctx, roleId: string, reason: string) {
  const a = requireUser(ctx.actor, 'consultant');
  const role = await roleForActor(ctx, roleId, { lock: true });
  const dup = await suspectedDuplicate(ctx, role);
  await ctx.tx.update(roles).set({ duplicateOfRoleId: dup?.id ?? null, newVacancyConfirmedBy: a.userId, newVacancyReason: reason, updatedAt: new Date() }).where(eq(roles.id, role.id));
  await logActivity(ctx, { subjectType: 'role', subjectId: role.id, action: 'role.new_vacancy_confirmed', clientId: role.clientId });
}

export function quoteForRole(role: Pick<Role, 'salaryPence'>, mode: ServiceMode, contract: typeof contracts.$inferSelect) {
  const t = terms(contract);
  const base = quoteStandardCredits(BigInt(role.salaryPence), t);
  const total = priceOrder(base, mode, t.fullSearchBps);
  const deposit = depositForPrimary(base, t.depositBps);
  const rate = contract.creditRatePence!;
  return { base, total, deposit, rate, totalPence: penceForUnits(total, rate), depositPence: penceForUnits(deposit, rate) };
}

/** Activation: inside the role limit it is free; beyond it the same one deposit is debited upfront. */
export async function activateRole(ctx: Ctx, roleId: string, opts: { confirmExtraDeposit: boolean; idempotencyKey: string }) {
  const pre = await roleForActor(ctx, roleId);
  const contract = await requireActiveContract(ctx, pre.clientId, true);
  const walletId = await lockWallet(ctx, pre.clientId);
  const role = await roleForActor(ctx, roleId, { lock: true });
  if (role.status !== 'draft') throw conflict('ROLE_NOT_DRAFT', 'This role is already active.');
  const crit = await criteriaFor(ctx, role.id);
  const fe: Record<string, string> = {};
  if (crit.length < 3 || crit.length > 6) fe.criteria = 'Approve 3 to 6 criteria before activating';
  if (!role.outcomes.length) fe.outcomes = 'Add at least one outcome';
  if (!role.vacancyKey) fe.vacancyKey = 'Vacancy reference is required';
  if (Object.keys(fe).length) throw invalid('The role brief is not complete yet.', fe);
  const dup = await suspectedDuplicate(ctx, role);
  if (dup && !role.newVacancyConfirmedBy) throw conflict('DUPLICATE_SUSPECTED', 'This looks like an existing role. Your consultant must confirm it is a genuinely new vacancy before activation.', { existingRoleId: dup.id });

  const q = quoteForRole(role, role.defaultServiceMode, contract);
  const openCount = await openOrdinaryRoleCount(ctx, role.clientId);
  const isExtra = openCount >= contract.includedOpenRoles;
  const [order] = await ctx.tx.insert(hireOrders).values({
    datasetId: ctx.datasetId, clientId: role.clientId, roleId: role.id, contractId: contract.id, orderNumber: 1, kind: 'primary', serviceMode: role.defaultServiceMode,
    salarySnapshotPence: BigInt(role.salaryPence), baseUnits: q.base, totalUnits: q.total, depositDueUnits: q.deposit, rateSnapshotPence: q.rate, totalPence: q.totalPence,
    pricingVersion: contract.pricingVersion, status: 'quoted',
  }).returning();
  if (isExtra) {
    if (!opts.confirmExtraDeposit) throw conflict('EXTRA_ROLE_CONFIRMATION_REQUIRED', `This is an extra role. ${formatCredits(q.deposit)} credits (${formatPence(q.depositPence)}) will be charged now as this role's deposit.`, { depositUnits: q.deposit.toString(), depositPence: q.depositPence.toString() });
    const b = await balances(ctx, walletId);
    if (b.spendable < q.deposit) throw shortfallError(q.deposit, b.spendable);
    await insertTransaction(ctx, { walletId, clientId: role.clientId, contractId: contract.id, orderId: order.id, roleId: role.id, type: 'deposit_debit', deltaUnits: -q.deposit, ratePence: q.rate, idempotencyKey: `${opts.idempotencyKey}:deposit:${order.id}`, reason: 'Extra role deposit paid at activation' });
    await ctx.tx.update(hireOrders).set({ status: 'deposit_paid', updatedAt: new Date() }).where(eq(hireOrders.id, order.id));
  }
  const [updated] = await ctx.tx.update(roles).set({ status: 'open', isExtraRole: isExtra, contractId: contract.id, pricingLockedAt: ctx.now, updatedAt: new Date(), rowVersion: role.rowVersion + 1 }).where(eq(roles.id, role.id)).returning();
  await logActivity(ctx, { subjectType: 'role', subjectId: role.id, action: isExtra ? 'role.activated_extra' : 'role.activated', clientId: role.clientId, metadata: { orderId: order.id, depositUnits: isExtra ? q.deposit.toString() : '0' } });
  const { recomputeRole } = await import('./matching');
  await recomputeRole(ctx, role.id);
  return updated;
}

/** Releases the role's deposit hold when nothing pending needs it, or unconditionally when forced. */
export async function releaseHoldIfUnneeded(ctx: Ctx, roleId: string, force = false) {
  const [hold] = await ctx.tx.select().from(creditHolds).where(and(eq(creditHolds.roleId, roleId), eq(creditHolds.status, 'active'))).for('update');
  if (!hold) return null;
  if (!force) {
    const pending = await ctx.tx.select({ id: introductions.id }).from(introductions).where(and(eq(introductions.roleId, roleId), eq(introductions.state, 'pending')));
    if (pending.length) return null;
  }
  await ctx.tx.update(creditHolds).set({ status: 'released', updatedAt: new Date() }).where(eq(creditHolds.id, hold.id));
  await logActivity(ctx, { subjectType: 'credit_hold', subjectId: hold.id, action: 'hold.released', metadata: { units: hold.units.toString(), roleId } });
  return hold;
}

export async function closeRole(ctx: Ctx, roleId: string, reason: 'filled' | 'cancelled' | 'on_hold' | 'other') {
  const pre = await roleForActor(ctx, roleId);
  const pendingCands = await ctx.tx.select({ c: introductions.candidateId }).from(introductions).where(and(eq(introductions.roleId, roleId), eq(introductions.state, 'pending')));
  const { lockCandidates } = await import('./context');
  await lockCandidates(ctx.tx, pendingCands.map((p) => p.c));
  await ctx.tx.select().from(contracts).where(eq(contracts.clientId, pre.clientId)).for('update');
  await lockWallet(ctx, pre.clientId);
  const role = await roleForActor(ctx, roleId, { lock: true });
  if (role.status !== 'open') throw conflict('ROLE_NOT_OPEN', 'Only an open role can be closed.');
  const cancelled = await ctx.tx.update(introductions).set({ state: 'cancelled', respondedAt: ctx.now, updatedAt: new Date() }).where(and(eq(introductions.roleId, roleId), eq(introductions.state, 'pending'))).returning({ id: introductions.id });
  await releaseHoldIfUnneeded(ctx, roleId, true);
  await ctx.tx.update(screenings).set({ status: 'cancelled', updatedAt: new Date() }).where(and(eq(screenings.roleId, roleId), inArray(screenings.status, ['requested', 'scheduled'])));
  const order = await primaryOrder(ctx, roleId, true);
  if (order && (order.status === 'quoted' || order.status === 'deposit_paid')) {
    await ctx.tx.update(hireOrders).set({ status: 'no_hire_closed', updatedAt: new Date() }).where(eq(hireOrders.id, order.id));
  }
  const [updated] = await ctx.tx.update(roles).set({ status: 'closed', closureReason: reason, closedAt: ctx.now, updatedAt: new Date(), rowVersion: role.rowVersion + 1 }).where(eq(roles.id, roleId)).returning();
  await logActivity(ctx, { subjectType: 'role', subjectId: roleId, action: 'role.closed', clientId: role.clientId, metadata: { reason, cancelledIntros: cancelled.length } });
  return updated;
}

export async function reopenRole(ctx: Ctx, roleId: string, opts: { confirmDeposit: boolean; idempotencyKey: string }) {
  const pre = await roleForActor(ctx, roleId);
  const contract = await requireActiveContract(ctx, pre.clientId, true);
  const walletId = await lockWallet(ctx, pre.clientId);
  const role = await roleForActor(ctx, roleId, { lock: true });
  if (role.status !== 'closed') throw conflict('ROLE_NOT_CLOSED', 'Only a closed role can be reopened.');
  const order = await primaryOrder(ctx, roleId, true);
  if (!order) throw conflict('ORDER_MISSING', 'This role has no order.');
  const pay = await orderPaymentState(ctx, order);
  const [hire] = await ctx.tx.select({ id: hires.id }).from(hires).where(eq(hires.orderId, order.id));
  const openCount = role.isReplacementRole ? 0 : await openOrdinaryRoleCount(ctx, role.clientId, role.id);
  const overLimit = !role.isReplacementRole && openCount >= contract.includedOpenRoles;
  let status: Order['status'] = hire ? 'paid' : pay.depositPaid ? 'deposit_paid' : 'quoted';
  if (overLimit && !pay.depositPaid && !hire && BigInt(order.depositDueUnits) > 0n) {
    const dep = BigInt(order.depositDueUnits);
    if (!opts.confirmDeposit) throw conflict('REOPEN_DEPOSIT_CONFIRMATION_REQUIRED', `Reopening takes this client over its open-role limit. The role's one deposit of ${formatCredits(dep)} credits (${formatPence(penceForUnits(dep, order.rateSnapshotPence))}) will be charged now.`, { depositUnits: dep.toString() });
    const b = await balances(ctx, walletId);
    if (b.spendable < dep) throw shortfallError(dep, b.spendable);
    await insertTransaction(ctx, { walletId, clientId: role.clientId, contractId: order.contractId, orderId: order.id, roleId, type: 'deposit_debit', deltaUnits: -dep, ratePence: order.rateSnapshotPence, idempotencyKey: `${opts.idempotencyKey}:deposit:${order.id}`, reason: 'Deposit paid on reopening beyond the open-role limit' });
    status = 'deposit_paid';
  }
  await ctx.tx.update(hireOrders).set({ status, updatedAt: new Date() }).where(eq(hireOrders.id, order.id));
  const [updated] = await ctx.tx.update(roles).set({ status: 'open', closureReason: null, closedAt: null, isExtraRole: role.isExtraRole || overLimit, updatedAt: new Date(), rowVersion: role.rowVersion + 1 }).where(eq(roles.id, roleId)).returning();
  await logActivity(ctx, { subjectType: 'role', subjectId: roleId, action: 'role.reopened', clientId: role.clientId });
  const { recomputeRole } = await import('./matching');
  await recomputeRole(ctx, role.id);
  return updated;
}

/** Upgrade: an unpaid primary order's total becomes 1.5x base. Nothing is charged on the click. */
export async function upgradeSearch(ctx: Ctx, roleId: string) {
  const pre = await roleForActor(ctx, roleId);
  await ctx.tx.select().from(contracts).where(eq(contracts.clientId, pre.clientId)).for('update');
  const role = await roleForActor(ctx, roleId, { lock: true });
  if (role.isReplacementRole) throw policy('REPLACEMENT_MODE_FIXED', 'A replacement role keeps the original service.');
  if (role.defaultServiceMode === 'full_search') return { role, changedOrder: false };
  const order = await primaryOrder(ctx, roleId, true);
  let changedOrder = false;
  if (order && order.status !== 'paid') {
    const [c] = await ctx.tx.select().from(contracts).where(eq(contracts.id, order.contractId));
    const total = priceOrder(BigInt(order.baseUnits), 'full_search', terms(c).fullSearchBps);
    await ctx.tx.update(hireOrders).set({ serviceMode: 'full_search', totalUnits: total, totalPence: penceForUnits(total, order.rateSnapshotPence), updatedAt: new Date(), rowVersion: order.rowVersion + 1 }).where(eq(hireOrders.id, order.id));
    changedOrder = true;
  }
  const [updated] = await ctx.tx.update(roles).set({ defaultServiceMode: 'full_search', updatedAt: new Date(), rowVersion: role.rowVersion + 1 }).where(eq(roles.id, roleId)).returning();
  await logActivity(ctx, { subjectType: 'role', subjectId: roleId, action: 'role.upgraded_full_search', clientId: role.clientId, metadata: { changedOrder } });
  return { role: updated, changedOrder };
}

/** Counters used for limits. Accepted includes withdrawn (accepted_at stays set). */
export async function roleCounters(ctx: Ctx, roleId: string) {
  const r = await ctx.tx.execute(sql`
    select
      count(*) filter (where accepted_at is not null)::int as accepted,
      count(*) filter (where state = 'pending' and expires_at > ${ctx.now.toISOString()}::timestamptz)::int as pending
    from introductions where role_id = ${roleId}`);
  const s = await ctx.tx.execute(sql`select count(*) filter (where status in ('requested','scheduled','completed'))::int as used, count(*) filter (where status = 'completed')::int as completed from screenings where role_id = ${roleId}`);
  const a = r.rows[0] as { accepted: number; pending: number };
  const b = s.rows[0] as { used: number; completed: number };
  return { accepted: a.accepted, pending: a.pending, screeningsUsed: b.used, screeningsCompleted: b.completed };
}

/** The single authoritative quote DTO for the charges panel. All amounts are strings. */
export async function roleCharges(ctx: Ctx, roleId: string) {
  const role = await roleForActor(ctx, roleId);
  const [contract] = await ctx.tx.select().from(contracts).where(eq(contracts.id, role.contractId));
  const [client] = await ctx.tx.select().from(clients).where(eq(clients.id, role.clientId));
  const order = await primaryOrder(ctx, roleId);
  const counters = await roleCounters(ctx, roleId);
  const rate = order?.rateSnapshotPence ?? contract.creditRatePence ?? prototype.packCreditPence;
  const t = terms(contract);
  const base = order ? BigInt(order.baseUnits) : quoteStandardCredits(BigInt(role.salaryPence), t);
  const mode = order?.serviceMode ?? role.defaultServiceMode;
  const total = order ? BigInt(order.totalUnits) : priceOrder(base, mode, t.fullSearchBps);
  const deposit = order ? BigInt(order.depositDueUnits) : depositForPrimary(base, t.depositBps);
  const pay = order ? await orderPaymentState(ctx, order) : null;
  const [hire] = order ? await ctx.tx.select({ id: hires.id }).from(hires).where(eq(hires.orderId, order.id)) : [];
  const [hold] = await ctx.tx.select().from(creditHolds).where(and(eq(creditHolds.roleId, roleId), eq(creditHolds.status, 'active')));
  const totalPence = penceForUnits(total, rate);
  const depositPence = penceForUnits(deposit, rate);
  const salary = BigInt(role.salaryPence);
  const fee = (bps: number) => (salary * BigInt(bps) + 5000n) / 10000n;
  const cmp = (bps: number) => {
    const feePence = fee(bps);
    return { feeBps: bps, feePence: feePence.toString(), percentOfFee: feePence ? Number((totalPence * 100n + feePence / 2n) / feePence) : 0, isAbove: totalPence > feePence, differencePence: (totalPence > feePence ? totalPence - feePence : feePence - totalPence).toString() };
  };
  const fullTotal = priceOrder(base, 'full_search', t.fullSearchBps);
  const wallet = await getWallet(ctx, role.clientId);
  return {
    roleId,
    isReplacementRole: role.isReplacementRole,
    isExtraRole: role.isExtraRole,
    salaryPence: salary.toString(),
    serviceMode: mode,
    roleDefaultMode: role.defaultServiceMode,
    ratePence: rate,
    baseUnits: base.toString(),
    totalUnits: total.toString(),
    totalPence: totalPence.toString(),
    depositUnits: deposit.toString(),
    depositPence: depositPence.toString(),
    depositPaid: pay?.depositPaid ?? false,
    paidUnits: (pay?.paidUnits ?? 0n).toString(),
    paidPence: (pay?.paidPence ?? 0n).toString(),
    remainingUnits: (pay ? pay.remainingUnits : total).toString(),
    remainingPence: (pay ? pay.remainingPence : totalPence).toString(),
    firstHirePaid: order?.status === 'paid' || !!hire,
    orderStatus: order?.status ?? null,
    holdUnits: hold ? hold.units.toString() : null,
    accepted: counters.accepted,
    pending: counters.pending,
    screeningsUsed: counters.screeningsUsed,
    maxIntros: t.maxAcceptedIntros,
    includedScreenings: t.includedScreenings,
    fullSearchPreview: { totalUnits: fullTotal.toString(), totalPence: penceForUnits(fullTotal, rate).toString(), remainingPence: (penceForUnits(fullTotal, rate) - (pay?.paidPence ?? 0n)).toString(), remainingUnits: (fullTotal - (pay?.paidUnits ?? 0n)).toString() },
    comparison: cmp(t.comparisonFeeBps),
    existingComparison: client?.existingFeeBps && client.existingFeeBps !== t.comparisonFeeBps ? cmp(client.existingFeeBps) : null,
    contractActive: contractCurrentlyActive(contract, businessDate(ctx)),
    walletId: wallet?.id ?? null,
  };
}
export type RoleCharges = Awaited<ReturnType<typeof roleCharges>>;
