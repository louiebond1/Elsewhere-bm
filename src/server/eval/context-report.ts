import { ASSESSMENT_VERSION, weightedScore, coverage, type Level } from '../lib/matching-rules';
import { validateAssessment } from '../ai/validate';
import { assessmentOutput } from '../ai/schemas';
import { CONTEXT_JOBS, CONTEXT_PEOPLE } from './context-set';
export type ContextResult = { job: string; person: string; repeat?: boolean; provider: string; output: unknown; error?: string };
export function contextReport(results: ContextResult[]) {
  const rows = results.map((r) => {
    const job = CONTEXT_JOBS.find(j => j.id === r.job)!;
    const person = CONTEXT_PEOPLE.find(p => p.id === r.person)!;
    const parsed = assessmentOutput.safeParse(r.output);
    const valid = parsed.success ? validateAssessment(parsed.data, job.criteria.map(c => c.criterionId), person.evidence.map(e => e.id), person.evidence) : { ok: false, reason: 'schema_contract' };
    const levels = new Map(parsed.success ? parsed.data.criteria.map(c => [c.criterionId, c.level as Level]) : []);
    const score = valid.ok ? Math.round(weightedScore(job.criteria, levels)) : null;
    return { ...r, label: person.label, valid: valid.ok, validationError: valid.ok ? null : 'reason' in valid ? valid.reason : 'invalid', score, coverage: valid.ok ? Math.round(coverage(job.criteria, levels) * 100) : null, criteria: parsed.success ? parsed.data.criteria : [] };
  });
  const get = (job: string, person: string) => rows.find(r => r.job === job && r.person === person && !r.repeat);
  const delta = (job: string, a: string, b: string) => { const x=get(job,a)?.score, y=get(job,b)?.score; return x != null && y != null ? x-y : null; };
  const countries = CONTEXT_JOBS.map(j => ({ job: j.id, drift: delta(j.id,'p01','p05') }));
  const prestige = CONTEXT_JOBS.map(j => ({ job: j.id, drift: delta(j.id,'p02','p06') }));
  const repeats = rows.filter(r => r.repeat).map(r => ({ job: r.job, person: r.person, drift: r.score != null && get(r.job,r.person)?.score != null ? r.score-get(r.job,r.person)!.score! : null }));
  const sparse = rows.filter(r => ['p03','p04'].includes(r.person));
  const checks = {
    liveAi: rows.every(r => r.provider === 'anthropic' || (r.person === 'p08' && r.provider === 'no_evidence')),
    complete: CONTEXT_JOBS.every(j => CONTEXT_PEOPLE.every(p => !!get(j.id,p.id))),
    provenance: rows.every(r => r.valid),
    roleReversal: (delta('hands_on','p01','p02') ?? -1)>0 && (delta('group','p02','p01') ?? -1)>0,
    heldOutRoleReversal: (delta('hands_on','p09','p10') ?? -1)>0 && (delta('group','p10','p09') ?? -1)>0,
    countryNeutrality: countries.every(r => r.drift != null && Math.abs(r.drift)<=5),
    prestigeNeutrality: prestige.every(r => r.drift != null && Math.abs(r.drift)<=5),
    repeatability: repeats.length===4 && repeats.every(r => r.drift != null && Math.abs(r.drift)<=10),
    titleRestraint: sparse.length===4 && sparse.every(r => r.score != null && r.score<=25 && r.criteria.some(c => c.followUp)),
    emptyProfile: rows.filter(r => r.person==='p08').every(r => r.score===0 && r.coverage===0),
  };
  return { assessmentVersion: ASSESSMENT_VERSION, checks, pass: Object.values(checks).every(Boolean), rows, countries, prestige, repeats, caveat: 'These are fictional scenario checks. They do not establish general hiring accuracy or recruiter agreement.' };
}
