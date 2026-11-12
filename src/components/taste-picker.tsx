'use client';
import { useState } from 'react';
import { useCommand, ErrorText, inputClass } from './client';
import { buttonClass, cx } from './ui';
import { ClampText } from './clamp-text';

type Pair = { roleId: string; roleTitle: string; questionIndex: number; question: string; a: { id: string; text: string }; b: { id: string; text: string } };

/** Two real, anonymous answers to the same question: pick the one that suits the job better. Optional, any time. */
export function TastePicker({ pair }: { pair: Pair }) {
  const { run, busy, error } = useCommand();
  const [why, setWhy] = useState('');
  const pick = (preferred: string, other: string) => run('taste/choose', { roleId: pair.roleId, questionIndex: pair.questionIndex, preferredId: preferred, otherId: other, reason: why });
  const card = (label: string, text: string, onPick: () => void) => (
    <div className="flex flex-col rounded-2xl bg-page p-5">
      <p className="text-[13px] font-semibold uppercase tracking-wide text-muted">{label}</p>
      <div className="mt-2 flex-1"><ClampText text={`“${text}”`} lines={4} className="text-[16px] leading-relaxed" /></div>
      <button type="button" className={cx(buttonClass('secondary'), 'mt-4 rounded-full!')} disabled={busy} onClick={onPick}>This one suits us better</button>
    </div>
  );
  return (
    <section aria-label="Which answer suits you better?" className="rounded-3xl bg-surface p-5 shadow-[0_8px_24px_rgb(18_37_29/0.06)] lg:p-6">
      <p className="text-[14px] text-muted">From your job: {pair.roleTitle}</p>
      <p className="mt-1 font-display text-[20px] font-semibold leading-snug">{pair.question}</p>
      <div className="mt-4 grid gap-3 md:grid-cols-2">
        {card('Answer A', pair.a.text, () => pick(pair.a.id, pair.b.id))}
        {card('Answer B', pair.b.text, () => pick(pair.b.id, pair.a.id))}
      </div>
      <input className={cx(inputClass, 'mt-4')} maxLength={400} value={why} onChange={(e) => setWhy(e.target.value)} placeholder="Why? (optional) e.g. it gives a real result, it shows ownership" aria-label="Why (optional)" />
      <ErrorText error={error} />
    </section>
  );
}
