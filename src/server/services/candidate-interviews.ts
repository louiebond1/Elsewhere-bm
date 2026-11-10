import 'server-only';
import { and, desc, eq } from 'drizzle-orm';
import { simulatedInterviews, roles } from '../db/schema';
import { requireUser, type Ctx } from './context';
import { notFound } from '../lib/errors';
import { NOT_SHARED, EDIT_WINDOW_MS } from './simulation';

const me = (ctx: Ctx) => (requireUser(ctx.actor, 'candidate') as { candidateId?: string }).candidateId ?? '';

/**
 * The candidate's own view of interviews their mini-me has done: which job (title, place, how it's
 * worked; never the employer's name), when, the questions and the answers given. No score or rating.
 */
export async function myInterviews(ctx: Ctx) {
  const rows = await ctx.tx.select({ s: simulatedInterviews, title: roles.title, region: roles.locationRegion, mode: roles.workMode })
    .from(simulatedInterviews).innerJoin(roles, eq(roles.id, simulatedInterviews.roleId))
    .where(eq(simulatedInterviews.candidateId, me(ctx))).orderBy(desc(simulatedInterviews.updatedAt));
  return rows.map((r) => {
    const answers = r.s.answers as { question: string; answer: string; grounded: boolean }[];
    const deadline = r.s.createdAt.getTime() + EDIT_WINDOW_MS;
    return { roleId: r.s.roleId, title: r.title, region: r.region, mode: r.mode, at: r.s.createdAt.toISOString(), asked: answers.length, gaps: answers.filter((a) => !a.grounded).length, deadline: new Date(deadline).toISOString(), open: Date.now() < deadline };
  });
}

export async function myInterview(ctx: Ctx, roleId: string) {
  const [r] = await ctx.tx.select({ s: simulatedInterviews, title: roles.title, region: roles.locationRegion, mode: roles.workMode })
    .from(simulatedInterviews).innerJoin(roles, eq(roles.id, simulatedInterviews.roleId))
    .where(and(eq(simulatedInterviews.candidateId, me(ctx)), eq(simulatedInterviews.roleId, roleId)));
  if (!r) throw notFound();
  const answers = (r.s.answers as { question: string; answer: string; grounded: boolean; key?: string | null; kind?: 'interview' | 'screening' }[])
    .map((a) => ({ question: a.question, answer: a.grounded ? a.answer : null, key: a.key ?? null, kind: a.kind ?? 'interview' }));
  const deadline = r.s.createdAt.getTime() + EDIT_WINDOW_MS;
  return { roleId, title: r.title, region: r.region, mode: r.mode, at: r.s.createdAt.toISOString(), updatedAt: r.s.updatedAt.toISOString(), answers, notShared: NOT_SHARED, deadline: new Date(deadline).toISOString(), open: Date.now() < deadline };
}
