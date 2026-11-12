import { miniMeEvidence, miniMeRows, NOT_FOR_INTERVIEWS } from './mini-me';
import { inferTags } from '../../lib/tags';
import { and, eq, inArray, ne } from 'drizzle-orm';
import { roles, matches, candidates, candidateIdentity, organisations, simulatedInterviews, jobs } from '../db/schema';
import { compareMatches } from '../lib/matching-rules';
import { safeClaimProblems } from '../ai/validate';
import { runAi, aiMode, AiFailure } from '../ai';
import type { SimulationOutput } from '../ai/schemas';
import { withTx, readCtx, type BaseCtx, type Ctx } from './context';
import { criteriaFor } from './roles';
import { assessmentInput } from './matching';
import { enqueue } from './jobs';
import { clientMaySeeCandidateOnRole } from '../policies/privacy';

/**
 * Simulated interviews. For a live job, the best-matched candidates are "interviewed" using only their own
 * approved, anonymised examples, then scored for fit. The result is a prediction to help choose who to meet,
 * never something the person said, and a person always decides.
 */
/** Enough to fill the largest list (20) with a little spare. */
/** Everyone who fits gets interviewed. This is only a safety ceiling per job run. */
export const SIM_LIMIT = 500;
export const NOT_SHARED = 'They haven’t shared an example of this yet.';

type Crit = Awaited<ReturnType<typeof criteriaFor>>[number];
type Evidence = { id: string; safeClaim: string; tags: string[]; strength: string; key?: string | null; topic?: string | null; practical?: boolean };
/** A company name the dataset doesn't know about usually ends like this; such answers aren't shown. */
const COMPANY = /\b(ltd|limited|plc|inc|llp|gmbh)\b\.?/i;
export type SimAnswer = { question: string; answer: string; evidenceIds: string[]; grounded: boolean; key?: string | null; kind?: 'interview' | 'screening'; score?: number | null; reason?: string };

/**
 * What decided an interview, kept with it: the checklist keys, skill tags and mini-me items its answers drew on
 * (factors) and what it had nothing for (gaps). A later mini-me change re-runs the interview only if it touches these.
 */
export type ScoreCard = { factors: { keys: string[]; tags: string[]; itemIds: string[] }; gaps: { keys: string[]; tags: string[]; anyExample: boolean } };

export function scoreCardFor(questions: ReturnType<typeof interviewQuestions>, answers: SimAnswer[]): ScoreCard {
  const f = { keys: new Set<string>(), tags: new Set<string>(), itemIds: new Set<string>() };
  const g = { keys: new Set<string>(), tags: new Set<string>(), anyExample: false };
  questions.forEach((q, i) => {
    const a = answers[i];
    const target = a?.grounded ? f : g;
    if (q.key) target.keys.add(q.key);
    for (const t of q.crit?.evidenceTags ?? []) target.tags.add(t);
    if (a?.grounded) for (const id of a.evidenceIds) f.itemIds.add(id);
    // A general question with no answer yet can be filled by any new example.
    else if (q.kind === 'interview' && !q.crit) g.anyExample = true;
  });
  return { factors: { keys: [...f.keys], tags: [...f.tags], itemIds: [...f.itemIds] }, gaps: { keys: [...g.keys], tags: [...g.tags], anyExample: g.anyExample } };
}

/** Standard behavioural questions, answered from the matching part of their mini-me. */
const GENERAL: { key: string; text: string }[] = [
  { key: 'ex_problem', text: 'Tell me about a problem you solved at work. How did you work it out?' },
  { key: 'ex_pressure', text: 'Tell me about a time you had a tight deadline or a lot on. How did you handle it?' },
  { key: 'ex_teamwork', text: 'Describe a time you worked with other people to get something done.' },
  { key: 'ex_learning', text: 'Tell me about a time you had to learn something new quickly.' },
  { key: 'ex_mistake', text: 'Tell me about a mistake you made or spotted, and what you did about it.' },
  { key: 'ex_improvement', text: 'Describe something you improved at work. What changed because of you?' },
  { key: 'ex_customer', text: 'Tell me about helping a customer or colleague with something tricky.' },
];
/** Screening questions every interview includes, answered from their practical details. */
export const SCREENING: { key: string; text: string }[] = [
  { key: 'notice', text: 'How much notice do you need to give, or when could you start?' },
  { key: 'salary', text: 'What salary are you looking for?' },
  { key: 'work_mode', text: 'Where are you based, and does the way this job is worked (office, hybrid or remote) suit you?' },
  { key: 'right_to_work', text: 'Do you have the right to work in the UK?' },
];
export const MIN_INTERVIEW_QUESTIONS = 7;
/** After their mini-me is interviewed for a job, they have 24 hours to fill gaps or change answers. */
export const EDIT_WINDOW_MS = 24 * 60 * 60 * 1000;

/**
 * The interview: up to five questions from what matters most for the job, one about its main goal,
 * standard behavioural questions to make at least seven, then four screening questions. Never fewer than 11.
 */
export function interviewQuestions(role: { title: string; outcomes: string[] }, crit: Crit[]) {
  const top = [...crit].sort((a, b) => b.weight - a.weight || a.ordinal - b.ordinal).slice(0, 5);
  const qs: { text: string; crit: Crit | null; key: string | null; kind: 'interview' | 'screening' }[] = top.map((c) => ({ text: `Tell me about a time you worked on ${c.label.toLowerCase()}. What did you do, and what happened?`, crit: c as Crit | null, key: null, kind: 'interview' }));
  if (role.outcomes[0]) qs.push({ text: `In this job you would need to: ${role.outcomes[0].replace(/[.!]$/, '')}. How would you approach that?`, crit: null, key: null, kind: 'interview' });
  for (const g of GENERAL) { if (qs.length >= MIN_INTERVIEW_QUESTIONS) break; qs.push({ text: g.text, crit: null, key: g.key, kind: 'interview' }); }
  for (const sq of SCREENING) qs.push({ text: sq.text, crit: null, key: sq.key, kind: 'screening' });
  return qs;
}

/** An answer straight from their mini-me: the exact question they answered, or the matching checklist answer. */
function direct(q: { text: string; key: string | null }, evidence: Evidence[]) {
  return evidence.find((e) => e.topic && e.topic.trim().toLowerCase() === q.text.trim().toLowerCase()) ?? (q.key ? evidence.find((e) => e.key === q.key) : undefined);
}

const STRENGTH: Record<string, number> = { specific: 1, partial: 0.6, assertion: 0.3 };

/** Demo mode: answers are the candidate's own approved examples, matched to each question by skill. */
export function demoSimulation(questions: ReturnType<typeof interviewQuestions>, evidence: Evidence[]): SimulationOutput & { built: SimAnswer[] } {
  const rank = (list: Evidence[]) => [...list].sort((a, b) => (STRENGTH[b.strength] ?? 0) - (STRENGTH[a.strength] ?? 0));
  const pool = evidence.filter((e) => !e.practical);
  const best = (tags: string[] | null) => rank(pool.filter((e) => !tags || e.tags.some((t) => tags.includes(t))))[0];
  // Use each example once where possible, so answers don't repeat; fall back to the best fit if nothing else is left.
  const used = new Set<string>();
  const built: SimAnswer[] = questions.map((q) => {
    const meta = { key: q.key, kind: q.kind };
    const d = direct(q, evidence);
    const screening = q.kind === 'screening';
    const scoreOf = (e: Evidence) => (screening ? null : Math.round((STRENGTH[e.strength] ?? 0.3) * 10));
    const none = { score: screening ? null : 0, reason: screening ? 'They haven’t told us yet.' : 'Nothing in their mini-me covers this yet.' };
    if (d) { used.add(d.id); return { question: q.text, answer: d.safeClaim, evidenceIds: [d.id], grounded: true, ...meta, score: scoreOf(d), reason: screening ? 'From their own answer.' : 'Answered in their own words from their mini-me.' }; }
    if (screening || q.key) return { question: q.text, answer: NOT_SHARED, evidenceIds: [], grounded: false, ...meta, ...none };
    const fits = rank(pool.filter((e) => !q.crit || e.tags.some((t) => q.crit!.evidenceTags.includes(t))));
    const e = fits.find((x) => !used.has(x.id)) ?? (q.crit ? fits[0] : undefined);
    if (!e) return { question: q.text, answer: NOT_SHARED, evidenceIds: [], grounded: false, ...meta, ...none };
    used.add(e.id);
    return { question: q.text, answer: e.safeClaim, evidenceIds: [e.id], grounded: true, ...meta, score: scoreOf(e), reason: q.crit ? `Their closest example for ${q.crit.label.toLowerCase()}.` : 'Their closest example.' };
  });
  const scored = questions.filter((q) => q.crit);
  const total = scored.reduce((a, q) => a + q.crit!.weight, 0) || 1;
  const got = scored.reduce((a, q) => { const e = best(q.crit!.evidenceTags); return a + q.crit!.weight * (e ? STRENGTH[e.strength] ?? 0 : 0); }, 0);
  const strong = scored.filter((q) => best(q.crit!.evidenceTags)).map((q) => q.crit!.label.toLowerCase());
  const missing = scored.filter((q) => !best(q.crit!.evidenceTags)).map((q) => q.crit!.label.toLowerCase());
  const summary = strong.length ? `Good examples of ${strong.join(' and ')}.${missing.length ? ` Nothing yet on ${missing.join(' or ')}.` : ''}` : 'Not much to go on yet. A phone screening would tell you more.';
  return { built, answers: [], fitScore: Math.round((got / total) * 100), summary, concerns: missing.slice(0, 3) };
}

/** The best-matched candidates this client may see, still needing a simulation for the current versions. */
/**
 * Did their mini-me change in a way that matters to this interview? Yes if, since it ran, an item changed that it
 * drew on, that answers one of its questions (or the same checklist key), shares a skill with a job criterion,
 * fills a gap it had, or an item it used was removed. Anything else (a new hobby, a typo elsewhere) doesn't re-run it.
 */
export function interviewTouched(sim: { updatedAt: Date; scoreCard: unknown; answers: unknown }, items: { key: string; topic: string | null; answer: string; updatedAt: Date }[]) {
  const changed = items.filter((r) => r.updatedAt > sim.updatedAt);
  const card = sim.scoreCard as ScoreCard | null;
  // Interviews from before score cards: any change counts, as before.
  if (!card) return changed.length > 0;
  const present = new Set(items.map((r) => `mm:${r.key}`));
  if (card.factors.itemIds.some((id) => id.startsWith('mm:') && !present.has(id))) return true;
  const keys = new Set([...card.factors.keys, ...card.gaps.keys]);
  const tags = new Set([...card.factors.tags, ...card.gaps.tags]);
  const questions = new Set(((sim.answers as { question: string }[]) ?? []).map((a) => a.question.trim().toLowerCase()));
  return changed.some((r) => {
    if (card.factors.itemIds.includes(`mm:${r.key}`) || keys.has(r.key)) return true;
    if (r.topic && questions.has(r.topic.trim().toLowerCase())) return true;
    if (NOT_FOR_INTERVIEWS.has(r.key)) return false;
    if (card.gaps.anyExample) return true;
    return inferTags(`${r.topic ?? ''} ${r.answer}`).some((t) => tags.has(t));
  });
}

export async function simulationTargets(ctx: Ctx, roleId: string) {
  const [role] = await ctx.tx.select().from(roles).where(eq(roles.id, roleId));
  if (!role || role.status !== 'open') return { role: role ?? null, targets: [] as { candidateId: string }[] };
  const ms = await ctx.tx.select().from(matches).where(and(eq(matches.roleId, roleId), ne(matches.eligibility, 'incompatible')));
  const refs = await ctx.tx.select({ id: candidates.id, ref: candidates.publicRef, pv: candidates.latestProfileVersionId }).from(candidates).where(inArray(candidates.id, ms.length ? ms.map((m) => m.candidateId) : ['00000000-0000-0000-0000-000000000000']));
  const info = new Map(refs.map((r) => [r.id, r]));
  const ranked = ms.map((m) => ({ m, publicRef: info.get(m.candidateId)?.ref ?? '', eligibility: m.eligibility, score: m.score, coverageBps: m.coverageBps })).sort(compareMatches);
  const existing = await ctx.tx.select().from(simulatedInterviews).where(eq(simulatedInterviews.roleId, roleId));
  // An interview is redone when the job or their profile changed, or when a mini-me change touches what decided it.
  // Mini-me changes only count during the 24 hours after they were first interviewed; then that interview is final.
  const mini = await miniMeRows(ctx, existing.map((s) => s.candidateId));
  const now = Date.now();
  const fresh = new Set(existing.filter((s) => s.roleVersion === role.roleVersion && s.profileVersionId === info.get(s.candidateId)?.pv
    && !(now < s.createdAt.getTime() + EDIT_WINDOW_MS && interviewTouched(s, mini.get(s.candidateId) ?? []))).map((s) => s.candidateId));
  const targets: { candidateId: string }[] = [];
  let considered = 0;
  for (const r of ranked) {
    if (considered >= SIM_LIMIT) break;
    if (!(await clientMaySeeCandidateOnRole(ctx, { candidateId: r.m.candidateId, clientId: role.clientId, roleId, hasIntro: false }))) continue;
    considered++;
    if (!fresh.has(r.m.candidateId)) targets.push({ candidateId: r.m.candidateId });
  }
  return { role, targets };
}

/** Starts (or reuses) the background job for this role. Safe to call on every page view. */
export async function requestSimulations(ctx: Ctx, roleId: string) {
  const { role, targets } = await simulationTargets(ctx, roleId);
  if (!role || !targets.length) return { queued: false };
  const j = await enqueue(ctx, 'simulate_interviews', roleId, `simulate:${roleId}:${role.roleVersion}:${Math.floor(Date.now() / 600000)}`);
  // Someone still needs interviewing but this window's job already ran (e.g. they just edited an answer): run it again.
  if (j.status === 'succeeded') await ctx.tx.update(jobs).set({ status: 'queued', availableAt: new Date(), updatedAt: new Date() }).where(eq(jobs.id, j.id));
  return { queued: true };
}

export async function simulationPending(ctx: Ctx, roleId: string) {
  const rows = await ctx.tx.select({ id: jobs.id }).from(jobs).where(and(eq(jobs.datasetId, ctx.datasetId), eq(jobs.kind, 'simulate_interviews'), eq(jobs.subjectId, roleId), inArray(jobs.status, ['queued', 'running'])));
  return rows.length > 0;
}

/** Validates and stores one simulation. Rejects foreign evidence ids and anything identifying; stale results are discarded. */
export async function storeSimulation(ctx: Ctx, a: { roleId: string; candidateId: string; roleVersion: number; profileVersionId: string; answers: SimAnswer[]; fitScore: number; summary: string; concerns: string[]; provider: 'fixture' | 'anthropic'; evidenceIds: string[]; questions?: ReturnType<typeof interviewQuestions> }) {
  const [role] = await ctx.tx.select().from(roles).where(eq(roles.id, a.roleId)).for('update');
  const [cand] = await ctx.tx.select().from(candidates).where(eq(candidates.id, a.candidateId));
  if (!role || !cand || cand.status === 'deleting' || cand.status === 'deleted') return { stored: false, reason: 'unavailable' };
  if (role.roleVersion !== a.roleVersion || cand.latestProfileVersionId !== a.profileVersionId) return { stored: false, reason: 'stale_discarded' };
  const [idn] = await ctx.tx.select({ n: candidateIdentity.fullName, e: candidateIdentity.currentEmployerLabel }).from(candidateIdentity).where(eq(candidateIdentity.candidateId, a.candidateId));
  const orgNames = (await ctx.tx.select({ n: organisations.displayName }).from(organisations).where(eq(organisations.datasetId, ctx.datasetId))).map((o) => o.n);
  // Any real person's name in this dataset (not only this candidate's) and any organisation name is blocked.
  const people = await ctx.tx.select({ n: candidateIdentity.fullName }).from(candidateIdentity).innerJoin(candidates, eq(candidates.id, candidateIdentity.candidateId)).where(eq(candidates.datasetId, ctx.datasetId));
  const forbidden = [...(idn ? [idn.n, ...idn.n.split(/\s+/).filter((x) => x.length >= 3)] : []), ...(idn?.e ? [idn.e] : []), ...orgNames, ...people.map((p) => p.n).filter(Boolean)];
  const allowed = new Set(a.evidenceIds);
  const clean = (t: string) => (safeClaimProblems(t, forbidden).length || COMPANY.test(t) ? '' : t.trim());
  const answers: SimAnswer[] = a.answers.map((x) => {
    const ids = x.evidenceIds.filter((i) => allowed.has(i));
    const ok = ids.length > 0 && x.answer.trim() && !safeClaimProblems(x.answer, forbidden).length && !COMPANY.test(x.answer);
    const screening = (x.kind ?? 'interview') === 'screening';
    const score = screening || x.score == null ? null : Math.max(0, Math.min(10, Math.round(x.score)));
    return ok
      ? { ...x, evidenceIds: ids, grounded: true, score, reason: clean(x.reason ?? '') }
      : { question: x.question, answer: NOT_SHARED, evidenceIds: [], grounded: false, key: x.key ?? null, kind: x.kind ?? 'interview', score: screening ? null : 0, reason: screening ? 'They haven’t told us yet.' : 'Nothing in their mini-me covers this yet.' };
  });
  const summary = clean(a.summary) || (answers.some((x) => x.grounded) ? 'Has relevant examples for this job.' : 'Not much to go on yet.');
  const concerns = a.concerns.map(clean).filter(Boolean).slice(0, 3);
  const fitScore = Math.max(0, Math.min(100, Math.round(a.fitScore)));
  // The first time their mini-me is interviewed for a job, tell them. No score: just that it happened.
  const [before] = await ctx.tx.select({ id: simulatedInterviews.id }).from(simulatedInterviews).where(and(eq(simulatedInterviews.roleId, a.roleId), eq(simulatedInterviews.candidateId, a.candidateId)));
  if (!before && cand.userId) {
    const { notify } = await import('./audit');
    await notify(ctx, [cand.userId], { type: 'system', subjectRefType: 'interview', subjectRefId: a.roleId, safeTitle: `Your mini-me was interviewed for ${role.title}` });
  }
  const scoreCard = a.questions ? scoreCardFor(a.questions, answers) : null;
  const row = { datasetId: ctx.datasetId, roleId: a.roleId, candidateId: a.candidateId, roleVersion: a.roleVersion, profileVersionId: a.profileVersionId, answers, fitScore, summarySafe: summary, concernsSafe: concerns, provider: a.provider, scoreCard };
  await ctx.tx.insert(simulatedInterviews).values(row).onConflictDoUpdate({ target: [simulatedInterviews.roleId, simulatedInterviews.candidateId], set: { ...row, updatedAt: new Date() } });
  return { stored: true };
}

/** Worker job: simulate each target. Live calls go through the budgeted runAi; if refused, demo simulation is used instead. */
export async function handleSimulateJob(base: BaseCtx, roleId: string) {
  const { role, targets } = await simulationTargets(readCtx(base), roleId);
  if (!role || !targets.length) return;
  const crit = await criteriaFor(readCtx(base), roleId);
  const questions = interviewQuestions({ title: role.title, outcomes: role.outcomes }, crit);
  let live = aiMode() === 'live';
  for (const t of targets) {
    const prep = await assessmentInput(readCtx(base), roleId, t.candidateId);
    if (!prep || !prep.profileVersionId) continue;
    // Their approved examples plus their approved mini-me answers.
    const evidence: Evidence[] = [...prep.input.evidence.filter((e) => !e.id.startsWith('mm:')), ...(await miniMeEvidence(readCtx(base), t.candidateId))];
    const demo = demoSimulation(questions, evidence);
    let result = { answers: demo.built, fitScore: demo.fitScore, summary: demo.summary, concerns: demo.concerns, provider: 'fixture' as 'fixture' | 'anthropic' };
    if (live && evidence.length) {
      try {
        const fixed = (q: (typeof questions)[number]) => !!(q.key || q.kind === 'screening' || direct(q, evidence));
        const input = { role: { title: role.title, outcomes: role.outcomes }, questions: questions.map((q, i) => ({ question: q.text, screening: q.kind === 'screening', ...(fixed(q) ? { fixed_answer: demo.built[i].answer, fixed_ids: demo.built[i].evidenceIds } : {}) })), examples: evidence.filter((e) => !e.practical).map((e) => ({ id: e.id, text: e.safeClaim, tags: e.tags })) };
        const res = await runAi({ task: 'simulate', datasetId: base.datasetId, roleId, candidateId: t.candidateId, input }, (p) => p.simulateInterview(input));
        const out = res.output;
        result = {
          answers: questions.map((q, i) => {
            const a = out.answers.find((x) => x.questionIndex === i);
            const scored = a ? { score: q.kind === 'screening' ? null : a.score, reason: a.reason } : {};
            // Fixed answers stay exactly as they wrote them; the AI only scores them.
            if (fixed(q)) return { ...demo.built[i], ...scored };
            return { question: q.text, answer: a?.answer ?? NOT_SHARED, evidenceIds: a?.evidenceIds ?? [], grounded: !!a?.evidenceIds.length, key: q.key, kind: q.kind, ...(a ? scored : { score: 0, reason: 'Nothing in their mini-me covers this yet.' }) };
          }),
          fitScore: out.fitScore, summary: out.summary, concerns: out.concerns, provider: res.provider,
        };
      } catch (e) {
        if (!(e instanceof AiFailure)) throw e;
        if (e.code === 'monthly_budget' || e.code === 'daily_budget') live = false; // stop paid calls for the rest of this job
      }
    }
    await withTx(base, (ctx) => storeSimulation(ctx, { roleId, candidateId: t.candidateId, roleVersion: prep.roleVersion, profileVersionId: prep.profileVersionId!, ...result, evidenceIds: evidence.map((e) => e.id), questions }));
  }
}

/** Ranked simulations for the role page: best fit first. */
export async function simulationsForRole(ctx: Ctx, roleId: string) {
  const rows = await ctx.tx.select().from(simulatedInterviews).where(eq(simulatedInterviews.roleId, roleId));
  const [role] = await ctx.tx.select({ v: roles.roleVersion }).from(roles).where(eq(roles.id, roleId));
  return new Map(rows.filter((r) => r.roleVersion === role?.v).map((r) => [r.candidateId, r]));
}
