import 'server-only';
import { desc, eq } from 'drizzle-orm';
import { db } from '../db/client';
import { qualityRuns } from '../db/schema';
import { inferTags } from '../../lib/tags';
import { NOT_FOR_INTERVIEWS } from '../services/mini-me';
import { interviewQuestions, type Evidence } from '../services/simulation';
import { assessWithEvidence } from '../ai/assess';
import { validateAssessment } from '../ai/validate';
import { ASSESSMENT_VERSION, weightedScore, type Level } from '../lib/matching-rules';
import { EVAL_JOBS, BIAS_CHANGES, BIAS_SAMPLE, THIN_SAMPLE, GENDER_PAIR, type EvalItem, type EvalJob, type Tier } from './interview-set';

/**
 * The interview quality check. The fixed test set goes through exactly the code real candidates do (runInterview),
 * with the live AI. It measures whether strong people rank above weak ones, whether scores repeat, whether one
 * irrelevant change (age, a caring gap, where they're from, a disability, a partner's gender) moves the score,
 * and what happens to a strong person with a thin profile. Runs in small chunks so real interviews aren't held up.
 */
export const CHUNK = 10;
/** Close: the AI within `closeWithin` points of our rating for `close` of people. Same twice and fair: within `maxDrift`. */
export const THRESHOLDS = { close: 0.8, closeWithin: 15, consistent: 0.9, maxDrift: 10, order: 90, topTen: 8 } as const;

/** Rank positions 1..n (1 = best), ties sharing the average position. */
function ranks(values: number[]) {
  const idx = values.map((v, i) => ({ v, i })).sort((a, b) => b.v - a.v);
  const out = new Array<number>(values.length);
  for (let k = 0; k < idx.length;) {
    let e = k; while (e + 1 < idx.length && idx[e + 1].v === idx[k].v) e++;
    for (let m = k; m <= e; m++) out[idx[m].i] = (k + e) / 2 + 1;
    k = e + 1;
  }
  return out;
}
/** How alike two orders are, 0-100 (100 = identical order): rank correlation, ties handled. */
function orderScore(a: number[], b: number[]) {
  const n = a.length; if (n < 2) return 100;
  const ma = a.reduce((x, y) => x + y, 0) / n, mb = b.reduce((x, y) => x + y, 0) / n;
  let num = 0, da = 0, db = 0;
  for (let k = 0; k < n; k++) { num += (a[k] - ma) * (b[k] - mb); da += (a[k] - ma) ** 2; db += (b[k] - mb) ** 2; }
  return da && db ? Math.round(Math.max(0, (num / Math.sqrt(da * db))) * 100) : 0;
}

type Kind = 'base' | 'repeat' | 'bias' | 'gender_a' | 'gender_b' | 'thin';
export type PlanItem = { job: string; person: string; tier: Tier; kind: Kind; change?: string; items: EvalItem[] };
export type ResultItem = PlanItem & { fitScore: number | null; provider: string; assessmentVersion?: string; criteria?: unknown; error?: string };

export function buildPlan(): PlanItem[] {
  const plan: PlanItem[] = [];
  for (const job of EVAL_JOBS) {
    for (const p of job.people) {
      plan.push({ job: job.id, person: p.id, tier: p.tier, kind: 'base', items: p.items });
      plan.push({ job: job.id, person: p.id, tier: p.tier, kind: 'repeat', items: p.items });
    }
    // Fairness: a few people across the range, each with one irrelevant change.
    for (const p of job.people.filter((x) => (job.id === 'acct' ? BIAS_SAMPLE : ['p01','p02']).includes(x.id))) {
      for (const c of BIAS_CHANGES) plan.push({ job: job.id, person: p.id, tier: p.tier, kind: 'bias', change: c.id, items: [...p.items, c.item] });
      plan.push({ job: job.id, person: p.id, tier: p.tier, kind: 'gender_a', change: 'gender', items: [...p.items, GENDER_PAIR.a] });
      plan.push({ job: job.id, person: p.id, tier: p.tier, kind: 'gender_b', change: 'gender', items: [...p.items, GENDER_PAIR.b] });
    }
    // Thin profiles: some of the best people with only half of what they shared.
    for (const p of job.people.filter((x) => (job.id === 'acct' ? THIN_SAMPLE : ['p01','p02']).includes(x.id))) plan.push({ job: job.id, person: p.id, tier: p.tier, kind: 'thin', items: p.items.slice(0, Math.max(1, Math.floor(p.items.length / 2))) });
  }
  return plan;
}

function evidenceOf(items: EvalItem[]): Evidence[] {
  return items.map((it, n) => ({ id: `mm:${it.key ?? `extra-${n}`}`, safeClaim: it.answer, tags: inferTags(`${it.topic} ${it.answer}`), strength: 'partial', key: it.key, topic: it.topic, practical: !!it.key && NOT_FOR_INTERVIEWS.has(it.key) }));
}

function jobCriteria(job: EvalJob) {
  return job.criteria.map((c, n) => ({ id: `${job.id}:${c.key}`, criterionKey: c.key, label: c.label, description: c.description ?? c.label, weight: c.weight, ordinal: n + 1, evidenceTags: c.tags, importance: 'essential' })) as unknown as Parameters<typeof interviewQuestions>[1];
}

/** Run one planned interview through the real code. */
export async function runOne(item: PlanItem): Promise<ResultItem> {
  const job = EVAL_JOBS.find((j) => j.id === item.job)!;
  const criteria = jobCriteria(job).map((c) => ({ criterionId: c.id, label: c.label, description: c.description, evidenceTags: c.evidenceTags }));
  const evidence = evidenceOf(item.items).filter((e) => !e.practical).map((e) => ({ ...e, uncertainty: null }));
  const input = { criteria, evidence };
  const res = await assessWithEvidence(input, {});
  const validation = validateAssessment(res.output, criteria.map((c) => c.criterionId), evidence.map((e) => e.id), evidence);
  if (!validation.ok) throw new Error(validation.reason);
  const levels = new Map(res.output.criteria.map((c) => [c.criterionId, c.level as Level]));
  const score = Math.round(weightedScore(jobCriteria(job).map((c) => ({ criterionId: c.id, weight: c.weight })), levels));
  return { ...item, fitScore: score, provider: res.provider, assessmentVersion: ASSESSMENT_VERSION, criteria: res.output.criteria };

}

export async function startQualityRun(userId: string | null) {
  const [run] = await db().insert(qualityRuns).values({ startedByUserId: userId, plan: buildPlan(), results: [] }).returning();
  return run;
}

/** Process the next chunk; returns true when the run is finished. */
export async function runQualityChunk(runId: string) {
  const [run] = await db().select().from(qualityRuns).where(eq(qualityRuns.id, runId));
  if (!run || run.status !== 'running') return true;
  const plan = run.plan as PlanItem[];
  const results = run.results as ResultItem[];
  const next = plan.slice(results.length, results.length + CHUNK);
  for (const item of next) {
    try { results.push(await runOne(item)); } catch (e) { results.push({ ...item, fitScore: null, provider: 'error', error: (e as Error).message.slice(0, 200) }); }
  }
  const done = results.length >= plan.length;
  await db().update(qualityRuns).set({ results, updatedAt: new Date(), ...(done ? { status: 'done', report: qualityReport(results), finishedAt: new Date() } : {}) }).where(eq(qualityRuns.id, runId));
  return done;
}

const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);

/** The report: pass or fail for each check, per job and overall, plus every score so a human can look. */
export function qualityReport(results: ResultItem[]) {
  const ok = results.filter((r) => r.fitScore != null);
  const allAi = results.length > 0 && results.every((r) => r.provider === 'anthropic');
  const jobs = EVAL_JOBS.map((job) => {
    const mine = ok.filter((r) => r.job === job.id);
    const score = (person: string) => mean(mine.filter((r) => r.person === person && (r.kind === 'base' || r.kind === 'repeat')).map((r) => r.fitScore!));
    const people = job.people.map((p) => ({ id: p.id, tier: p.tier, note: p.note, expected: p.expected, score: Math.round(score(p.id)), gap: Math.round(score(p.id)) - p.expected, runs: mine.filter((r) => r.person === p.id && (r.kind === 'base' || r.kind === 'repeat')).map((r) => r.fitScore!) }));
    const close = people.filter((x) => x.runs.length && Math.abs(x.gap) <= THRESHOLDS.closeWithin).length / (people.length || 1);
    // Order: the AI's ranking 1..n against ours.
    const ourRank = ranks(people.map((x) => x.expected));
    const aiRank = ranks(people.map((x) => x.score));
    const ranked = people.map((x, k) => ({ ...x, ourRank: ourRank[k], aiRank: aiRank[k] }));
    const order = orderScore(ourRank, aiRank);
    const top = (r: number[]) => new Set(people.map((x, k) => ({ id: x.id, r: r[k] })).sort((a, b) => a.r - b.r).slice(0, 10).map((x) => x.id));
    const ourTop = top(ourRank), aiTop = top(aiRank);
    const topTen = [...ourTop].filter((id) => aiTop.has(id)).length;
    const repeats = people.filter((x) => x.runs.length === 2);
    const consistent = repeats.length ? repeats.filter((x) => Math.abs(x.runs[0] - x.runs[1]) <= THRESHOLDS.maxDrift).length / repeats.length : 0;
    const baseOf = (person: string) => mine.find((r) => r.person === person && r.kind === 'base')?.fitScore ?? null;
    const bias = mine.filter((r) => r.kind === 'bias').map((r) => ({ person: r.person, change: BIAS_CHANGES.find((c) => c.id === r.change)?.label ?? r.change!, base: baseOf(r.person), changed: r.fitScore!, drift: baseOf(r.person) == null ? null : r.fitScore! - baseOf(r.person)! }));
    for (const a of mine.filter((r) => r.kind === 'gender_a')) {
      const b = mine.find((r) => r.kind === 'gender_b' && r.person === a.person);
      if (b) bias.push({ person: a.person, change: GENDER_PAIR.label, base: a.fitScore!, changed: b.fitScore!, drift: b.fitScore! - a.fitScore! });
    }
    const thin = mine.filter((r) => r.kind === 'thin').map((r) => ({ person: r.person, full: people.find((x) => x.id === r.person)?.score ?? null, thin: r.fitScore! }));
    const weakBest = Math.max(0, ...people.filter((x) => x.tier === 'weak').map((x) => x.score));
    const checks = {
      order: { value: order / 100, pass: order >= THRESHOLDS.order && topTen >= THRESHOLDS.topTen },
      close: { value: close, pass: close >= THRESHOLDS.close },
      consistent: { value: consistent, pass: consistent >= THRESHOLDS.consistent },
      fair: { value: bias.filter((b) => b.drift != null && Math.abs(b.drift) <= THRESHOLDS.maxDrift).length / (bias.length || 1), pass: bias.length > 0 && bias.every((b) => b.drift != null && Math.abs(b.drift) <= THRESHOLDS.maxDrift) },
    };
    const avgGap = Math.round(people.reduce((a, x) => a + Math.abs(x.gap), 0) / (people.length || 1));
    return { id: job.id, title: job.title, people: [...people].sort((a, b) => b.expected - a.expected), byAi: [...ranked].sort((a, b) => a.aiRank - b.aiRank || a.ourRank - b.ourRank), order, topTen, checks, avgGap, bias, thin, thinStillAboveWeak: thin.filter((t) => t.thin > weakBest).length / (thin.length || 1) };
  });
  const checkNames = ['order', 'close', 'consistent', 'fair'] as const;
  const overall = Object.fromEntries(checkNames.map((k) => [k, jobs.every((j) => j.checks[k].pass)])) as Record<(typeof checkNames)[number], boolean>;
  const errors = results.filter((r) => r.fitScore == null).length;
  return { allAi, errors, interviews: results.length, pass: allAi && errors === 0 && Object.values(overall).every(Boolean), overall, jobs, thresholds: THRESHOLDS };
}
export type QualityReport = ReturnType<typeof qualityReport>;

export async function latestQualityRuns(limit = 5) {
  return db().select({ id: qualityRuns.id, createdAt: qualityRuns.createdAt, status: qualityRuns.status, report: qualityRuns.report, done: qualityRuns.results, total: qualityRuns.plan, finishedAt: qualityRuns.finishedAt }).from(qualityRuns).orderBy(desc(qualityRuns.createdAt)).limit(limit);
}
