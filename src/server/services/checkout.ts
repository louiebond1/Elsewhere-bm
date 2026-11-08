import { and, desc, eq } from 'drizzle-orm';
import { simulatedCheckouts, contracts, clients } from '../db/schema';
import { conflict, notFound, policy } from '../lib/errors';
import { penceForUnits } from '../lib/pricing';
import { isUuid } from '../lib/ids';
import { prototype } from '../../config/prototype';
import { requireUser, type Ctx } from './context';
import { requireActiveContract } from './contracts';
import { lockWallet, balances, insertTransaction, ensureWallet, getWallet } from './ledger';
import { logActivity, notify } from './audit';

/**
 * Demo-only checkout. There is no payment provider and no card data.
 * Opening a checkout changes nothing in the ledger. "Simulate success" posts exactly one
 * simulated_purchase entry (ledger key checkout:<id>); decline and cancel post nothing.
 * Holds, deposits and hire debits are unaffected: buying credits only adds spendable balance.
 */
export type Checkout = typeof simulatedCheckouts.$inferSelect;

function clientActor(ctx: Ctx) {
  const actor = requireUser(ctx.actor, 'client');
  if (!actor.clientId) throw notFound();
  return { userId: actor.userId, clientId: actor.clientId };
}

export async function createCheckout(ctx: Ctx, input: { credits: number }) {
  if (!prototype.simulatedCheckout) throw policy('CHECKOUT_DISABLED', 'Buying credits is not available.');
  const a = clientActor(ctx);
  const contract = await requireActiveContract(ctx, a.clientId, false);
  await ensureWallet(ctx, a.clientId);
  const units = BigInt(input.credits) * BigInt(prototype.creditScale);
  const rate = contract.creditRatePence!;
  const [row] = await ctx.tx.insert(simulatedCheckouts).values({
    datasetId: ctx.datasetId, clientId: a.clientId, contractId: contract.id, units, ratePence: rate, totalPence: penceForUnits(units, rate), createdByUserId: a.userId,
  }).returning();
  await logActivity(ctx, { subjectType: 'checkout', subjectId: row.id, action: 'checkout.opened', clientId: a.clientId, metadata: { units: units.toString() } });
  return row;
}

/** Locks the checkout row for the acting client. Other clients see "not found". */
async function lockOwn(ctx: Ctx, id: string) {
  const a = clientActor(ctx);
  if (!isUuid(id)) throw notFound();
  const [c] = await ctx.tx.select().from(simulatedCheckouts).where(and(eq(simulatedCheckouts.id, id), eq(simulatedCheckouts.datasetId, ctx.datasetId))).for('update');
  if (!c || c.clientId !== a.clientId) throw notFound();
  return { c, a };
}

const resolvedError = (c: Checkout) => conflict('CHECKOUT_ALREADY_RESOLVED', c.status === 'succeeded'
  ? 'This demo purchase was already completed. No further credits were added.'
  : `This checkout was ${c.status}. Start a new checkout to try again.`, { status: c.status });

export async function simulateSuccess(ctx: Ctx, id: string) {
  const { c, a } = await lockOwn(ctx, id);
  // A repeat of a completed success (reload, double click, retry) returns the same result and posts nothing.
  if (c.status === 'succeeded') return c;
  if (c.status !== 'open') throw resolvedError(c);
  // Lock order as elsewhere: contracts, then wallet.
  await ctx.tx.select({ id: contracts.id }).from(contracts).where(eq(contracts.clientId, c.clientId)).for('update');
  const contract = await requireActiveContract(ctx, c.clientId, false);
  if (contract.id !== c.contractId) throw conflict('CHECKOUT_CONTRACT_CHANGED', 'Your contract changed since this checkout was opened. Start a new checkout.');
  const walletId = await lockWallet(ctx, c.clientId);
  const tx = await insertTransaction(ctx, {
    walletId, clientId: c.clientId, contractId: c.contractId, type: 'simulated_purchase', deltaUnits: BigInt(c.units), ratePence: c.ratePence, deltaPence: BigInt(c.totalPence),
    idempotencyKey: `checkout:${c.id}`, reason: 'Simulated purchase (demo only, no money charged)',
  });
  const [done] = await ctx.tx.update(simulatedCheckouts).set({ status: 'succeeded', transactionId: tx.id, resolvedAt: ctx.now, resolvedByUserId: a.userId, updatedAt: new Date(), rowVersion: c.rowVersion + 1 }).where(eq(simulatedCheckouts.id, c.id)).returning();
  await logActivity(ctx, { subjectType: 'checkout', subjectId: c.id, action: 'checkout.simulated_success', clientId: c.clientId, metadata: { transactionId: tx.id, units: c.units.toString() } });
  const [cl] = await ctx.tx.select({ consultant: clients.consultantUserId }).from(clients).where(eq(clients.id, c.clientId));
  if (cl?.consultant) await notify(ctx, [cl.consultant], { type: 'system', subjectRefType: 'client', subjectRefId: c.clientId, safeTitle: 'A client completed a simulated credit purchase (demo, no money charged)' });
  return done;
}

async function close(ctx: Ctx, id: string, to: 'declined' | 'cancelled') {
  const { c, a } = await lockOwn(ctx, id);
  if (c.status === to) return c;
  if (c.status !== 'open') throw resolvedError(c);
  const [done] = await ctx.tx.update(simulatedCheckouts).set({ status: to, resolvedAt: ctx.now, resolvedByUserId: a.userId, updatedAt: new Date(), rowVersion: c.rowVersion + 1 }).where(eq(simulatedCheckouts.id, c.id)).returning();
  await logActivity(ctx, { subjectType: 'checkout', subjectId: c.id, action: `checkout.simulated_${to === 'declined' ? 'decline' : 'cancel'}`, clientId: c.clientId });
  return done;
}

export const simulateDecline = (ctx: Ctx, id: string) => close(ctx, id, 'declined');
export const cancelCheckout = (ctx: Ctx, id: string) => close(ctx, id, 'cancelled');

/** Read model for the checkout page. */
export async function checkoutView(ctx: Ctx, clientId: string, id: string) {
  if (!isUuid(id)) throw notFound();
  const [c] = await ctx.tx.select().from(simulatedCheckouts).where(and(eq(simulatedCheckouts.id, id), eq(simulatedCheckouts.datasetId, ctx.datasetId)));
  if (!c || c.clientId !== clientId) throw notFound();
  const wallet = await getWallet(ctx, clientId);
  const b = wallet ? await balances(ctx, wallet.id) : { posted: 0n, held: 0n, spendable: 0n };
  return { checkout: c, balances: b };
}

export async function recentCheckouts(ctx: Ctx, clientId: string, limit = 5) {
  return ctx.tx.select().from(simulatedCheckouts).where(eq(simulatedCheckouts.clientId, clientId)).orderBy(desc(simulatedCheckouts.createdAt)).limit(limit);
}
