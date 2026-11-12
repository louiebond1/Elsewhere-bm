import { pageViewer } from '@/server/page-auth';
import { PageHeader } from '@/components/ui';
import { ActionButton } from '@/components/client';
import { latestQualityRuns, THRESHOLDS, type QualityReport } from '@/server/eval/quality';
import { date } from '@/lib/format';

export const dynamic = 'force-dynamic';

const pct = (v: number) => `${Math.round(v * 100)}%`;
const CHECKS: { key: keyof QualityReport['overall']; label: string; rule: string }[] = [
  { key: 'strongOverWeak', label: 'Strong above weak', rule: `at least ${pct(THRESHOLDS.strongOverWeak)}` },
  { key: 'strongOverMiddling', label: 'Strong above middling', rule: `at least ${pct(THRESHOLDS.strongOverMiddling)}` },
  { key: 'middlingOverWeak', label: 'Middling above weak', rule: `at least ${pct(THRESHOLDS.middlingOverWeak)}` },
  { key: 'consistent', label: 'Same score twice', rule: `within ${THRESHOLDS.maxDrift} points, ${pct(THRESHOLDS.consistent)} of people` },
  { key: 'fair', label: 'Fair', rule: `age, caring gap, origin, disability or partner’s gender moves no score by more than ${THRESHOLDS.maxDrift}` },
];
const TIER: Record<string, string> = { strong: 'bg-primary text-white', middling: 'bg-[#E1E8C9] text-ink', weak: 'bg-warning-tint text-warning' };

/** Does the interview pick the right people, the same way twice, fairly? One button, one verdict. */
export default async function Quality() {
  await pageViewer('consultant');
  const runs = await latestQualityRuns(5);
  const latest = runs[0];
  const running = latest?.status === 'running';
  const report = (runs.find((r) => r.report)?.report ?? null) as QualityReport | null;
  return (
    <div className="mx-auto max-w-[980px]">
      {running && <meta httpEquiv="refresh" content="20" />}
      <PageHeader title="Interview quality" subtitle="36 fictional people across 3 jobs, labelled strong, middling or weak, put through the real AI interview." />
      <div className="flex flex-wrap items-center gap-3">
        {!running && <ActionButton path="consultant/quality-check" body={{}} label="Run quality check" successText="Started. This page updates by itself." />}
        {running && <span className="text-[15px] text-muted">{(latest.done as unknown[]).length} of {(latest.total as unknown[]).length} interviews done</span>}
        {!running && latest?.finishedAt && <span className="text-[15px] text-muted">Last run {date(latest.finishedAt)}</span>}
      </div>

      {!report ? <p className="mt-8 text-[17px] text-muted">No results yet. A run is about 140 AI interviews and takes a while; it uses the live AI and its monthly cap.</p> : (<>
        <section className={`mt-6 rounded-3xl p-6 ${report.pass ? 'bg-success-tint' : 'bg-warning-tint'}`}>
          <p className={`font-display text-[28px] font-semibold ${report.pass ? 'text-primary' : 'text-warning'}`}>{report.pass ? 'Pass' : 'Not good enough yet'}</p>
          <p className="mt-1 text-[15px]">{report.interviews} interviews{report.allAi ? ', all by the AI' : ', some fell back to the basic interview, so this run doesn’t count'}{report.errors ? `, ${report.errors} failed` : ''}. The labels were set by the developer, not a recruiter.</p>
          <ul className="mt-4 grid gap-2 sm:grid-cols-2">
            {CHECKS.map((c) => (
              <li key={c.key} className="flex items-start gap-3 rounded-2xl bg-surface px-4 py-3">
                <span aria-hidden className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[14px] font-bold ${report.overall[c.key] ? 'bg-primary text-white' : 'bg-warning text-white'}`}>{report.overall[c.key] ? '✓' : '!'}</span>
                <span><span className="block font-semibold">{c.label}</span><span className="text-[13px] text-muted">{c.rule}</span></span>
              </li>
            ))}
          </ul>
        </section>

        {report.jobs.map((j) => (
          <details key={j.id} className="mt-4 rounded-3xl bg-surface p-2 shadow-[0_8px_24px_rgb(18_37_29/0.06)]">
            <summary className="flex cursor-pointer flex-wrap items-center gap-3 px-4 py-3">
              <span className="font-display text-[20px] font-semibold">{j.title}</span>
              {CHECKS.map((c) => <span key={c.key} className={`rounded-full px-2.5 py-0.5 text-[13px] font-semibold ${j.checks[c.key].pass ? 'bg-success-tint text-primary' : 'bg-warning-tint text-warning'}`}>{c.label} {c.key === 'fair' || c.key === 'consistent' ? pct(j.checks[c.key].value) : pct(j.checks[c.key].value)}</span>)}
            </summary>
            <div className="grid gap-6 px-4 pb-4 lg:grid-cols-2">
              <div>
                <h3 className="mb-2 text-[15px]">Ranked by the AI</h3>
                <ol className="space-y-1.5">
                  {j.people.map((p, n) => (
                    <li key={p.id} className="flex items-center gap-3 text-[15px]">
                      <span className="tnum w-6 text-right text-muted">{n + 1}</span>
                      <span className={`rounded-full px-2.5 py-0.5 text-[12px] font-semibold ${TIER[p.tier]}`}>{p.tier}</span>
                      <span className="min-w-0 flex-1 truncate" title={p.note}>{p.note}</span>
                      <span className="tnum font-semibold">{p.score}</span>
                      {p.runs.length === 2 && Math.abs(p.runs[0] - p.runs[1]) > THRESHOLDS.maxDrift && <span className="text-[12px] text-warning" title={`Scores ${p.runs.join(' and ')}`}>unsteady</span>}
                    </li>
                  ))}
                </ol>
              </div>
              <div>
                <h3 className="mb-2 text-[15px]">One change at a time</h3>
                <ul className="space-y-1.5 text-[14px]">
                  {j.bias.map((b, n) => <li key={n} className="flex justify-between gap-3"><span className="truncate">{b.change} <span className="text-muted">({b.person})</span></span><span className={`tnum font-semibold ${b.drift != null && Math.abs(b.drift) > THRESHOLDS.maxDrift ? 'text-warning' : 'text-primary'}`}>{b.drift == null ? '–' : `${b.drift > 0 ? '+' : ''}${b.drift}`}</span></li>)}
                </ul>
                <h3 className="mb-2 mt-5 text-[15px]">Strong people with half their profile</h3>
                <ul className="space-y-1.5 text-[14px]">
                  {j.thin.map((t) => <li key={t.person} className="flex justify-between gap-3"><span className="text-muted">{t.person}</span><span className="tnum">{t.full} → <span className="font-semibold">{t.thin}</span></span></li>)}
                </ul>
                <p className="mt-2 text-[13px] text-muted">Not a pass/fail check yet: thin profiles aren’t flagged as “not enough to judge” so far.</p>
              </div>
            </div>
          </details>
        ))}
      </>)}
    </div>
  );
}
