'use client';
import { useState } from 'react';
import { cx } from './ui';

type Person = { id: string; note: string; expected: number; score: number; gap: number; runs: number[] };
type Check = { value: number; pass: boolean };
type Job = { id: string; title: string; people: Person[]; avgGap: number; checks: Record<'close' | 'consistent' | 'fair', Check>; bias: { person: string; change: string; drift: number | null }[] };
type Report = { pass: boolean; allAi: boolean; errors: number; overall: Record<'close' | 'consistent' | 'fair', boolean>; jobs: Job[]; thresholds: { closeWithin: number; maxDrift: number } };

const LABEL: Record<string, string> = { close: 'Close to our rating', consistent: 'Same rating twice', fair: 'Treats people fairly' };

/** Our rating for each test person next to the AI's, out of 100. Close is good. */
export function QualityView({ report }: { report: Report }) {
  const [j, setJ] = useState(0);
  const job = report.jobs[j];
  const failed = Object.entries(report.overall).filter(([, ok]) => !ok).map(([k]) => LABEL[k].toLowerCase());
  const unfair = job.bias.filter((b) => b.drift == null || Math.abs(b.drift) > report.thresholds.maxDrift);
  const unsteady = job.people.filter((p) => p.runs.length === 2 && Math.abs(p.runs[0] - p.runs[1]) > report.thresholds.maxDrift);
  const far = (p: Person) => Math.abs(p.gap) > report.thresholds.closeWithin;
  return (
    <div className="mt-6 space-y-4">
      <section className={cx('rounded-3xl p-6', report.pass ? 'bg-success-tint' : 'bg-warning-tint')}>
        <p className={cx('font-display text-[30px] font-semibold leading-tight', report.pass ? 'text-primary' : 'text-warning')}>{report.pass ? 'Rates people like we would' : 'Not good enough yet'}</p>
        <p className="mt-1 text-[16px]">{!report.allAi ? 'Some interviews used the basic version, so this run doesn’t count.' : report.pass ? 'Close to our ratings, the same twice, and fair, on all three jobs.' : `Not yet: ${failed.join(', ')}.`}</p>
        <div className="mt-4 flex flex-wrap gap-2">{Object.entries(report.overall).map(([k, ok]) => <span key={k} className={cx('rounded-full px-3 py-1 text-[14px] font-semibold', ok ? 'bg-surface text-primary' : 'bg-warning text-white')}>{ok ? '✓' : '✗'} {LABEL[k]}</span>)}</div>
      </section>

      <section className="rounded-3xl bg-surface p-5 shadow-[0_8px_24px_rgb(18_37_29/0.06)] lg:p-6">
        {report.jobs.length === 1 ? <h2 className="text-[22px]">{job.title}</h2> : <div role="tablist" className="flex flex-wrap gap-2">
          {report.jobs.map((x, n) => <button key={x.id} role="tab" aria-selected={n === j} type="button" onClick={() => setJ(n)} className={cx('rounded-full px-4 py-2 text-[15px] font-semibold', n === j ? 'bg-ink text-white' : 'bg-page text-ink')}>{Object.values(x.checks).every((c) => c.pass) ? '✓' : '✗'} {x.title}</button>)}
        </div>}
        <p className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-1 text-[13px] text-muted">
          <span className="flex items-center gap-1.5"><span className="h-3.5 w-3.5 rounded-full border-2 border-ink" /> Our rating</span>
          <span className="flex items-center gap-1.5"><span className="h-3.5 w-3.5 rounded-full bg-primary" /> AI’s rating</span>
          <span>On average {job.avgGap} points apart</span>
        </p>
        <div className="mt-4 hidden grid-cols-[220px_minmax(0,1fr)_110px] gap-x-3 border-b border-line pb-1 text-[12px] font-semibold uppercase tracking-wide text-muted sm:grid"><span>Person</span><span>0 ··· 100</span><span className="text-right">Ours → AI</span></div>
        <ul className="mt-2 space-y-2">
          {job.people.map((p) => (
            <li key={p.id} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1 sm:grid-cols-[220px_minmax(0,1fr)_110px]">
              <span className="truncate text-[14px]" title={p.note}>{p.note}</span>
              <span className="tnum text-right text-[14px] sm:order-last"><span className="text-muted">{p.expected}</span> → <span className={cx('font-semibold', far(p) ? 'text-warning' : 'text-primary')}>{p.score}</span> <span className={cx('text-[12px]', far(p) ? 'text-warning' : 'text-muted')}>({p.gap > 0 ? '+' : ''}{p.gap})</span></span>
              <span className="relative col-span-2 h-6 rounded-full bg-page sm:col-span-1" aria-label={`Our rating ${p.expected}, AI ${p.score}`}>
                <span className={cx('absolute top-1/2 h-1 -translate-y-1/2 rounded-full', far(p) ? 'bg-warning/50' : 'bg-primary/30')} style={{ left: `${Math.min(p.expected, p.score)}%`, width: `${Math.abs(p.gap)}%` }} />
                <span className="absolute top-1/2 h-4 w-4 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-ink bg-surface" style={{ left: `${Math.max(2, Math.min(98, p.expected))}%` }} />
                <span className={cx('absolute top-1/2 h-3.5 w-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full', far(p) ? 'bg-warning' : 'bg-primary')} style={{ left: `${Math.max(2, Math.min(98, p.score))}%` }} />
              </span>
            </li>
          ))}
        </ul>
        <ul className="mt-5 space-y-1.5 border-t border-line pt-4 text-[15px]">
          <li>{job.checks.consistent.pass ? '✓' : '✗'} {unsteady.length ? `Rating changed on a second try for ${unsteady.length} of ${job.people.length}` : `Same rating twice for all ${job.people.length}`}</li>
          <li>{job.checks.fair.pass ? '✓' : '✗'} {unfair.length ? `Unfair: ${unfair.slice(0, 2).map((b) => `${b.change} changed a rating by ${b.drift}`).join('; ')}` : 'Age, a caring break, where they’re from, dyslexia or a partner’s gender changed no rating'}</li>
        </ul>
      </section>
    </div>
  );
}
