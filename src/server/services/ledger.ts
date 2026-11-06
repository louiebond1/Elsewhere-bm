import { and, eq, sql, sum } from 'drizzle-orm';
import { creditHolds, creditTransactions, wallets, hireOrders } from '../db/schema';
import { conflict } from '../lib/errors';
import { penceForUnits, formatCredits } from '../lib/pricing';
import { actorUserId, type Ctx } from './context';

export type TxType = (typeof creditTransactions.$inferInsert)['type'];

export async function getWallet(ctx: Ctx, clientId: string) {
  const [w] = await ctx.tx.select().from(wallets).where(eq(wallets.clientId, clientId));
  return w ?? null;
}

export async function ensureWallet(ctx: Ctx, clientId: string) {
  const existing = await getWallet(ctx, clientId);
  if (existing) return existing;
  const [w] = await ctx.tx.insert(wallets).values({ datasetId: ctx.datasetId, clientId }).returning();
  return w;
}

/** Locks the wallet row. Callers must already hold any candidate/contract locks. */
export async function lockWallet(ctx: Ctx, clientId: string) {
  const r = await ctx.tx.execute(sql`select id from wallets where client_id = ${clientId} for update`);
  const id = (r.rows[0] as { id: string } | undefined)?.id;
  if (!id) throw conflict('NO_WALLET', 'This client has no credit wallet yet.');
  return id;
}

export async function postedBalance(ctx: Ctx, walletId: string): Promise<bigint> {
  const [r] = await ctx.tx.select({ s: sum(creditTransactions.deltaUnits) }).from(creditTransactions).where(eq(creditTransactions.walletId, walletId));
  return BigInt(r?.s ?? 0);
}

export async function activeHoldUnits(ctx: Ctx, walletId: string, excludeHoldId?: string): Promise<bigint> {
  const rows = await ctx.tx.select({ id: creditHolds.id, units: creditHolds.units }).from(creditHolds).where(and(eq(creditHolds.walletId, walletId), eq(creditHolds.status, 'active')));
  return rows.filter((r) => r.id !== excludeHoldId).reduce((a, r) => a + BigInt(r.units), 0n);
}

export async function balances(ctx: Ctx, walletId: string) {
  const posted = await postedBalance(ctx, walletId);
  const held = await activeHoldUnits(ctx, walletId);
  return { posted, held, spendable: posted - held };
}

export function shortfallError(needed: bigint, spendable: bigint) {
  const short = needed - spendable;
  return conflict('INSUFFICIENT_CREDITS', `You need ${formatCredits(short)} more credits for this action. Your current progress is saved.`, { neededUnits: needed.toString(), spendableUnits: spendable.toString(), shortUnits: short.toString() });
}

export async function insertTransaction(ctx: Ctx, t: {
  walletId: string; clientId: string; contractId: string; orderId?: string | null; roleId?: string | null; hireId?: string | null;
  type: TxType; deltaUnits: bigint; ratePence: number; deltaPence?: bigint; idempotencyKey: string; reason: string; reversalOfId?: string | null;
}) {
  if (t.type === 'grant' && t.deltaUnits <= 0n) throw new Error('grant must be positive');
  if (['deposit_debit', 'hire_balance_debit', 'second_hire_debit', 'outside_hire_debit'].includes(t.type) && t.deltaUnits >= 0n) throw new Error('debit must be negative');
  const before = await postedBalance(ctx, t.walletId);
  const deltaPence = t.deltaPence ?? (t.deltaUnits < 0n ? -penceForUnits(-t.deltaUnits, t.ratePence) : penceForUnits(t.deltaUnits, t.ratePence));
  const [row] = await ctx.tx.insert(creditTransactions).values({
    datasetId: ctx.datasetId,
    walletId: t.walletId,
    clientId: t.clientId,
    contractId: t.contractId,
    orderId: t.orderId ?? null,
    roleId: t.roleId ?? null,
    hireId: t.hireId ?? null,
    type: t.type,
    deltaUnits: t.deltaUnits,
    valuationRatePence: t.ratePence,
    deltaPence,
    actorUserId: actorUserId(ctx.actor),
    operationId: ctx.operationId,
    idempotencyKey: t.idempotencyKey,
    reversalOfId: t.reversalOfId ?? null,
    reason: t.reason,
    businessEventAt: ctx.now,
    balanceAfterUnits: before + t.deltaUnits,
  }).returning();
  await ctx.tx.update(wallets).set({ availableCachedUnits: before + t.deltaUnits, updatedAt: new Date() }).where(eq(wallets.id, t.walletId));
  return row;
}

/** Debits and reversals allocated to an order. */
export async function orderAllocations(ctx: Ctx, orderId: string) {
  const rows = await ctx.tx.select().from(creditTransactions).where(eq(creditTransactions.orderId, orderId));
  const debits = rows.filter((r) => r.type !== 'grant');
  const paidUnits = debits.reduce((a, r) => a - BigInt(r.deltaUnits), 0n);
  const paidPence = debits.reduce((a, r) => a - BigInt(r.deltaPence), 0n);
  const reversedIds = new Set(rows.filter((r) => r.reversalOfId).map((r) => r.reversalOfId));
  const depositPaid = rows.some((r) => r.type === 'deposit_debit' && !reversedIds.has(r.id));
  return { rows, paidUnits, paidPence, depositPaid };
}

export async function orderPaymentState(ctx: Ctx, order: typeof hireOrders.$inferSelect) {
  const a = await orderAllocations(ctx, order.id);
  const totalUnits = BigInt(order.totalUnits);
  const totalPence = BigInt(order.totalPence);
  return {
    ...a,
    totalUnits,
    totalPence,
    remainingUnits: totalUnits - a.paidUnits > 0n ? totalUnits - a.paidUnits : 0n,
    remainingPence: totalPence - a.paidPence > 0n ? totalPence - a.paidPence : 0n,
  };
}

/** Recomputes the cached balance from the ledger. Flags discrepancies rather than editing entries. */
export async function reconcileWallet(ctx: Ctx, walletId: string) {
  const posted = await postedBalance(ctx, walletId);
  const [w] = await ctx.tx.select().from(wallets).where(eq(wallets.id, walletId));
  const discrepancy = BigInt(w.availableCachedUnits) !== posted;
  const txs = await ctx.tx.select().from(creditTransactions).where(eq(creditTransactions.walletId, walletId)).orderBy(creditTransactions.seq);
  let running = 0n;
  let chainOk = true;
  for (const t of txs) {
    running += BigInt(t.deltaUnits);
    if (running !== BigInt(t.balanceAfterUnits)) chainOk = false;
  }
  await ctx.tx.update(wallets).set({ availableCachedUnits: posted, lastReconciledAt: new Date() }).where(eq(wallets.id, walletId));
  return { posted, discrepancy, chainOk };
}
