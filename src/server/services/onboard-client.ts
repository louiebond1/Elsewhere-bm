import 'server-only';
import { z } from 'zod';
import { and, eq } from 'drizzle-orm';
import * as S from '../db/schema';
import { requireUser, type Ctx } from './context';
import { AppError } from '../lib/errors';
import { logActivity } from './audit';
import { businessDate, createContractDraft, activateContract } from './contracts';
import { prototype } from '../../config/prototype';

export const onboardClientInput = z.object({
  companyName: z.string().trim().min(2, 'Enter the company name').max(120),
  contactName: z.string().trim().min(2, 'Enter their name').max(120),
  contactEmail: z.string().trim().toLowerCase().email('Enter a valid email').max(200),
  password: z.string().min(10, 'Use at least 10 characters').max(200),
  startingCredits: z.number().int('Use whole credits').min(0).max(100),
});

const addOneYear = (iso: string) => {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCFullYear(d.getUTCFullYear() + 1);
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
};

/**
 * BondMoran onboards a new client in one go: the company, their first hiring manager's login
 * (with the password the consultant chose), and a standard annual plan with starting credits,
 * so they can log in and start hiring straight away. Credits are simulated, never a payment.
 */
export async function onboardClient(ctx: Ctx, input: z.infer<typeof onboardClientInput>) {
  const me = requireUser(ctx.actor, 'consultant');
  const email = input.contactEmail.trim().toLowerCase();
  const [taken] = await ctx.tx.select({ id: S.users.id }).from(S.users).where(and(eq(S.users.datasetId, ctx.datasetId), eq(S.users.emailNormalized, email)));
  if (taken) throw new AppError('EMAIL_IN_USE', 409, 'That email already has an account.', { contactEmail: 'Already in use' });
  const [dup] = await ctx.tx.select({ id: S.organisationAliases.id }).from(S.organisationAliases).where(and(eq(S.organisationAliases.datasetId, ctx.datasetId), eq(S.organisationAliases.aliasNormalized, input.companyName.toLowerCase())));
  if (dup) throw new AppError('ORG_EXISTS', 409, 'A company with that name already exists.', { companyName: 'Already exists' });

  const [org] = await ctx.tx.insert(S.organisations).values({ datasetId: ctx.datasetId, legalName: input.companyName, displayName: input.companyName, isClient: true }).returning();
  await ctx.tx.insert(S.organisationAliases).values({ datasetId: ctx.datasetId, organisationId: org.id, aliasNormalized: input.companyName.toLowerCase(), aliasType: 'name' });
  const [cl] = await ctx.tx.insert(S.clients).values({ datasetId: ctx.datasetId, organisationId: org.id, consultantUserId: me.userId, contactName: input.contactName, contactEmail: email, status: 'onboarding' }).returning();
  await ctx.tx.insert(S.clientOnboarding).values({ datasetId: ctx.datasetId, clientId: cl.id });
  const argon2 = await import('argon2');
  const [u] = await ctx.tx.insert(S.users).values({ datasetId: ctx.datasetId, emailNormalized: email, passwordHash: await argon2.hash(input.password, { type: argon2.argon2id }), userType: 'client', displayName: input.contactName }).returning();
  await ctx.tx.insert(S.clientMemberships).values({ datasetId: ctx.datasetId, clientId: cl.id, userId: u.id, membershipRole: 'owner' });
  await ctx.tx.insert(S.wallets).values({ datasetId: ctx.datasetId, clientId: cl.id }).onConflictDoNothing();
  await logActivity(ctx, { subjectType: 'client', subjectId: cl.id, action: 'client.onboarded', clientId: cl.id });

  // A standard plan starting today, so the client can start a hire as soon as they log in.
  const start = businessDate(ctx);
  const draft = await createContractDraft(ctx, {
    clientId: cl.id, planType: 'annual', startDate: start, endDate: addOneYear(start),
    creditRatePounds: prototype.packCreditPence / 100, includedOpenRoles: 2,
    committedCredits: input.startingCredits, instalmentCount: 12, label: 'Starter plan',
  });
  await activateContract(ctx, draft.id);
  return { clientId: cl.id, email };
}
