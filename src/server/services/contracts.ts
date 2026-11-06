import { and, eq } from 'drizzle-orm';
import { contracts, clients } from '../db/schema';
import { conflict, notFound, policy, invalid } from '../lib/errors';
import { currentTermsSnapshot, prototype, type TermsSnapshot } from '../../config/prototype';
import { londonDateOf } from '../lib/dates';
import { ensureWallet, insertTransaction } from './ledger';
import { logActivity } from './audit';
import { requireUser, type Ctx } from './context';
import { contractInput } from './inputs';
import type { z } from 'zod';

export type Contract = typeof contracts.$inferSelect;

export function businessDate(ctx: Pick<Ctx, 'now'>) {
  return londonDateOf(ctx.now);
}

export function contractCurrentlyActive(c: Contract, today: string) {
  return c.status === 'active' && c.startDate <= today && today <= c.endDate;
}

export async function activeContractForClient(ctx: Ctx, clientId: string, opts: { lock?: boolean } = {}) {
  const q = ctx.tx.select().from(contracts).where(and(eq(contracts.clientId, clientId), eq(contracts.status, 'active')));
  const [c] = opts.lock ? await q.for('update') : await q;
  return c ?? null;
}

export function terms(c: Contract): TermsSnapshot {
  return (c.termsSnapshot as TermsSnapshot | null) ?? currentTermsSnapshot();
}

export async function requireActiveContract(ctx: Ctx, clientId: string, lock = true) {
  const c = await activeContractForClient(ctx, clientId, { lock });
  if (!c || !contractCurrentlyActive(c, businessDate(ctx))) throw conflict('CONTRACT_NOT_ACTIVE', 'This client has no active contract for new activity. Ask your consultant.');
  if (!c.creditRatePence) throw policy('CONTRACT_RATE_MISSING', 'The contract has no credit rate.');
  return c;
}

export async function createContractDraft(ctx: Ctx, input: z.infer<typeof contractInput>) {
  requireUser(ctx.actor, 'consultant');
  const [client] = await ctx.tx.select().from(clients).where(eq(clients.id, input.clientId));
  if (!client) throw notFound();
  if (input.endDate < input.startDate) throw invalid('End date must be after the start date.', { endDate: 'End date must be after the start date' });
  const [c] = await ctx.tx.insert(contracts).values({
    datasetId: ctx.datasetId,
    clientId: input.clientId,
    planType: input.planType,
    status: 'draft',
    startDate: input.startDate,
    endDate: input.endDate,
    creditRatePence: input.creditRatePounds == null ? null : Math.round(input.creditRatePounds * 100),
    includedOpenRoles: input.includedOpenRoles,
    committedCreditUnits: BigInt(Math.round(input.committedCredits * prototype.creditScale)),
    instalmentCount: input.instalmentCount,
    pricingVersion: prototype.pricingVersion,
    label: input.label ?? null,
  }).returning();
  await logActivity(ctx, { subjectType: 'contract', subjectId: c.id, action: 'contract.draft_created', clientId: c.clientId });
  return c;
}

/** Activation snapshots terms and grants committed credits exactly once. */
export async function activateContract(ctx: Ctx, contractId: string) {
  requireUser(ctx.actor, 'consultant');
  const [c] = await ctx.tx.select().from(contracts).where(eq(contracts.id, contractId)).for('update');
  if (!c) throw notFound();
  if (c.status === 'active') return c;
  if (c.status !== 'draft') throw conflict('CONTRACT_NOT_DRAFT', 'Only a draft contract can be activated. Create a future contract instead of editing history.');
  if (!c.creditRatePence) throw policy('CONTRACT_RATE_MISSING', 'Enter an explicit credit rate before activating. No monthly rate is assumed.');
  const existing = await activeContractForClient(ctx, c.clientId, { lock: true });
  if (existing) throw conflict('ACTIVE_CONTRACT_EXISTS', 'This client already has an active contract. Overlapping active contracts are not supported.');
  const [updated] = await ctx.tx.update(contracts).set({ status: 'active', termsSnapshot: currentTermsSnapshot(), activatedAt: new Date(), updatedAt: new Date(), rowVersion: c.rowVersion + 1 }).where(eq(contracts.id, c.id)).returning();
  const wallet = await ensureWallet(ctx, c.clientId);
  if (BigInt(c.committedCreditUnits) > 0n) {
    await insertTransaction(ctx, { walletId: wallet.id, clientId: c.clientId, contractId: c.id, type: 'grant', deltaUnits: BigInt(c.committedCreditUnits), ratePence: c.creditRatePence, idempotencyKey: `grant:contract:${c.id}`, reason: 'Contract activation (simulated entitlement, not a payment)' });
  }
  await ctx.tx.update(clients).set({ status: 'active', updatedAt: new Date() }).where(eq(clients.id, c.clientId));
  await logActivity(ctx, { subjectType: 'contract', subjectId: c.id, action: 'contract.activated', clientId: c.clientId, metadata: { committedUnits: c.committedCreditUnits.toString() } });
  return updated;
}

/** Instalment schedule is indicative only. No payment is collected. */
export function instalmentSchedule(c: Contract) {
  const rate = c.creditRatePence ?? 0;
  const totalPence = (BigInt(c.committedCreditUnits) * BigInt(rate)) / BigInt(prototype.creditScale);
  const n = BigInt(Math.max(1, c.instalmentCount));
  const each = totalPence / n;
  const out: { index: number; date: string; pence: string }[] = [];
  let allocated = 0n;
  for (let i = 0; i < Number(n); i++) {
    const p = i === Number(n) - 1 ? totalPence - allocated : each;
    allocated += p;
    const d = new Date(c.startDate + 'T00:00:00Z');
    d.setUTCMonth(d.getUTCMonth() + i);
    out.push({ index: i + 1, date: d.toISOString().slice(0, 10), pence: p.toString() });
  }
  return { totalPence: totalPence.toString(), instalments: out };
}
