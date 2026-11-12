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
const standIn: AiProvider = { ...fixtureProvider, name: 'anthropic', simulateInterview: async (i) => {
  const tags = new Set(i.examples.flatMap((e) => e.tags));
  return { provider: 'anthropic', usage, output: { answers: i.questions.map((q, n) => ({ questionIndex: n, answer: q.fixed_answer ?? "I haven't shared an example of this yet.", evidenceIds: q.fixed_ids ?? [], score: q.screening ? null : 5, reason: 'Stand-in.' })), fitScore: Math.min(100, tags.size * 15), summary: 'Stand-in.', concerns: [] } };
} };

describe('interview quality check', () => {
  it('the plan covers every person twice, one-change fairness variants, and thin profiles', () => {
    const plan = buildPlan();
    expect(EVAL_JOBS).toHaveLength(3);
    for (const j of EVAL_JOBS) {
      expect(j.people).toHaveLength(12);
      for (const t of ['strong', 'middling', 'weak']) expect(j.people.filter((x) => x.tier === t)).toHaveLength(4);
    }
    expect(plan.filter((x) => x.kind === 'base')).toHaveLength(36);
    expect(plan.filter((x) => x.kind === 'repeat')).toHaveLength(36);
    expect(plan.filter((x) => x.kind === 'bias')).toHaveLength(3 * 3 * 4);
    expect(plan.filter((x) => x.kind === 'thin')).toHaveLength(12);
    // Nothing identifying in the test set.
    expect(JSON.stringify(EVAL_JOBS)).not.toMatch(/\b(ltd|limited|plc)\b/i);
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
    expect(report.jobs.map((j) => j.id)).toEqual(['acct', 'ops', 'sales']);
    // The stand-in is deterministic and ignores irrelevant facts, so it is perfectly consistent and fair.
    for (const j of report.jobs) {
      expect(j.checks.consistent.value).toBe(1);
      expect(j.checks.fair.pass).toBe(true);
      expect(j.people).toHaveLength(12);
    }
  });

  it('a run with any basic (no-AI) interview never counts as a pass', () => {
    const plan = buildPlan();
    const expected = new Map(EVAL_JOBS.flatMap((j) => j.people.map((x) => [x.id, x.expected])));
    const results: ResultItem[] = plan.map((p) => ({ ...p, fitScore: expected.get(p.person)!, provider: 'anthropic' }));
    expect(qualityReport(results).pass).toBe(true);
    results[0].provider = 'fixture';
    expect(qualityReport(results)).toMatchObject({ allAi: false, pass: false });
  });

  it('flags ratings far from ours, unfairness and inconsistency', () => {
    const plan = buildPlan();
    const expected = new Map(EVAL_JOBS.flatMap((j) => j.people.map((x) => [x.id, x.expected])));
    const results: ResultItem[] = plan.map((p) => ({ ...p, fitScore: expected.get(p.person)! - (p.change === 'age' ? 30 : 0) + (p.kind === 'repeat' ? 25 : 0), provider: 'anthropic' }));
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
