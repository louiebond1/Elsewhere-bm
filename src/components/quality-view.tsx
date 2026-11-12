'use client';
import { useState } from 'react';
import { cx } from './ui';

type Person = { id: string; tier: 'strong' | 'middling' | 'weak'; note: string; score: number; runs: number[] };
type Check = { value: number; pass: boolean };
type Job = { id: string; title: string; people: Person[]; checks: Record<'strongOverWeak' | 'strongOverMiddling' | 'middlingOverWeak' | 'consistent' | 'fair', Check>; bias: { person: string; change: string; drift: number | null }[]; thin: { person: string; full: number | null; thin: number }[] };
type Report = { pass: boolean; allAi: boolean; errors: number; interviews: number; overall: Record<string, boolean>; jobs: Job[]; thresholds: { maxDrift: number } };

const LABEL: Record<string, string> = { strongOverWeak: 'Strong above weak', strongOverMiddling: 'Strong above middling', middlingOverWeak: 'Middling above weak', consistent: 'Same score twice', fair: 'Fair' };
const DOT: Record<string, string> = { strong: 'bg-primary', middling: 'bg-[#B6BF81]', weak: 'bg-warning' };

/** The quality check at a glance: a verdict, then one job at a time as a picture. Details only on request. */
export function QualityView({ report }: { report: Report }) {
  const [j, setJ] = useState(0);
  const job = report.jobs[j];
  const failed = Object.entries(report.overall).filter(([, ok]) => !ok).map(([k]) => LABEL[k].toLowerCase());
  const unfair = job.bias.filter((b) => b.drift == null || Math.abs(b.drift) > report.thresholds.maxDrift);
  const unsteady = job.people.filter((p) => p.runs.length === 2 && Math.abs(p.runs[0] - p.runs[1]) > report.thresholds.maxDrift);
  return (
    <div className="mt-6 space-y-4">
      <section className={cx('rounded-3xl p-6', report.pass ? 'bg-success-tint' : 'bg-warning-tint')}>
        <p className={cx('font-display text-[30px] font-semibold leading-tight', report.pass ? 'text-primary' : 'text-warning')}>{report.pass ? 'Picks the right people' : 'Not good enough yet'}</p>
        <p className="mt-1 text-[16px]">{!report.allAi ? 'Some interviews used the basic version, so this run doesn’t count.' : report.pass ? 'All five checks passed on all three jobs.' : `Failed: ${failed.join(', ')}.`}</p>
        <div className="mt-4 flex flex-wrap gap-2">{Object.entries(report.overall).map(([k, ok]) => <span key={k} className={cx('rounded-full px-3 py-1 text-[14px] font-semibold', ok ? 'bg-surface text-primary' : 'bg-warning text-white')}>{ok ? '✓' : '✗'} {LABEL[k]}</span>)}</div>
      </section>

      <section className="rounded-3xl bg-surface p-5 shadow-[0_8px_24px_rgb(18_37_29/0.06)] lg:p-6">
        <div role="tablist" className="flex flex-wrap gap-2">
          {report.jobs.map((x, n) => {
            const ok = Object.values(x.checks).every((c) => c.pass);
            return <button key={x.id} role="tab" aria-selected={n === j} type="button" onClick={() => setJ(n)} className={cx('rounded-full px-4 py-2 text-[15px] font-semibold', n === j ? 'bg-ink text-white' : 'bg-page text-ink')}>{ok ? '✓' : '✗'} {x.title}</button>;
          })}
        </div>

        <p className="mt-5 text-[14px] text-muted">Each dot is a person. Right is a higher score. Green should be on the right.</p>
        <div className="mt-2 space-y-3">
          {(['strong', 'middling', 'weak'] as const).map((tier) => (
            <div key={tier} className="flex items-center gap-3">
              <span className="w-20 shrink-0 text-[14px] font-semibold capitalize">{tier}</span>
              <div className="relative h-8 flex-1 rounded-full bg-page">
                {Object.entries(job.people.filter((p) => p.tier === tier).reduce<Record<number, Person[]>>((g, p) => ({ ...g, [p.score]: [...(g[p.score] ?? []), p] }), {})).map(([score, ps]) => (
                  // People with the same score share one dot, with how many inside.
                  <span key={score} title={ps.map((p) => `${p.note}: ${p.score}`).join('\n')} className={cx('tnum absolute top-1/2 flex -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full text-[11px] font-bold text-white ring-2 ring-surface', DOT[tier], ps.length > 1 ? 'h-6 w-6' : 'h-4 w-4')} style={{ left: `${Math.max(2, Math.min(98, Number(score)))}%` }}>{ps.length > 1 ? ps.length : ''}</span>
                ))}
              </div>
            </div>
          ))}
          <div className="flex gap-3 text-[12px] text-muted"><span className="w-20 shrink-0" /><div className="flex flex-1 justify-between"><span>0</span><span>50</span><span>100</span></div></div>
        </div>

        <ul className="mt-5 space-y-1.5 text-[15px]">
          <li>{job.checks.consistent.pass ? '✓' : '✗'} {unsteady.length ? `Scores moved on a second try for ${unsteady.length} of ${job.people.length}` : `Same score twice for all ${job.people.length}`}</li>
          <li>{job.checks.fair.pass ? '✓' : '✗'} {unfair.length ? `Unfair: ${unfair.slice(0, 2).map((b) => `${b.change} moved a score by ${b.drift}`).join('; ')}` : 'No irrelevant change moved a score'}</li>
        </ul>

        <details className="mt-4">
          <summary className="cursor-pointer text-[15px] font-semibold text-primary">See every score</summary>
          <ol className="mt-3 space-y-1 text-[14px]">
            {job.people.map((p, n) => <li key={p.id} className="flex items-center gap-3"><span className="tnum w-5 text-right text-muted">{n + 1}</span><span className={cx('h-2.5 w-2.5 shrink-0 rounded-full', DOT[p.tier])} /><span className="min-w-0 flex-1 truncate">{p.note}</span><span className="tnum font-semibold">{p.score}</span></li>)}
          </ol>
          {job.thin.length > 0 && <p className="mt-3 text-[14px] text-muted">Strong people with half their profile: {job.thin.map((t) => `${t.full}→${t.thin}`).join(', ')}. Thin profiles aren’t flagged yet.</p>}
        </details>
      </section>
    </div>
  );
}
