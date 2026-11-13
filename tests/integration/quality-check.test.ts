import { describe, it, expect, afterEach } from 'vitest';
import { eq } from 'drizzle-orm';
import { load } from './helpers';
import { db } from '../../src/server/db/client';
import * as S from '../../src/server/db/schema';
import { setProviderForTests } from '../../src/server/ai';
import { fixtureProvider } from '../../src/server/ai/providers/fixture';
import type { AiProvider } from '../../src/server/ai/providers/types';
import { drainJobs } from '../../src/server/services/worker-handlers';
import { enqueue } from '../../src/server/services/jobs';
import { withTx } from '../../src/server/services/context';
import { buildPlan, startQualityRun, qualityReport, CHUNK, type ResultItem } from '../../src/server/eval/quality';
import { EVAL_JOBS } from '../../src/server/eval/interview-set';

afterEach(() => setProviderForTests(null));
const usage = { inputTokens: 500, outputTokens: 200, cacheReadTokens: 0, cacheWriteTokens: 0, modelId: 'claude-haiku-5-5' };
// A stand-in AI that scores by how many distinct skills the examples show: deterministic, ignores irrelevant facts.
const standIn: AiProvider = { ...fixtureProvider, name: 'anthropic', assessCriteria: async (i) => ({ ...await fixtureProvider.assessCriteria(i), provider: 'anthropic', usage }), simulateInterview: async (i) => {
  const tags = new Set(i.examples.flatMap((e) => e.tags));
  return { provider: 'anthropic', usage, output: { answers: i.questions.map((q, n) => ({ questionIndex: n, answer: q.fixed_answer ?? "I haven't shared an example of this yet.", evidenceIds: q.fixed_ids ?? [], score: q.screening ? null : 5, reason: 'Stand-in.' })), fitScore: Math.min(100, tags.size * 15), summary: 'Stand-in.', concerns: [] } };
} };

describe('interview quality check', () => {
  it('answers fixed from their own words keep their words when the AI returns them empty (it only scores them)', async () => {
    const { runInterview, interviewQuestions } = await import('../../src/server/services/simulation');
    setProviderForTests({ ...fixtureProvider, name: 'anthropic', simulateInterview: async (i) => ({ provider: 'anthropic', usage, output: { answers: i.questions.map((q, n) => ({ questionIndex: n, answer: q.fixed_answer ? '' : 'Generated.', evidenceIds: q.fixed_ids ?? [], score: q.screening ? null : 6, reason: 'r' })), fitScore: 70, summary: 's', concerns: [] } }) });
    const crit = [{ id: 'c', criterionKey: 'rec', label: 'Reconciliation ownership', description: '', weight: 5, ordinal: 1, evidenceTags: ['reconciliations'], importance: 'essential' }] as unknown as Parameters<typeof interviewQuestions>[1];
    const qs = interviewQuestions({ title: 'Assistant Accountant', outcomes: [] }, crit);
    const ev = [{ id: 'mm:notice', safeClaim: 'Four weeks.', tags: [], strength: 'partial', key: 'notice', topic: null, practical: true }, { id: 'mm:ex_problem', safeClaim: 'I fixed the bank feed.', tags: ['reconciliations'], strength: 'partial', key: 'ex_problem', topic: null, practical: false }];
    const r = await runInterview({ title: 'Assistant Accountant', outcomes: [] }, qs, ev, { live: true, datasetId: null });
    expect(r.result.provider).toBe('anthropic');
    const notice = r.result.answers.find((a) => a.key === 'notice')!;
    expect(notice.answer).toBe('Four weeks.');
    const problem = r.result.answers.find((a) => a.key === 'ex_problem')!;
    expect(problem).toMatchObject({ answer: 'I fixed the bank feed.', score: 6 });
  });

  it('the plan covers every person twice, one-change fairness variants, and thin profiles', () => {
    const plan = buildPlan();
    expect(EVAL_JOBS).toHaveLength(3);
    const people = EVAL_JOBS[0].people;
    expect(people).toHaveLength(36);
    expect(new Set(people.map((x) => x.id)).size).toBe(36);
    // Ratings spread across the whole range, from near-perfect to no fit.
    const r = people.map((x) => x.expected);
    expect(Math.max(...r)).toBeGreaterThanOrEqual(99);
    expect(Math.min(...r)).toBeLessThanOrEqual(2);
    for (const band of [[90, 100], [50, 89], [20, 49], [0, 19]]) expect(r.filter((x) => x >= band[0] && x <= band[1]).length).toBeGreaterThanOrEqual(5);
    expect(plan.filter((x) => x.kind === 'base')).toHaveLength(56);
    expect(plan.filter((x) => x.kind === 'repeat')).toHaveLength(56);
    expect(plan.filter((x) => x.kind === 'bias')).toHaveLength(8 * 4);
    expect(plan.filter((x) => x.kind === 'thin')).toHaveLength(8);
    expect(plan).toHaveLength(168);
    // Nothing identifying in the test set.
    expect(JSON.stringify(EVAL_JOBS)).not.toMatch(/\b(ltd|plc)\b/i);
  });

  it('runs in chunks through the worker with the real interview code and produces a report', async () => {
    const w = await load();
    setProviderForTests(standIn);
    const run = await startQualityRun(w.ids.users.alex);
    await withTx(w.consultant(), (c) => enqueue(c, 'quality_check', run.id, `quality:${run.id}:0`));
    await drainJobs();
    const [done] = await db().select().from(S.qualityRuns).where(eq(S.qualityRuns.id, run.id));
    expect(done.status).toBe('done');
    const results = done.results as ResultItem[];
    expect(results).toHaveLength(buildPlan().length);
    expect(Math.ceil(results.length / CHUNK)).toBeGreaterThan(1);
    const report = done.report as ReturnType<typeof qualityReport>;
    expect(report.allAi).toBe(true);
    expect(report.errors).toBe(0);
    expect(report.jobs.map((j) => j.id)).toEqual(['acct', 'hands_on', 'group']);
    // The stand-in is deterministic and ignores irrelevant facts, so it is perfectly consistent and fair.
    for (const j of report.jobs) {
      expect(j.checks.consistent.value).toBe(1);
      expect(j.checks.fair.pass).toBe(true);
      expect(j.people).toHaveLength(j.id === 'acct' ? 36 : 10);
    }
  });

  it('a run with any basic (no-AI) interview never counts as a pass', () => {
    const plan = buildPlan();
    const expected = new Map(EVAL_JOBS.flatMap((j) => j.people.map((x) => [`${j.id}:${x.id}`, x.expected])));
    const results: ResultItem[] = plan.map((p) => ({ ...p, fitScore: expected.get(`${p.job}:${p.person}`)!, provider: 'anthropic' }));
    expect(qualityReport(results).pass).toBe(true);
    results[0].provider = 'fixture';
    expect(qualityReport(results)).toMatchObject({ allAi: false, pass: false });
  });

  it('flags ratings far from ours, unfairness and inconsistency', () => {
    const plan = buildPlan();
    const expected = new Map(EVAL_JOBS.flatMap((j) => j.people.map((x) => [`${j.id}:${x.id}`, x.expected])));
    const results: ResultItem[] = plan.map((p) => ({ ...p, fitScore: expected.get(`${p.job}:${p.person}`)! - (p.change === 'age' ? 30 : 0) + (p.kind === 'repeat' ? 25 : 0), provider: 'anthropic' }));
    const r = qualityReport(results);
    expect(r.overall.fair).toBe(false);
    expect(r.overall.consistent).toBe(false);
    expect(r.pass).toBe(false);
    // Everyone rated 50: far from ours for strong and weak people.
    const flat = qualityReport(plan.map((p) => ({ ...p, fitScore: 50, provider: 'anthropic' })));
    expect(flat.overall.close).toBe(false);
    expect(flat.jobs[0].avgGap).toBeGreaterThan(20);
  });
});
