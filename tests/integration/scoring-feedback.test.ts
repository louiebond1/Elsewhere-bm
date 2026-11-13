import { describe, it, expect, afterEach } from 'vitest';
import { eq } from 'drizzle-orm';
import { load } from './helpers';
import { db } from '../../src/server/db/client';
import * as S from '../../src/server/db/schema';
import { readCtx } from '../../src/server/services/context';
import { drainJobs } from '../../src/server/services/worker-handlers';
import { setProviderForTests } from '../../src/server/ai';
import { fixtureProvider } from '../../src/server/ai/providers/fixture';
import type { AiProvider, SimulationInput } from '../../src/server/ai/providers/types';
import { correctScore, choosePreference, preferencePair, guidanceFor } from '../../src/server/services/scoring-feedback';
import { simulationForCandidate } from '../../src/server/views/client';
import { roleScopedRef } from '../../src/server/dto/refs';

afterEach(() => setProviderForTests(null));
type W = Awaited<ReturnType<typeof load>>;
const usage = { inputTokens: 500, outputTokens: 200, cacheReadTokens: 0, cacheWriteTokens: 0, modelId: 'claude-haiku-5-5' };

async function firstInterview(w: W) {
  await drainJobs();
  const [sim] = await db().select().from(S.simulatedInterviews).where(eq(S.simulatedInterviews.roleId, w.ids.roles.R1));
  const answers = sim.answers as { kind: string; grounded: boolean; question: string; score: number | null }[];
  const qi = answers.findIndex((a) => a.kind === 'interview' && a.grounded);
  return { sim, qi, ref: roleScopedRef(w.ids.roles.R1, sim.candidateId), answers };
}

describe('humans can correct any score, and teach their taste; the AI follows it for everyone', () => {
  it('a hiring manager corrects one question; it shows on that answer, without changing the rubric', async () => {
    const w = await load();
    const { sim, qi, ref } = await firstInterview(w);
    const [before] = await db().select().from(S.roles).where(eq(S.roles.id, w.ids.roles.R1));
    await w.T(w.client('A'), (c) => correctScore(c, { roleId: w.ids.roles.R1, candidateRef: ref, questionIndex: qi, humanScore: 3, reason: 'No result given, just a task.' }));
    const [after] = await db().select().from(S.roles).where(eq(S.roles.id, w.ids.roles.R1));
    expect(after.guidanceVersion).toBe(before.guidanceVersion);
    const view = await simulationForCandidate(readCtx(w.client('A')), w.ids.roles.R1, sim.candidateId);
    expect(view!.answers[qi].human).toEqual({ score: 3, reason: 'No result given, just a task.' });
    // Every interview for this job is re-scored with the new guidance.
    await drainJobs();
    const all = await db().select().from(S.simulatedInterviews).where(eq(S.simulatedInterviews.roleId, w.ids.roles.R1));
    expect(all.length).toBeGreaterThan(1);
    for (const s of all) expect(s.guidanceVersion).toBe(after.guidanceVersion);
    expect(await guidanceFor(readCtx(w.client('A')), after)).toEqual([]);
  });

  it('screening questions can’t be corrected, a reason is required, and another client can’t touch this job', async () => {
    const w = await load();
    const { qi, ref, answers } = await firstInterview(w);
    const screening = answers.findIndex((a) => a.kind === 'screening');
    await expect(w.T(w.client('A'), (c) => correctScore(c, { roleId: w.ids.roles.R1, candidateRef: ref, questionIndex: screening, humanScore: 5, reason: 'x x x' }))).rejects.toThrow(/aren’t scored/);
    await expect(w.T(w.client('A'), (c) => correctScore(c, { roleId: w.ids.roles.R1, candidateRef: ref, questionIndex: qi, humanScore: 5, reason: '' }))).rejects.toThrow();
    await expect(w.T(w.client('B'), (c) => correctScore(c, { roleId: w.ids.roles.R1, candidateRef: ref, questionIndex: qi, humanScore: 5, reason: 'Not mine.' }))).rejects.toThrow();
    // BondMoran can.
    await w.T(w.consultant(), (c) => correctScore(c, { roleId: w.ids.roles.R1, candidateRef: ref, questionIndex: qi, humanScore: 8, reason: 'Undersold: a clear result.' }));
  });

  it('unapproved corrections never become global AI guidance', async () => {
    const w = await load();
    const { qi, ref } = await firstInterview(w);
    const seen: SimulationInput[] = [];
    setProviderForTests({ ...fixtureProvider, name: 'anthropic', simulateInterview: async (i) => { seen.push(i); return { provider: 'anthropic', usage, output: { answers: [], fitScore: 50, summary: 'Stand-in.', concerns: [] } }; } } as AiProvider);
    await w.T(w.client('A'), (c) => correctScore(c, { roleId: w.ids.roles.R1, candidateRef: ref, questionIndex: qi, humanScore: 2, reason: 'Too vague for this job.' }));
    await drainJobs();
    const r1 = seen.filter((i) => (i.role as { hiring_manager_guidance?: string[] }).hiring_manager_guidance?.some((g) => g.includes('Too vague for this job.')));
    expect(r1).toHaveLength(0);
  });

  it('teach it your taste: a pair of real answers, the choice saved, the pair not offered again, live rankings unchanged', async () => {
    const w = await load();
    await drainJobs();
    const pair = await preferencePair(readCtx(w.client('A')));
    expect(pair).not.toBeNull();
    expect(pair!.a.text).not.toBe(pair!.b.text);
    const live = await db().select().from(S.roles).where(eq(S.roles.clientId, w.ids.clients.A));
    await w.T(w.client('A'), (c) => choosePreference(c, { roleId: pair!.roleId, questionIndex: pair!.questionIndex, preferredId: pair!.a.id, otherId: pair!.b.id, reason: 'Shows a real result.' }));
    const fb = await db().select().from(S.scoringFeedback).where(eq(S.scoringFeedback.kind, 'preference'));
    expect(fb).toHaveLength(1);
    expect(fb[0]).toMatchObject({ answer: pair!.a.text, otherAnswer: pair!.b.text, reason: 'Shows a real result.' });
    const after = await db().select().from(S.roles).where(eq(S.roles.clientId, w.ids.clients.A));
    for (const r of after.filter((x) => x.status === 'open')) expect(r.guidanceVersion).toBe(live.find((l) => l.id === r.id)!.guidanceVersion);
    // Another client can't use this client's interviews.
    await expect(w.T(w.client('B'), (c) => choosePreference(c, { roleId: pair!.roleId, questionIndex: pair!.questionIndex, preferredId: pair!.a.id, otherId: pair!.b.id }))).rejects.toThrow();
    const next = await preferencePair(readCtx(w.client('A')));
    if (next) expect(`${next.question}|${[next.a.text, next.b.text].sort().join('|')}`).not.toBe(`${pair!.question}|${[pair!.a.text, pair!.b.text].sort().join('|')}`);
  });
});
