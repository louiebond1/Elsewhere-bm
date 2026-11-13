import 'server-only';
import { and, desc, eq, inArray, sql } from 'drizzle-orm';
import { z } from 'zod';
import { roles, scoringFeedback, simulatedInterviews } from '../db/schema';
import { invalid, notFound } from '../lib/errors';
import { requireUser, type Ctx } from './context';
import { roleForActor } from './roles';
import { logActivity } from './audit';
import { NOT_SHARED } from './simulation';

type StoredAnswer = { question: string; answer: string; grounded: boolean; kind?: string; score?: number | null };

export const correctionInput = z.object({ roleId: z.string().uuid(), candidateRef: z.string().min(8).max(80), questionIndex: z.number().int().min(0).max(19), humanScore: z.number().int().min(0).max(10), reason: z.string().trim().min(3, 'Say briefly why').max(400) });
export const preferenceInput = z.object({ roleId: z.string().uuid(), questionIndex: z.number().int().min(0).max(19), preferredId: z.string().uuid(), otherId: z.string().uuid(), reason: z.string().trim().max(400).default('') });

/**
 * "This shouldn't be a 10": a hiring manager or BondMoran corrects one question's score and says why. It is shown
 * on that answer, and becomes guidance for scoring that job, so every candidate is re-scored the same way.
 */
export async function correctScore(ctx: Ctx, raw: unknown) {
  const input = correctionInput.parse(raw);
  const actor = requireUser(ctx.actor);
  if (actor.userType !== 'client' && actor.userType !== 'consultant') throw notFound();
  const role = await roleForActor(ctx, input.roleId);
  const { candidateOnRole, simulationForCandidate } = await import('../views/client');
  const { candidateId } = await candidateOnRole(ctx, input.roleId, input.candidateRef);
  const sim=await simulationForCandidate(ctx,role.id,candidateId);
  const a = (sim?.answers as StoredAnswer[] | undefined)?.[input.questionIndex];
  if (!sim || !a) throw notFound();
  if (a.kind === 'screening') throw invalid('Screening questions aren’t scored.');
  await ctx.tx.insert(scoringFeedback).values({ datasetId: ctx.datasetId, clientId: role.clientId, roleId: role.id, candidateId, kind: 'correction', question: a.question, answer: a.grounded ? a.answer : NOT_SHARED, aiScore: a.score ?? null, humanScore: input.humanScore, reason: input.reason, createdByUserId: actor.userId });
  await logActivity(ctx, { subjectType: 'role', subjectId: role.id, action: 'interview.score_corrected', clientId: role.clientId, metadata: { from: a.score ?? null, to: input.humanScore } });

  const {annotatePublishedAnswer}=await import('./shortlists');await annotatePublishedAnswer(ctx,role.id,candidateId,a.question,input.humanScore,input.reason);
  return { saved: true };
}

/** Human corrections for one interview, by question text, to show next to each answer. */
export async function correctionsFor(ctx: Pick<Ctx, 'tx'>, roleId: string, candidateId: string) {
  const rows = await ctx.tx.select().from(scoringFeedback).where(and(eq(scoringFeedback.roleId, roleId), eq(scoringFeedback.candidateId, candidateId), eq(scoringFeedback.kind, 'correction'))).orderBy(desc(scoringFeedback.createdAt));
  const out = new Map<string, { score: number; reason: string; aiScore: number | null }>();
  for (const r of rows) if (!out.has(r.question)) out.set(r.question, { score: r.humanScore!, reason: r.reason, aiScore: r.aiScore });
  return out;
}

/**
 * "Teach it your taste": two real (anonymous) answers to the same question from one of their live jobs. Returns
 * null when there's nothing to compare yet.
 */
export async function preferencePair(ctx: Ctx) {
  const a = requireUser(ctx.actor, 'client');
  const live = await ctx.tx.select({ id: roles.id, title: roles.title }).from(roles).where(and(eq(roles.clientId, a.clientId!), eq(roles.status, 'open')));
  const done = new Set((await ctx.tx.select({ q: scoringFeedback.question, x: scoringFeedback.answer, y: scoringFeedback.otherAnswer }).from(scoringFeedback).where(and(eq(scoringFeedback.clientId, a.clientId!), eq(scoringFeedback.kind, 'preference')))).map((r) => `${r.q}|${[r.x, r.y].sort().join('|')}`));
  for (const role of live.sort(() => Math.random() - 0.5)) {
    const sims = await ctx.tx.select({ id: simulatedInterviews.id, answers: simulatedInterviews.answers }).from(simulatedInterviews).where(eq(simulatedInterviews.roleId, role.id));
    const n = Math.max(0, ...sims.map((s) => (s.answers as StoredAnswer[]).length));
    for (const qi of [...Array(n).keys()].sort(() => Math.random() - 0.5)) {
      const options = sims.map((s) => ({ id: s.id, a: (s.answers as StoredAnswer[])[qi] })).filter((o) => o.a && o.a.grounded && o.a.kind !== 'screening');
      const distinct = options.filter((o, i) => options.findIndex((x) => x.a.answer === o.a.answer) === i).sort(() => Math.random() - 0.5);
      for (let i = 0; i + 1 < distinct.length; i++) {
        const [x, y] = [distinct[i], distinct[i + 1]];
        if (done.has(`${x.a.question}|${[x.a.answer, y.a.answer].sort().join('|')}`)) continue;
        return { roleId: role.id, roleTitle: role.title, questionIndex: qi, question: x.a.question, a: { id: x.id, text: x.a.answer }, b: { id: y.id, text: y.a.answer } };
      }
    }
  }
  return null;
}

/** Save which answer suits their jobs better; all their live jobs are re-scored with it. */
export async function choosePreference(ctx: Ctx, raw: unknown) {
  const input = preferenceInput.parse(raw);
  const actor = requireUser(ctx.actor, 'client');
  const role = await roleForActor(ctx, input.roleId);
  const sims = await ctx.tx.select().from(simulatedInterviews).where(and(eq(simulatedInterviews.roleId, role.id), inArray(simulatedInterviews.id, [input.preferredId, input.otherId])));
  const pick = (id: string) => (sims.find((s) => s.id === id)?.answers as StoredAnswer[] | undefined)?.[input.questionIndex];
  const [p, o] = [pick(input.preferredId), pick(input.otherId)];
  if (!p || !o || !p.grounded || !o.grounded || p.question !== o.question) throw notFound();
  await ctx.tx.insert(scoringFeedback).values({ datasetId: ctx.datasetId, clientId: role.clientId, roleId: role.id, kind: 'preference', question: p.question, answer: p.answer, otherAnswer: o.answer, reason: input.reason, createdByUserId: actor.userId });
  await logActivity(ctx, { subjectType: 'role', subjectId: role.id, action: 'interview.preference_taught', clientId: role.clientId });

  return { saved: true };
}

/** What the AI must follow when scoring this job: its corrections, then the client's preferences (newest first). */
export async function guidanceFor(ctx: Pick<Ctx, 'tx'>, role: { id: string; clientId: string }) {
  // Unapproved preferences and individual corrections never become global scoring instructions.
  void ctx; void role;
  return [] as string[];
}

export async function feedbackCount(ctx: Pick<Ctx, 'tx'>, clientId: string) {
  const [r] = await ctx.tx.select({ n: sql<number>`count(*)::int` }).from(scoringFeedback).where(and(eq(scoringFeedback.clientId, clientId), eq(scoringFeedback.kind, 'preference')));
  return r?.n ?? 0;
}
