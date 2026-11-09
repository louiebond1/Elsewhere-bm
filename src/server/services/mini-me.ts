import 'server-only';
import { and, eq, inArray, max } from 'drizzle-orm';
import { onboardingAnswers, matches, roles } from '../db/schema';
import type { Ctx } from './context';
import { inferTags } from '../../lib/tags';
import { ONBOARDING_QUESTIONS } from '../../config/onboarding';

/** Practical details are for matching filters, not for interview answers. */
const NOT_FOR_INTERVIEWS = new Set(['why_move', 'salary', 'notice', 'location', 'work_mode', 'hours', 'right_to_work', 'gaps', 'not_interested', 'deal_breakers', 'questions_for_employers', 'employment_status']);
const QUESTION = new Map(ONBOARDING_QUESTIONS.map((q) => [q.key, q.text]));

/**
 * The candidate's approved mini-me answers, as material for their simulated interviews. Only what they
 * approved; identifying details are still caught when each interview is stored.
 */
export async function miniMeEvidence(ctx: Pick<Ctx, 'tx'>, candidateId: string) {
  const rows = await ctx.tx.select().from(onboardingAnswers).where(and(eq(onboardingAnswers.candidateId, candidateId), eq(onboardingAnswers.status, 'approved')));
  return rows.filter((r) => !NOT_FOR_INTERVIEWS.has(r.questionKey)).map((r) => {
    const about = r.questionText ?? QUESTION.get(r.questionKey) ?? '';
    return { id: `mm:${r.questionKey}`, safeClaim: r.answer.slice(0, 900), tags: inferTags(`${about} ${r.answer}`), strength: 'partial' };
  });
}

/** When each candidate last approved something in their mini-me, so their interviews can be redone. */
export async function miniMeUpdatedAt(ctx: Pick<Ctx, 'tx'>, candidateIds: string[]) {
  if (!candidateIds.length) return new Map<string, Date>();
  const rows = await ctx.tx.select({ c: onboardingAnswers.candidateId, at: max(onboardingAnswers.approvedAt) }).from(onboardingAnswers).where(and(inArray(onboardingAnswers.candidateId, candidateIds), eq(onboardingAnswers.status, 'approved'))).groupBy(onboardingAnswers.candidateId);
  return new Map(rows.filter((r) => r.at).map((r) => [r.c, r.at as Date]));
}

/** After they approve something: re-run their interviews for every live job they're matched to. */
export async function refreshInterviews(ctx: Ctx, candidateId: string) {
  const { requestSimulations } = await import('./simulation');
  const live = await ctx.tx.select({ roleId: matches.roleId }).from(matches).innerJoin(roles, eq(roles.id, matches.roleId)).where(and(eq(matches.candidateId, candidateId), eq(roles.status, 'open')));
  for (const r of live) await requestSimulations(ctx, r.roleId);
  return live.length;
}
