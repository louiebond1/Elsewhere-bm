import { and, eq, max, sql } from 'drizzle-orm';
import { hires, hireOrders, introductions, roles, replacementCases, roleCriteria, pipelineEntries, contracts, creditTransactions, candidates } from '../db/schema';
import { conflict, invalid, notFound, policy } from '../lib/errors';
import { formatPence, finalDebitPence, penceForUnits, priceOrder, formatCredits } from '../lib/pricing';
import { isIsoDate, withinReplacementWindow, withinOutsideHireWindow, londonDateOf } from '../lib/dates';
import { lockCandidates, requireUser, type Ctx } from './context';
import { terms, activeContractForClient, contractCurrentlyActive, businessDate } from './contracts';
import { lockWallet, balances, insertTransaction, orderPaymentState, shortfallError, getWallet } from './ledger';
import { roleForActor, primaryOrder, criteriaFor } from './roles';
import { activeGrant } from '../policies/privacy';
import { logActivity, notify, clientUserIds, consultantUserIds } from './audit';
import { recomputeRole } from './matching';

type HireSource = 'in_system' | 'outside_system';

export type HireArgs = { introductionId: string; acceptedOfferDate: string; startDate: string; salaryPence: bigint; idempotencyKey: string };

/**
 * One price per hire. The first hire settles the primary order's unpaid balance,
 * a later hire on the same role is a new full-price order, and a hire on an
 * approved replacement role settles its zero-price order.
 */
async function settleHire(ctx: Ctx, args: HireArgs, source: HireSource, clientIdScope?: string) {
  const a = requireUser(ctx.actor);
  if (!isIsoDate(args.acceptedOfferDate) || !isIsoDate(args.startDate)) throw invalid('Enter valid dates.');
  if (args.startDate < args.acceptedOfferDate) throw invalid('The start date must be on or after the offer acceptance date.', { startDate: 'Start date is before the offer date' });
  const [pre] = await ctx.tx.select().from(introductions).where(and(eq(introductions.id, args.introductionId), eq(introductions.datasetId, ctx.datasetId)));
  if (!pre) throw notFound();
  if (a.userType === 'client' && pre.clientId !== a.clientId) throw notFound();
  if (clientIdScope && pre.clientId !== clientIdScope) throw notFound();
  if (a.userType === 'candidate') throw notFound();

  await lockCandidates(ctx.tx, [pre.candidateId]);
  await ctx.tx.execute(sql`select id from contracts where client_id = ${pre.clientId} order by id for update`);
  const walletId = await lockWallet(ctx, pre.clientId);
  const [role] = await ctx.tx.select().from(roles).where(eq(roles.id, pre.roleId)).for('update');
  await ctx.tx.execute(sql`select id from hire_orders where role_id = ${role.id} order by id for update`);
  const [intro] = await ctx.tx.select().from(introductions).where(eq(introductions.id, pre.id)).for('update');

  // Duplicate protection regardless of endpoint or idempotency key.
  const duplicateKey = `${intro.clientId}:${intro.candidateId}:${args.startDate}`;
  const [dup] = await ctx.tx.select().from(hires).where(and(eq(hires.datasetId, ctx.datasetId), eq(hires.duplicateKey, duplicateKey)));
  if (dup) return { hire: dup, existing: true, chargedUnits: 0n, chargedPence: 0n };

  if (!intro.acceptedAt) throw policy('NO_ACCEPTED_INTRO', 'There is no accepted introduction for this candidate and role.');
  const [cand] = await ctx.tx.select().from(candidates).where(eq(candidates.id, intro.candidateId));
  if (!cand || cand.status === 'deleting' || cand.status === 'deleted') throw policy('CANDIDATE_UNAVAILABLE', 'This profile is no longer available. A hire that already happened needs manual review outside the prototype.');
  if (source === 'in_system') {
    if (intro.state !== 'accepted') throw policy('INTRO_NOT_ACTIVE', 'This introduction is no longer active.');
    if (!(await activeGrant(ctx, { candidateId: intro.candidateId, clientId: intro.clientId, roleId: role.id }))) throw policy('INTRO_NOT_ACTIVE', 'This profile is no longer available for this role.');
  } else {
    const acceptedDate = londonDateOf(intro.acceptedAt);
    const [c0] = await ctx.tx.select().from(contracts).where(eq(contracts.id, role.contractId));
    if (!withinOutsideHireWindow(acceptedDate, args.acceptedOfferDate, terms(c0).outsideHireMonths))
      throw policy('OUTSIDE_HIRE_WINDOW', 'The offer falls outside the demo 12-month clause window from the accepted introduction. No automated charge. Legal or manual review is required.');
  }
  if (args.salaryPence !== BigInt(role.salaryPence))
    throw policy('SALARY_REVIEW', 'This offer salary differs from the agreed quote. Ask BondMoran to review the pricing before recording the hire.', { quotedSalaryPence: role.salaryPence.toString() });

  const primary = await primaryOrder(ctx, role.id, true);
  if (!primary) throw conflict('ORDER_MISSING', 'This role has no order.');
  const [primaryHire] = await ctx.tx.select({ id: hires.id }).from(hires).where(eq(hires.orderId, primary.id));
  let order = primary;
  let txType: 'hire_balance_debit' | 'second_hire_debit' | 'outside_hire_debit' = source === 'outside_system' ? 'outside_hire_debit' : 'hire_balance_debit';
  if (primaryHire) {
    // Additional hire: a new full price at the role's current service mode. The deposit is never reused.
    const active = await activeContractForClient(ctx, role.clientId);
    const contract = active && contractCurrentlyActive(active, businessDate(ctx)) ? active : (await ctx.tx.select().from(contracts).where(eq(contracts.id, primary.contractId)))[0];
    const rate = contract.creditRatePence!;
    const base = BigInt(primary.baseUnits);
    const total = priceOrder(base, role.defaultServiceMode, terms(contract).fullSearchBps);
    const [{ n }] = await ctx.tx.select({ n: max(hireOrders.orderNumber) }).from(hireOrders).where(eq(hireOrders.roleId, role.id));
    [order] = await ctx.tx.insert(hireOrders).values({ datasetId: ctx.datasetId, clientId: role.clientId, roleId: role.id, contractId: contract.id, orderNumber: (n ?? 1) + 1, kind: 'additional', serviceMode: role.defaultServiceMode, salarySnapshotPence: BigInt(role.salaryPence), baseUnits: base, totalUnits: total, depositDueUnits: 0n, rateSnapshotPence: rate, totalPence: penceForUnits(total, rate), pricingVersion: contract.pricingVersion, status: 'quoted' }).returning();
    if (source === 'in_system') txType = 'second_hire_debit';
  }

  const pay = await orderPaymentState(ctx, order);
  const b = await balances(ctx, walletId);
  if (pay.remainingUnits > 0n && b.spendable < pay.remainingUnits) throw shortfallError(pay.remainingUnits, b.spendable);

  const [hire] = await ctx.tx.insert(hires).values({
    datasetId: ctx.datasetId, clientId: role.clientId, roleId: role.id, candidateId: intro.candidateId, introductionId: intro.id, orderId: order.id,
    source: order.kind === 'replacement' ? 'replacement' : source, agreedSalaryPence: args.salaryPence, acceptedOfferDate: args.acceptedOfferDate, startDate: args.startDate,
    status: 'confirmed', createdByUserId: a.userId, duplicateKey, candidateRefSnapshot: cand.publicRef, outsideIntroId: source === 'outside_system' ? intro.id : null,
  }).returning();
  let chargedPence = 0n;
  if (pay.remainingUnits > 0n) {
    chargedPence = finalDebitPence(pay.totalPence, pay.paidPence);
    await insertTransaction(ctx, { walletId, clientId: role.clientId, contractId: order.contractId, orderId: order.id, roleId: role.id, hireId: hire.id, type: txType, deltaUnits: -pay.remainingUnits, deltaPence: -chargedPence, ratePence: order.rateSnapshotPence, idempotencyKey: `${args.idempotencyKey}:hire:${order.id}`, reason: order.kind === 'additional' ? 'Additional hire, new full price' : source === 'outside_system' ? 'Outside-system hire: remaining balance of the quoted price' : 'First hire: remaining balance after deposit' });
  }
  await ctx.tx.update(hireOrders).set({ status: 'paid', updatedAt: new Date() }).where(eq(hireOrders.id, order.id));
  await ctx.tx.update(pipelineEntries).set({ stage: 'hired', updatedByUserId: a.userId, updatedAt: new Date() }).where(eq(pipelineEntries.introductionId, intro.id));
  if (order.kind === 'replacement' && role.replacementCaseId) {
    await ctx.tx.update(replacementCases).set({ status: 'fulfilled', replacementHireId: hire.id, updatedAt: new Date() }).where(eq(replacementCases.id, role.replacementCaseId));
  }
  await notify(ctx, await clientUserIds(ctx, role.clientId), { type: 'hire_recorded', subjectRefType: 'hire', subjectRefId: hire.id, safeTitle: `Hire recorded for ${role.title}` });
  await logActivity(ctx, { subjectType: 'hire', subjectId: hire.id, action: source === 'outside_system' ? 'hire.outside_recorded' : 'hire.recorded', clientId: role.clientId, metadata: { orderId: order.id, orderKind: order.kind, chargedUnits: pay.remainingUnits.toString(), chargedPence: chargedPence.toString() } });
  return { hire, existing: false, chargedUnits: pay.remainingUnits, chargedPence };
}

export async function recordHire(ctx: Ctx, args: HireArgs) {
  return settleHire(ctx, args, 'in_system');
}

export async function recordOutsideHire(ctx: Ctx, args: HireArgs & { clientId: string }) {
  requireUser(ctx.actor, 'consultant');
  return settleHire(ctx, args, 'outside_system', args.clientId);
}

/** Preview the price of recording a hire now, without charging. */
export async function hirePreview(ctx: Ctx, introductionId: string) {
  const [intro] = await ctx.tx.select().from(introductions).where(and(eq(introductions.id, introductionId), eq(introductions.datasetId, ctx.datasetId)));
  if (!intro) throw notFound();
  const role = await roleForActor(ctx, intro.roleId);
  const primary = await primaryOrder(ctx, role.id);
  const [primaryHire] = primary ? await ctx.tx.select({ id: hires.id }).from(hires).where(eq(hires.orderId, primary.id)) : [];
  if (!primary) return null;
  if (!primaryHire) {
    const p = await orderPaymentState(ctx, primary);
    return { kind: primary.kind, totalUnits: p.totalUnits.toString(), totalPence: p.totalPence.toString(), paidPence: p.paidPence.toString(), remainingUnits: p.remainingUnits.toString(), remainingPence: p.remainingPence.toString(), salaryPence: role.salaryPence.toString(), isNewFullPrice: false };
  }
  const active = await activeContractForClient(ctx, role.clientId);
  const contract = active ?? (await ctx.tx.select().from(contracts).where(eq(contracts.id, primary.contractId)))[0];
  const total = priceOrder(BigInt(primary.baseUnits), role.defaultServiceMode, terms(contract).fullSearchBps);
  const tp = penceForUnits(total, contract.creditRatePence!);
  return { kind: 'additional', totalUnits: total.toString(), totalPence: tp.toString(), paidPence: '0', remainingUnits: total.toString(), remainingPence: tp.toString(), salaryPence: role.salaryPence.toString(), isNewFullPrice: true };
}

async function hireForActor(ctx: Ctx, hireId: string) {
  const a = requireUser(ctx.actor);
  const [h] = await ctx.tx.select().from(hires).where(and(eq(hires.id, hireId), eq(hires.datasetId, ctx.datasetId))).for('update');
  if (!h || a.userType === 'candidate' || (a.userType === 'client' && h.clientId !== a.clientId)) throw notFound();
  return h;
}

export async function recordDeparture(ctx: Ctx, hireId: string, input: { leftDate: string; reason: string }) {
  const h = await hireForActor(ctx, hireId);
  if (!isIsoDate(input.leftDate)) throw invalid('Enter a valid date.');
  if (input.leftDate < h.startDate) throw policy('INVALID_DEPARTURE_DATE', 'The departure date is before the start date. An offer cancelled before joining needs manual review and is not treated as a replacement.');
  if (h.status === 'left') throw conflict('ALREADY_LEFT', 'A departure is already recorded for this hire.');
  const [u] = await ctx.tx.update(hires).set({ status: 'left', leftDate: input.leftDate, leftReason: input.reason, updatedAt: new Date() }).where(eq(hires.id, h.id)).returning();
  await logActivity(ctx, { subjectType: 'hire', subjectId: h.id, action: 'hire.departure_recorded', clientId: h.clientId });
  return u;
}

export function replacementEligibility(h: typeof hires.$inferSelect, windowDays: number, orderPaid: boolean): 'eligible' | 'outside_window' | 'already_used' | 'pending_review' {
  if (h.source === 'replacement') return 'already_used';
  if (!h.leftDate) return 'pending_review';
  if (!orderPaid) return 'pending_review';
  return withinReplacementWindow(h.startDate, h.leftDate, windowDays) ? 'eligible' : 'outside_window';
}

export async function requestReplacement(ctx: Ctx, hireId: string, reason: string) {
  const a = requireUser(ctx.actor);
  const h = await hireForActor(ctx, hireId);
  if (h.status !== 'left' || !h.leftDate) throw conflict('NO_DEPARTURE', 'Record the departure date first.');
  const [existing] = await ctx.tx.select().from(replacementCases).where(eq(replacementCases.originalHireId, h.id));
  if (existing) return existing;
  const [order] = await ctx.tx.select().from(hireOrders).where(eq(hireOrders.id, h.orderId));
  const [c] = await ctx.tx.select().from(contracts).where(eq(contracts.id, order.contractId));
  const elig = replacementEligibility(h, terms(c).replacementWindowDays, order.status === 'paid');
  const auto = elig === 'outside_window' || elig === 'already_used';
  const [rc] = await ctx.tx.insert(replacementCases).values({ datasetId: ctx.datasetId, originalHireId: h.id, clientId: h.clientId, requestedByUserId: a.userId, leftDate: h.leftDate, reason, eligibility: elig, status: auto ? 'declined' : 'requested', decisionAt: auto ? ctx.now : null }).returning();
  if (!auto) await notify(ctx, await consultantUserIds(ctx), { type: 'replacement_updated', subjectRefType: 'replacement', subjectRefId: rc.id, safeTitle: 'Replacement request to review' });
  await logActivity(ctx, { subjectType: 'replacement', subjectId: rc.id, action: 'replacement.requested', clientId: h.clientId, metadata: { eligibility: elig } });
  return rc;
}

export async function approveReplacement(ctx: Ctx, caseId: string) {
  const a = requireUser(ctx.actor, 'consultant');
  const [rc] = await ctx.tx.select().from(replacementCases).where(and(eq(replacementCases.id, caseId), eq(replacementCases.datasetId, ctx.datasetId))).for('update');
  if (!rc) throw notFound();
  if (rc.status === 'approved' || rc.status === 'fulfilled') return rc;
  if (rc.status !== 'requested' || rc.eligibility !== 'eligible') throw policy('REPLACEMENT_NOT_ELIGIBLE', 'This request is not eligible for a free replacement. A new paid role would need the client’s explicit agreement.');
  const [h] = await ctx.tx.select().from(hires).where(eq(hires.id, rc.originalHireId));
  const [origOrder] = await ctx.tx.select().from(hireOrders).where(eq(hireOrders.id, h.orderId));
  if (origOrder.status !== 'paid') throw policy('REPLACEMENT_NOT_ELIGIBLE', 'The original hire is not fully paid.');
  const [orig] = await ctx.tx.select().from(roles).where(eq(roles.id, h.roleId));
  const [role] = await ctx.tx.insert(roles).values({
    datasetId: ctx.datasetId, clientId: orig.clientId, contractId: orig.contractId, vacancyKey: `${orig.vacancyKey}/REP1`, title: orig.title, roleFamily: orig.roleFamily, locationRegion: orig.locationRegion, workMode: orig.workMode,
    salaryPence: orig.salaryPence, workAuthorisationRequired: orig.workAuthorisationRequired, briefText: orig.briefText, outcomes: orig.outcomes, teachableSkills: orig.teachableSkills, status: 'open', assignedConsultantId: orig.assignedConsultantId,
    pricingLockedAt: ctx.now, isReplacementRole: true, replacementCaseId: rc.id, defaultServiceMode: origOrder.serviceMode, createdByUserId: a.userId,
  }).returning();
  const crit = await criteriaFor(ctx, orig.id);
  if (crit.length) await ctx.tx.insert(roleCriteria).values(crit.map((c) => ({ datasetId: ctx.datasetId, roleId: role.id, criterionKey: c.criterionKey, label: c.label, description: c.description, importance: c.importance, weight: c.weight, evidenceTags: c.evidenceTags, ordinal: c.ordinal })));
  await ctx.tx.insert(hireOrders).values({ datasetId: ctx.datasetId, clientId: orig.clientId, roleId: role.id, contractId: origOrder.contractId, orderNumber: 1, kind: 'replacement', serviceMode: origOrder.serviceMode, salarySnapshotPence: origOrder.salarySnapshotPence, baseUnits: origOrder.baseUnits, totalUnits: 0n, depositDueUnits: 0n, rateSnapshotPence: origOrder.rateSnapshotPence, totalPence: 0n, pricingVersion: origOrder.pricingVersion, status: 'quoted', parentPaidOrderId: origOrder.id });
  const [u] = await ctx.tx.update(replacementCases).set({ status: 'approved', decisionByUserId: a.userId, decisionAt: ctx.now, replacementRoleId: role.id, updatedAt: new Date() }).where(eq(replacementCases.id, rc.id)).returning();
  await recomputeRole(ctx, role.id);
  await notify(ctx, await clientUserIds(ctx, rc.clientId), { type: 'replacement_updated', subjectRefType: 'role', subjectRefId: role.id, safeTitle: `Replacement approved for ${orig.title}` });
  await logActivity(ctx, { subjectType: 'replacement', subjectId: rc.id, action: 'replacement.approved', clientId: rc.clientId, metadata: { replacementRoleId: role.id } });
  return u;
}

export async function declineReplacement(ctx: Ctx, caseId: string) {
  const a = requireUser(ctx.actor, 'consultant');
  const [rc] = await ctx.tx.select().from(replacementCases).where(and(eq(replacementCases.id, caseId), eq(replacementCases.datasetId, ctx.datasetId))).for('update');
  if (!rc) throw notFound();
  if (rc.status !== 'requested') throw conflict('REPLACEMENT_DECIDED', 'This request has already been decided.');
  const [u] = await ctx.tx.update(replacementCases).set({ status: 'declined', decisionByUserId: a.userId, decisionAt: ctx.now, updatedAt: new Date() }).where(eq(replacementCases.id, rc.id)).returning();
  await logActivity(ctx, { subjectType: 'replacement', subjectId: rc.id, action: 'replacement.declined', clientId: rc.clientId });
  return u;
}

/** Simulated consultant grant at the existing contract rate. Not a payment. */
export async function grantCredits(ctx: Ctx, input: { clientId: string; credits: number; reason: string; idempotencyKey: string }) {
  requireUser(ctx.actor, 'consultant');
  const contracts_ = await ctx.tx.select().from(contracts).where(eq(contracts.clientId, input.clientId)).for('update');
  const contract = contracts_.find((c) => c.status === 'active') ?? contracts_.sort((x, y) => (x.endDate < y.endDate ? 1 : -1))[0];
  if (!contract?.creditRatePence) throw conflict('CONTRACT_NOT_ACTIVE', 'This client has no contract with a rate.');
  const walletId = await lockWallet(ctx, input.clientId);
  const units = BigInt(Math.round(input.credits * 10000));
  const tx = await insertTransaction(ctx, { walletId, clientId: input.clientId, contractId: contract.id, type: 'grant', deltaUnits: units, ratePence: contract.creditRatePence, idempotencyKey: `${input.idempotencyKey}:grant`, reason: `Simulated demo grant: ${input.reason}` });
  await logActivity(ctx, { subjectType: 'credit_transaction', subjectId: tx.id, action: 'credits.granted', clientId: input.clientId, metadata: { units: units.toString() } });
  return tx;
}

/** Consultant correction: an exact opposing entry linked to the original. Never edits history. */
export async function reverseTransaction(ctx: Ctx, input: { transactionId: string; reason: string; idempotencyKey: string }) {
  requireUser(ctx.actor, 'consultant');
  const [orig] = await ctx.tx.select().from(creditTransactions).where(and(eq(creditTransactions.id, input.transactionId), eq(creditTransactions.datasetId, ctx.datasetId)));
  if (!orig) throw notFound();
  if (orig.type === 'reversal') throw conflict('CANNOT_REVERSE_REVERSAL', 'A reversal cannot itself be reversed. Post a new correct entry instead.');
  await ctx.tx.execute(sql`select id from contracts where client_id = ${orig.clientId} for update`);
  const walletId = await lockWallet(ctx, orig.clientId);
  const [already] = await ctx.tx.select({ id: creditTransactions.id }).from(creditTransactions).where(eq(creditTransactions.reversalOfId, orig.id));
  if (already) throw conflict('ALREADY_REVERSED', 'This entry has already been reversed.');
  const delta = -BigInt(orig.deltaUnits);
  const b = await balances(ctx, walletId);
  if (b.spendable + delta < 0n) throw conflict('REVERSAL_WOULD_OVERDRAW', `Reversing this entry would leave the wallet ${formatCredits(b.spendable + delta)} credits.`);
  const tx = await insertTransaction(ctx, { walletId, clientId: orig.clientId, contractId: orig.contractId, orderId: orig.orderId, roleId: orig.roleId, hireId: orig.hireId, type: 'reversal', deltaUnits: delta, deltaPence: -BigInt(orig.deltaPence), ratePence: orig.valuationRatePence, idempotencyKey: `${input.idempotencyKey}:reversal`, reversalOfId: orig.id, reason: `Correction: ${input.reason}` });
  if (orig.orderId) {
    const [order] = await ctx.tx.select().from(hireOrders).where(eq(hireOrders.id, orig.orderId));
    const p = await orderPaymentState(ctx, order);
    const [hh] = await ctx.tx.select({ id: hires.id }).from(hires).where(eq(hires.orderId, order.id));
    const status = hh && p.remainingUnits === 0n ? 'paid' : p.depositPaid ? 'deposit_paid' : order.status === 'no_hire_closed' ? 'no_hire_closed' : 'quoted';
    await ctx.tx.update(hireOrders).set({ status, updatedAt: new Date() }).where(eq(hireOrders.id, order.id));
  }
  await logActivity(ctx, { subjectType: 'credit_transaction', subjectId: tx.id, action: 'credits.reversed', clientId: orig.clientId, metadata: { reversalOf: orig.id } });
  return tx;
}

export async function setPipelineStage(ctx: Ctx, introductionId: string, stage: 'introduced' | 'interview' | 'offer' | 'rejected', note?: string) {
  const a = requireUser(ctx.actor);
  const [intro] = await ctx.tx.select().from(introductions).where(and(eq(introductions.id, introductionId), eq(introductions.datasetId, ctx.datasetId)));
  if (!intro || a.userType === 'candidate' || (a.userType === 'client' && intro.clientId !== a.clientId)) throw notFound();
  const [pe] = await ctx.tx.select().from(pipelineEntries).where(eq(pipelineEntries.introductionId, intro.id)).for('update');
  if (!pe) throw notFound();
  if (pe.stage === 'hired' || pe.stage === 'withdrawn') throw conflict('STAGE_LOCKED', 'This pipeline entry can no longer change stage.');
  const [u] = await ctx.tx.update(pipelineEntries).set({ stage, clientNote: note ?? pe.clientNote, updatedByUserId: a.userId, updatedAt: new Date() }).where(eq(pipelineEntries.id, pe.id)).returning();
  await logActivity(ctx, { subjectType: 'introduction', subjectId: intro.id, action: 'pipeline.stage_changed', clientId: intro.clientId, metadata: { stage } });
  return u;
}

export { getWallet, formatPence };
