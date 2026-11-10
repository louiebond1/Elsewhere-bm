'use client';
import { useState } from 'react';
import { useCommand, ErrorText, textareaClass } from './client';
import { buttonClass, cx } from './ui';

/** Under each interview answer: add or correct something. It goes straight into their mini-me. */
export function AddToAnswer({ question, gap }: { question: string; gap: boolean }) {
  const { run, busy, error } = useCommand();
  const [open, setOpen] = useState(false);
  const [text, setText] = useState('');
  const [done, setDone] = useState(false);
  if (done) return <p className="mt-3 text-[15px] font-semibold text-primary">✓ Added to your mini-me. Your next interviews will use it.</p>;
  if (!open) return <button type="button" className={cx(buttonClass(gap ? 'primary' : 'secondary'), 'mt-4 min-h-11 rounded-full!')} onClick={() => setOpen(true)}>{gap ? 'Give your mini-me an example' : 'Add or correct something'}</button>;
  return (
    <form className="mt-4 space-y-3" onSubmit={async (e) => { e.preventDefault(); if (await run('onboarding/extra', { topic: question.slice(0, 200), answer: text }) !== null) setDone(true); }}>
      <textarea aria-label={`Your answer to: ${question}`} className={cx(textareaClass, 'min-h-[120px]')} maxLength={1500} value={text} onChange={(e) => setText(e.target.value)} placeholder="What really happened? What did you do, and what changed?" autoFocus />
      <div className="flex flex-wrap gap-2">
        <button type="submit" className={buttonClass('primary')} disabled={busy || !text.trim()}>{busy ? 'Saving…' : 'Add to my mini-me'}</button>
        <button type="button" className={buttonClass('ghost')} onClick={() => setOpen(false)}>Cancel</button>
      </div>
      <ErrorText error={error} />
    </form>
  );
}
