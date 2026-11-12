'use client';
import { useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { buttonClass, cx } from './ui';
import { ClampText } from './clamp-text';
import { useCommand, ErrorText, textareaClass } from './client';

type A = { question: string; answer: string; grounded: boolean; kind: 'interview' | 'screening'; score: number | null; reason: string | null; human?: { score: number; reason: string } | null };
/** A person's correction wins over the AI's score wherever it's shown. */
const scoreOf = (a: A) => a.human?.score ?? a.score;

/** "This shouldn't be a 10": pick the right score, say why. Every candidate for this job is then re-scored the same way. */
function Dispute({ roleId, candidateRef, index, current }: { roleId: string; candidateRef: string; index: number; current: number | null }) {
  const { run, busy, error } = useCommand();
  const [open, setOpen] = useState(false);
  const [score, setScore] = useState<number | null>(null);
  const [why, setWhy] = useState('');
  const [done, setDone] = useState(false);
  if (done) return <p role="status" className="mt-3 text-[14px] font-semibold text-primary">✓ Saved. Everyone for this job will be re-scored with your correction.</p>;
  if (!open) return <button type="button" className="mt-3 text-[14px] font-semibold text-primary underline underline-offset-2" onClick={() => setOpen(true)}>Disagree with this score?</button>;
  return (
    <div className="mt-3 rounded-2xl bg-surface p-4">
      <p className="text-[14px] font-semibold">What should it be?</p>
      <div className="mt-2 flex flex-wrap gap-1.5">{Array.from({ length: 11 }, (_, n) => <button key={n} type="button" aria-pressed={score === n} onClick={() => setScore(n)} className={cx('tnum h-9 w-9 rounded-full text-[14px] font-semibold', score === n ? 'bg-primary text-white' : n === current ? 'bg-page text-muted line-through' : 'bg-page text-ink')}>{n}</button>)}</div>
      <textarea aria-label="Why" className={cx(textareaClass, 'mt-3 min-h-[70px]')} maxLength={400} value={why} onChange={(e) => setWhy(e.target.value)} placeholder="Why? e.g. no result given, or this isn’t what the job needs" />
      <div className="mt-2 flex gap-2">
        <button type="button" className={buttonClass('primary')} disabled={busy || score == null || why.trim().length < 3} onClick={async () => { if (await run('interviews/correct', { roleId, candidateRef, questionIndex: index, humanScore: score, reason: why }) !== null) setDone(true); }}>{busy ? 'Saving…' : 'Save correction'}</button>
        <button type="button" className={buttonClass('ghost')} onClick={() => setOpen(false)}>Cancel</button>
      </div>
      <ErrorText error={error} />
    </div>
  );
}

/** Colour for a 0-10 score: strong, fair, weak, or nothing yet. */
const tone = (a: A) =>
  a.kind === 'screening' ? (a.grounded ? 'bg-surface text-ink ring-1 ring-line' : 'bg-page text-muted ring-1 ring-dashed ring-line')
  : scoreOf(a) == null || !a.grounded ? 'bg-page text-muted ring-1 ring-line'
  : scoreOf(a)! >= 7 ? 'bg-primary text-white'
  : scoreOf(a)! >= 4 ? 'bg-[#E1E8C9] text-ink'
  : 'bg-warning-tint text-warning';

/** The interview at a glance: every question as a coloured dot, one question open at a time. */
export function ClientInterview({ answers, summary, concerns, basic, fit, roleId, candidateRef }: { answers: A[]; summary: string; concerns: string[]; basic: boolean; fit: { text: string; tone: 'success' | 'neutral' }; roleId: string; candidateRef: string }) {
  const [i, setI] = useState(() => Math.max(0, answers.findIndex((a) => a.kind === 'interview')));
  const a = answers[i];
  const interview = answers.map((x, n) => ({ x, n })).filter(({ x }) => x.kind === 'interview');
  const screening = answers.map((x, n) => ({ x, n })).filter(({ x }) => x.kind === 'screening');
  const dot = ({ x, n }: { x: A; n: number }) => (
    <button key={n} type="button" onClick={() => setI(n)} aria-current={n === i ? 'true' : undefined}
      aria-label={`Question ${n + 1}${x.kind === 'screening' ? ', screening' : x.score != null && x.grounded ? `, ${x.score} out of 10` : ', no answer yet'}`}
      className={cx('press tnum flex h-10 w-10 items-center justify-center rounded-full text-[15px] font-semibold', tone(x), n === i && 'outline outline-2 outline-offset-2 outline-ink')}>
      {n + 1}
    </button>
  );
  return (
    <section aria-label="Their interview" className="rounded-3xl bg-surface p-5 shadow-[0_8px_24px_rgb(18_37_29/0.06)] lg:p-6">
      <div className="flex flex-wrap items-center gap-2">
        <span className={cx('rounded-full px-3 py-1 text-[14px] font-semibold', fit.tone === 'success' ? 'bg-success-tint text-primary' : 'bg-page text-ink')}>{fit.text}</span>
        {basic && <span className="rounded-full bg-page px-3 py-1 text-[13px] text-muted" title="Each answer is their closest example, without AI. The AI interview replaces it when ready.">Basic interview</span>}
      </div>
      <p className="mt-3 text-[17px] leading-snug">{summary}</p>

      <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:gap-8">
        <div><p className="mb-2 text-[12px] font-semibold uppercase tracking-wide text-muted">Interview</p><div className="flex flex-wrap gap-2">{interview.map(dot)}</div></div>
        {screening.length > 0 && <div><p className="mb-2 text-[12px] font-semibold uppercase tracking-wide text-muted">Screening</p><div className="flex flex-wrap gap-2">{screening.map(dot)}</div></div>}
      </div>
      <p className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-[13px] text-muted" aria-hidden>
        <span className="flex items-center gap-1.5"><span className="h-3 w-3 rounded-full bg-primary" /> Strong</span>
        <span className="flex items-center gap-1.5"><span className="h-3 w-3 rounded-full bg-[#E1E8C9]" /> Some</span>
        <span className="flex items-center gap-1.5"><span className="h-3 w-3 rounded-full bg-warning-tint ring-1 ring-warning/40" /> Weak</span>
        <span className="flex items-center gap-1.5"><span className="h-3 w-3 rounded-full bg-page ring-1 ring-line" /> No answer yet</span>
      </p>

      <div key={i} className="rise-in mt-4 rounded-2xl bg-page p-5">
        <p className="font-display text-[19px] font-semibold leading-snug">{a.question}</p>
        <div className="mt-3">{a.grounded ? <ClampText text={`“${a.answer}”`} className="text-[16px] leading-relaxed" /> : <p className="text-[16px] text-muted">No answer yet</p>}</div>
        {a.kind === 'interview' && scoreOf(a) != null && a.grounded && (
          <div className="mt-4 flex items-center gap-3">
            <span aria-hidden className="flex gap-1">{Array.from({ length: 10 }, (_, k) => <span key={k} className={cx('h-2 w-4 rounded-full', k < scoreOf(a)! ? (scoreOf(a)! >= 7 ? 'bg-primary' : scoreOf(a)! >= 4 ? 'bg-[#B6BF81]' : 'bg-warning') : 'bg-line')} />)}</span>
            <span className="tnum text-[14px] font-semibold">{scoreOf(a)}/10</span>
          </div>
        )}
        {a.reason && a.grounded && <p className="mt-2 text-[14px] text-muted">{a.human ? <span className="line-through">AI: {a.score}/10.</span> : null} {a.reason}</p>}
        {a.human && <p className="mt-2 rounded-xl bg-success-tint px-3 py-2 text-[14px]"><span className="font-semibold text-primary">Corrected to {a.human.score}/10</span> by your team: {a.human.reason}</p>}
        {a.kind === 'interview' && <Dispute roleId={roleId} candidateRef={candidateRef} index={i} current={scoreOf(a)} />}
      </div>

      <div className="mt-4 flex items-center justify-between">
        <button type="button" className={cx(buttonClass('ghost'), 'gap-1')} disabled={i === 0} onClick={() => setI(i - 1)}><ChevronLeft aria-hidden size={18} /> Back</button>
        <span className="tnum text-[14px] text-muted">{i + 1} of {answers.length}</span>
        <button type="button" className={cx(buttonClass('secondary'), 'gap-1 rounded-full!')} disabled={i === answers.length - 1} onClick={() => setI(i + 1)}>Next <ChevronRight aria-hidden size={18} /></button>
      </div>

      {concerns.length > 0 && (
        <div className="mt-5 flex flex-wrap items-center gap-2 border-t border-line pt-4">
          <span className="text-[14px] font-semibold">Ask them about</span>
          {concerns.map((c) => <span key={c} className="rounded-full bg-warning-tint px-3 py-1 text-[14px] text-warning">{c.toLowerCase()}</span>)}
        </div>
      )}
    </section>
  );
}
