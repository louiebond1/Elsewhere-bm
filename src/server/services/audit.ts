import { and, eq, inArray } from 'drizzle-orm';
import { activityEvents, clientMemberships, notifications, users } from '../db/schema';
import { actorUserId, type Ctx } from './context';
import { queueEmails } from '../email';

type Meta = Record<string, string | number | boolean | null>;

/** Activity metadata holds codes, amounts and opaque references only. Never names or transcripts. */
export async function logActivity(ctx: Ctx, e: { subjectType: string; subjectId: string; action: string; clientId?: string | null; metadata?: Meta }) {
  await ctx.tx.insert(activityEvents).values({
    datasetId: ctx.datasetId,
    actorUserId: actorUserId(ctx.actor),
    clientId: e.clientId ?? null,
    subjectType: e.subjectType,
    subjectId: e.subjectId,
    action: e.action,
    metadata: e.metadata ?? {},
    operationId: ctx.operationId,
    eventAt: ctx.now,
  });
}

type NotificationType = (typeof notifications.$inferInsert)['type'];

/** Notification titles must never contain a candidate name. Names resolve at read time. */
export async function notify(ctx: Ctx, recipientUserIds: string[], n: { type: NotificationType; subjectRefType: string; subjectRefId: string; safeTitle: string }) {
  const ids = [...new Set(recipientUserIds)];
  if (!ids.length) return;
  await ctx.tx.insert(notifications).values(ids.map((r) => ({ datasetId: ctx.datasetId, recipientUserId: r, ...n })));
  await queueEmails(ctx, ids, n);
}

export async function clientUserIds(ctx: Ctx, clientId: string): Promise<string[]> {
  const rows = await ctx.tx.select({ id: clientMemberships.userId }).from(clientMemberships).innerJoin(users, eq(users.id, clientMemberships.userId)).where(and(eq(clientMemberships.clientId, clientId), eq(users.status, 'active')));
  return rows.map((r) => r.id);
}

export async function consultantUserIds(ctx: Ctx): Promise<string[]> {
  const rows = await ctx.tx.select({ id: users.id }).from(users).where(and(eq(users.datasetId, ctx.datasetId), eq(users.userType, 'consultant'), eq(users.status, 'active')));
  return rows.map((r) => r.id);
}

export async function usersByIds(ctx: Ctx, ids: string[]) {
  if (!ids.length) return [];
  return ctx.tx.select().from(users).where(inArray(users.id, ids));
}
