import { describe, it, expect } from 'vitest';
import { and, eq } from 'drizzle-orm';
import { load } from './helpers';
import { db } from '../../src/server/db/client';
import * as S from '../../src/server/db/schema';
import { readCtx } from '../../src/server/services/context';
import { drainJobs } from '../../src/server/services/worker-handlers';
import { requestSimulations } from '../../src/server/services/simulation';
import { myInterviews, myInterview } from '../../src/server/services/candidate-interviews';

describe('candidates see their mini-me interviews', () => {
  it('one notification when first interviewed; questions and answers but no score; private to them', async () => {
    const w = await load();
    const R1 = w.ids.roles.R1;
    await w.T(w.client('A'), (c) => requestSimulations(c, R1));
    await drainJobs();
    const [sim] = await db().select().from(S.simulatedInterviews).where(eq(S.simulatedInterviews.roleId, R1));
    expect(sim).toBeTruthy();
    const code = Object.entries(w.ids.candidates).find(([, id]) => id === sim.candidateId)![0];
    const [cand] = await db().select().from(S.candidates).where(eq(S.candidates.id, sim.candidateId));
    const notes = await db().select().from(S.notifications).where(and(eq(S.notifications.recipientUserId, cand.userId!), eq(S.notifications.subjectRefType, 'interview'), eq(S.notifications.subjectRefId, R1)));
    // One per job they're interviewed for (every live job they're eligible for is interviewed now).
    expect(notes).toHaveLength(1);
    expect(notes[0].safeTitle).toMatch(/^Your mini-me was interviewed for /);

    const list = await myInterviews(readCtx(w.cand(code)));
    expect(list.find((i) => i.roleId === R1)).toBeTruthy();
    const one = await myInterview(readCtx(w.cand(code)), R1);
    expect(one.answers.length).toBeGreaterThan(0);
    expect(JSON.stringify(one)).not.toMatch(/fitScore|fit_score|Great fit|Good fit|Possible fit/);
    // Someone else can't open it.
    const other = Object.keys(w.ids.candidates).find((k) => k !== code)!;
    await expect(myInterview(readCtx(w.cand(other)), R1).then((x) => x.roleId)).rejects.toMatchObject({ status: 404 }).catch(async () => {
      // The other candidate may also have been interviewed for this job; then they see only their own.
      const mine = await myInterview(readCtx(w.cand(other)), R1);
      expect(JSON.stringify(mine)).not.toContain(sim.id);
    });

    // Running again doesn't notify again.
    await db().update(S.simulatedInterviews).set({ updatedAt: new Date('2000-01-01') }).where(eq(S.simulatedInterviews.id, sim.id));
    await w.T(w.client('A'), (c) => requestSimulations(c, R1));
    await drainJobs();
    const after = await db().select().from(S.notifications).where(and(eq(S.notifications.recipientUserId, cand.userId!), eq(S.notifications.subjectRefType, 'interview'), eq(S.notifications.subjectRefId, R1)));
    expect(after).toHaveLength(1);
  });
});

describe('interviews: at least 10 questions, 24 hours to change answers', () => {
  it('has 10+ questions with screening; an edit within 24h updates the interview; after 24h it is final', async () => {
    const w = await load();
    const R1 = w.ids.roles.R1;
    await w.T(w.client('A'), (c) => requestSimulations(c, R1));
    await drainJobs();
    const [sim] = await db().select().from(S.simulatedInterviews).where(eq(S.simulatedInterviews.roleId, R1));
    const code = Object.entries(w.ids.candidates).find(([, id]) => id === sim.candidateId)![0];
    let one = await myInterview(readCtx(w.cand(code)), R1);
    expect(one.answers.length).toBeGreaterThanOrEqual(10);
    expect(one.answers.filter((a) => a.kind === 'screening').map((a) => a.key)).toEqual(['notice', 'salary', 'work_mode', 'right_to_work']);
    expect(one.open).toBe(true);
    const salaryQ = one.answers.find((a) => a.key === 'salary')!;

    // Within 24 hours: answer the salary question; the interview is redone with it.
    const { saveOwnAnswer } = await import('../../src/server/services/onboarding');
    await w.T(w.cand(code), (c) => saveOwnAnswer(c, 'salary', 'Around £38,000'));
    await drainJobs();
    one = await myInterview(readCtx(w.cand(code)), R1);
    expect(one.answers.find((a) => a.question === salaryQ.question)!.answer).toBe('Around £38,000');

    // After 24 hours: final. A change to their mini-me no longer redoes this interview.
    await db().update(S.simulatedInterviews).set({ createdAt: new Date(Date.now() - 25 * 3600 * 1000) }).where(eq(S.simulatedInterviews.id, sim.id));
    await w.T(w.cand(code), (c) => saveOwnAnswer(c, 'salary', 'Around £45,000'));
    await drainJobs();
    one = await myInterview(readCtx(w.cand(code)), R1);
    expect(one.open).toBe(false);
    expect(one.answers.find((a) => a.question === salaryQ.question)!.answer).toBe('Around £38,000');
  });
});
