'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Clock, Lock } from 'lucide-react';
import { useCommand, ErrorText, textareaClass } from './client';
import { buttonClass, cx } from './ui';
import { ClampText } from './clamp-text';

type QA = { question: string; answer: string | null; key: string | null; kind: 'interview' | 'screening' };

/** "23h 10m left": time left to change answers. */
function useLeft(deadline: string) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 30000); return () => clearInterval(t); }, []);
  const ms = new Date(deadline).getTime() - now;
  if (ms <= 0) return null;
  const h = Math.floor(ms / 3600000); const m = Math.floor((ms % 3600000) / 60000);
  return h ? `${h}h ${m}m` : `${m}m`;
}

export function Countdown({ deadline, gaps }: { deadline: string; gaps: number }) {
  const left = useLeft(deadline);
  if (!left) return <p className="flex items-center gap-2 rounded-2xl bg-surface px-4 py-3 text-[15px] text-muted shadow-[0_2px_8px_rgb(18_37_29/0.06)]"><Lock size={18} aria-hidden /> This interview is final. What you add to your mini-me now helps your next ones.</p>;
  return (
    <p className="flex flex-wrap items-center gap-2 rounded-2xl bg-warning-tint px-4 py-3 text-[16px] text-ink">
      <Clock size={18} aria-hidden className="text-warning" />
      <span><span className="font-semibold">{left} left</span> to {gaps ? `answer the ${gaps} it didn’t know and ` : ''}change any answer. Your interview updates straight away.</span>
    </p>
  );
}

/** Change or add an answer. Checklist questions update that answer; job-specific ones are saved against the question. */
function EditAnswer({ qa, open }: { qa: QA; open: boolean }) {
  const router = useRouter();
  const { run, busy, error } = useCommand();
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(qa.answer ?? '');
  const [saved, setSaved] = useState(false);
  if (!open) return null;
  if (saved) return <p role="status" className="mt-4 text-[15px] font-semibold text-primary">✓ Saved to your mini-me. Updating this interview…</p>;
  if (!editing) return <button type="button" className={cx(buttonClass(qa.answer ? 'secondary' : 'primary'), 'mt-4 min-h-11 rounded-full!')} onClick={() => setEditing(true)}>{qa.answer ? 'Change this answer' : 'Answer this one'}</button>;
  const save = async () => {
    const ok = qa.key
      ? await run('onboarding/answer', { key: qa.key, answer: text }, { refresh: false })
      : await run('onboarding/extra', { topic: qa.question.slice(0, 200), answer: text }, { refresh: false });
    if (ok !== null) { setSaved(true); setTimeout(() => router.refresh(), 2500); setTimeout(() => router.refresh(), 7000); }
  };
  return (
    <div className="mt-4 space-y-3">
      <textarea aria-label={`Your answer to: ${qa.question}`} className={cx(textareaClass, 'min-h-[110px]')} maxLength={1500} value={text} onChange={(e) => setText(e.target.value)} placeholder="In your own words: what did you do, and what happened?" autoFocus />
      <div className="flex flex-wrap gap-2">
        <button type="button" className={buttonClass('primary')} disabled={busy || !text.trim()} onClick={save}>{busy ? 'Saving…' : 'Save'}</button>
        <button type="button" className={buttonClass('ghost')} onClick={() => { setText(qa.answer ?? ''); setEditing(false); }}>Cancel</button>
      </div>
      <ErrorText error={error} />
    </div>
  );
}

/** The interview, one question at a time, in two groups. Fits on one screen. */
export function InterviewDeck({ answers, open }: { answers: QA[]; open: boolean }) {
  const [i, setI] = useState(() => Math.max(0, answers.findIndex((a) => !a.answer)));
  const a = answers[i];
  const groups: { title: string; kind: 'interview' | 'screening' }[] = [{ title: 'Interview', kind: 'interview' }, { title: 'Screening', kind: 'screening' }];
  return (
    <section aria-label="Interview questions">
      <div className="flex flex-col gap-3 lg:flex-row lg:gap-8">
        {groups.map((g) => (
          <nav key={g.kind} aria-label={g.title} className="flex flex-wrap items-center gap-2">
            <span className="mr-1 text-[13px] font-semibold uppercase tracking-wide text-muted">{g.title}</span>
            {answers.map((x, n) => x.kind !== g.kind ? null : (
              <button key={n} type="button" onClick={() => setI(n)} aria-current={n === i ? 'true' : undefined} aria-label={`Question ${n + 1}${x.answer ? '' : ', not answered yet'}`}
                className={cx('press tnum flex h-10 w-10 items-center justify-center rounded-full text-[15px] font-semibold', n === i ? 'bg-primary text-white' : x.answer ? 'bg-surface text-ink shadow-[0_2px_8px_rgb(18_37_29/0.06)]' : 'bg-warning-tint text-warning ring-1 ring-warning/40')}>{n + 1}</button>
            ))}
          </nav>
        ))}
      </div>
      <div key={i} className="rise-in mt-4 rounded-3xl bg-surface p-6 shadow-[0_8px_24px_rgb(18_37_29/0.06)] lg:p-7">
        <p className="text-[13px] font-semibold uppercase tracking-wide text-muted">{a.kind === 'screening' ? 'Screening' : 'Interview'} · question {i + 1} of {answers.length}</p>
        <p className="mt-1 font-display text-[21px] font-semibold leading-snug">{a.question}</p>
        {a.answer
          ? <div className="mt-4 rounded-2xl bg-page p-4"><span className="mb-1 block text-[13px] font-semibold text-primary">Your mini-me said</span><ClampText text={`“${a.answer}”`} className="text-[17px] leading-relaxed" /></div>
          : <p className="mt-4 rounded-2xl bg-warning-tint p-4 text-[16px] text-warning">Your mini-me didn’t know this one yet.</p>}
        <EditAnswer key={`e-${i}-${a.answer ?? ''}`} qa={a} open={open} />
        <div className="mt-6 flex items-center justify-between border-t border-line pt-4">
          <button type="button" className={buttonClass('ghost')} disabled={i === 0} onClick={() => setI(i - 1)}>← Back</button>
          {i < answers.length - 1 ? <button type="button" className={cx(buttonClass('primary'), 'rounded-full!')} onClick={() => setI(i + 1)}>Next →</button> : <span className="text-[15px] font-semibold text-primary">That’s the whole interview</span>}
        </div>
      </div>
    </section>
  );
}

/** A small "23h left" pill for lists. */
export function TimeLeftPill({ deadline }: { deadline: string }) {
  const left = useLeft(deadline);
  if (!left) return <span className="whitespace-nowrap rounded-full bg-page px-3 py-1 text-[14px] text-muted">Final</span>;
  return <span className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-full bg-warning-tint px-3 py-1 text-[14px] font-semibold text-warning"><Clock size={14} aria-hidden /> {left} left</span>;
}
