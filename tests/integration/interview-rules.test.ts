import { describe, it, expect } from 'vitest';
import { and, eq } from 'drizzle-orm';
import { load } from './helpers';
import { db } from '../../src/server/db/client';
import * as S from '../../src/server/db/schema';
import { readCtx, type BaseCtx } from '../../src/server/services/context';
import { drainJobs } from '../../src/server/services/worker-handlers';
import { signupCandidate, updatePreferences } from '../../src/server/services/candidates';
import { saveOwnAnswer } from '../../src/server/services/onboarding';
import { addMustHave } from '../../src/server/services/roles';
import { interviewTouched, scoreCardFor, interviewQuestions, type ScoreCard } from '../../src/server/services/simulation';
import { bestPeople, roleMatches, simulationForCandidate } from '../../src/server/views/client';
import { roleScopedRef } from '../../src/server/dto/refs';

type W = Awaited<ReturnType<typeof load>>;
async function newCandidate(w: W, email: string) {
  const r = await w.T(w.consultant(), (c) => signupCandidate(c, { fullName: 'Ada Stone', email, password: 'long-enough-pw', region: 'london', workModes: ['hybrid'], roleFamilies: ['finance'], acceptTerms: true, acceptAi: true, wantsDiscovery: true, preferencesConfirmed: false }));
  const me: BaseCtx = { ...w.consultant(), actor: { kind: 'user', userId: r.user.id, userType: 'candidate', candidateId: r.candidate.id } };
  return { id: r.candidate.id, me };
}
const simOf = async (roleId: string, candidateId: string) => (await db().select().from(S.simulatedInterviews).where(and(eq(S.simulatedInterviews.roleId, roleId), eq(S.simulatedInterviews.candidateId, candidateId))))[0];

describe('everyone eligible is interviewed for every live job, re-interviewed only when it matters, and ranked', () => {
  it('someone who signs up is interviewed for live jobs without anyone opening the job page', async () => {
    const w = await load();
    const { id } = await newCandidate(w, 'ada@joins-later.test');
    await drainJobs();
    const sim = await simOf(w.ids.roles.R1, id);
    expect(sim).toBeTruthy();
    expect(sim.scoreCard).toBeTruthy();
    expect((sim.answers as unknown[]).length).toBeGreaterThanOrEqual(11);
  });

  it('a must-have added to a live job rules people in or out without re-interviewing anyone or changing the job', async () => {
    const w = await load();
    const { id, me } = await newCandidate(w, 'ada@must-have.test');
    await drainJobs();
    const [before] = await db().select().from(S.roles).where(eq(S.roles.id, w.ids.roles.R1));
    const other = (await db().select().from(S.simulatedInterviews).where(eq(S.simulatedInterviews.roleId, w.ids.roles.R1))).find((s) => s.candidateId !== id)!;
    await w.T(me, (c) => updatePreferences(c, { region: 'london', workModes: ['hybrid'], roleFamilies: ['finance'], minSalaryPounds: null, noticeWeeks: null, workAuthorisation: 'confirmed', experienceBand: 'unknown', over18: false }));
    await w.T(w.client('A'), (c) => addMustHave(c, w.ids.roles.R1, 'requires18'));
    await drainJobs();
    const [after] = await db().select().from(S.roles).where(eq(S.roles.id, w.ids.roles.R1));
    expect(after.requires18).toBe(true);
    expect(after.roleVersion).toBe(before.roleVersion);
    const view = JSON.stringify(await roleMatches(readCtx(w.client('A')), w.ids.roles.R1));
    expect(view).not.toContain(roleScopedRef(w.ids.roles.R1, id));
    const otherAfter = await simOf(w.ids.roles.R1, other.candidateId);
    expect(otherAfter.updatedAt.getTime()).toBe(other.updatedAt.getTime());
  });

  it('a mini-me change re-runs an interview only if it touches what decided it, and only within 24 hours', async () => {
    const card: ScoreCard = { factors: { keys: ['current_role'], tags: ['reconciliations'], itemIds: ['mm:current_role'] }, gaps: { keys: ['notice'], tags: ['reporting'], anyExample: false } };
    const sim = { updatedAt: new Date('2026-11-10T10:00:00Z'), scoreCard: card, answers: [{ question: 'Tell me about a time you worked on clear reporting. What did you do, and what happened?' }] };
    const later = new Date('2026-11-10T11:00:00Z');
    const base = { key: 'current_role', topic: 'What do you do now?', answer: 'Assistant accountant.', updatedAt: new Date('2026-11-10T09:00:00Z') };
    const t = (items: { key: string; topic: string | null; answer: string; updatedAt: Date }[]) => interviewTouched(sim, items);
    expect(t([base])).toBe(false); // nothing changed since
    expect(t([{ ...base, updatedAt: later }])).toBe(true); // an item it used changed
    expect(t([base, { key: 'notice', topic: null, answer: '4 weeks', updatedAt: later }])).toBe(true); // fills a gap
    expect(t([base, { key: 'extra:abc', topic: 'Weekend football', answer: 'I play five-a-side.', updatedAt: later }])).toBe(false); // unrelated
    expect(t([base, { key: 'extra:def', topic: 'Reports', answer: 'I wrote the monthly report pack.', updatedAt: later }])).toBe(true); // a gap's skill
    expect(t([])).toBe(true); // an item it used was removed
    expect(t([base, { key: 'salary', topic: null, answer: '40k', updatedAt: later }])).toBe(false); // practical, not one of its questions
    // Interviews stored before score cards: any change counts.
    expect(interviewTouched({ ...sim, scoreCard: null }, [{ ...base, updatedAt: later }])).toBe(true);
  });

  it('within 24 hours, an unrelated change does not re-run the interview; a related one does', async () => {
    const w = await load();
    const { id, me } = await newCandidate(w, 'ada@reruns.test');
    await drainJobs();
    const first = await simOf(w.ids.roles.R1, id);
    // Unrelated: their working hours (a practical detail no interview question asks about).
    await w.T(me, (c) => saveOwnAnswer(c, 'hours', 'Full-time, flexible start times.'));
    await drainJobs();
    expect((await simOf(w.ids.roles.R1, id)).updatedAt.getTime()).toBe(first.updatedAt.getTime());
    // Related: their current duties cover the job's reconciliation criterion.
    await w.T(me, (c) => saveOwnAnswer(c, 'current_duties', 'I own the weekly bank reconciliation and built a spreadsheet check that halved unmatched items.'));
    await drainJobs();
    const again = await simOf(w.ids.roles.R1, id);
    expect(again.updatedAt.getTime()).toBeGreaterThan(first.updatedAt.getTime());
    expect(again.fitScore).toBeGreaterThan(first.fitScore);
  });

  it('clients see everyone ranked by interview, with a score and reason per question; screening is not scored', async () => {
    const w = await load();
    await newCandidate(w, 'ada@ranked.test');
    await drainJobs();
    const { best, rest } = await bestPeople(readCtx(w.client('A')), w.ids.roles.R1, 50);
    expect(best.length).toBeGreaterThan(1);
    for (let i = 1; i < best.length; i++) expect(best[i - 1].sim.fitScore).toBeGreaterThanOrEqual(best[i].sim.fitScore);
    expect(rest).toHaveLength(0); // everyone eligible has been interviewed
    const one = best[0].sim;
    for (const a of one.answers) {
      if (a.kind === 'screening') expect(a.score).toBeNull();
      else { expect(a.score).toEqual(expect.any(Number)); expect(a.reason).toBeTruthy(); }
    }
    const cid = (await db().select().from(S.simulatedInterviews).where(eq(S.simulatedInterviews.roleId, w.ids.roles.R1)))[0].candidateId;
    expect((await simulationForCandidate(readCtx(w.client('A')), w.ids.roles.R1, cid))?.answers[0]).toHaveProperty('score');
  });

  it('the score card records what each answer drew on and what was missing', () => {
    const crit = [{ id: 'c1', label: 'Reconciliation ownership', weight: 5, ordinal: 1, evidenceTags: ['reconciliations'], description: '', criterionKey: 'rec' }] as unknown as Parameters<typeof interviewQuestions>[1];
    const qs = interviewQuestions({ title: 'Assistant Accountant', outcomes: [] }, crit);
    const answers = qs.map((q, i) => ({ question: q.text, answer: i === 0 ? 'x' : 'n', evidenceIds: i === 0 ? ['mm:current_duties'] : [], grounded: i === 0, key: q.key, kind: q.kind }));
    const card = scoreCardFor(qs, answers);
    expect(card.factors).toMatchObject({ tags: ['reconciliations'], itemIds: ['mm:current_duties'] });
    expect(card.gaps.keys).toEqual(expect.arrayContaining(['notice', 'salary', 'work_mode', 'right_to_work']));
    expect(card.gaps.anyExample).toBe(true);
  });
});
