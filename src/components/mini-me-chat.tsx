'use client';
import { useEffect, useRef, useState } from 'react';
import { ArrowUp } from 'lucide-react';
import { useCommand, ErrorText } from './client';
import { cx } from './ui';

type Msg = { role: 'assistant' | 'user'; text: string };

/** The in-app coach: one question at a time; what you say goes straight into your mini-me. Fits on one screen. */
export function MiniMeChat({ initial }: { initial: Msg[] }) {
  const { run, busy, error } = useCommand<{ reply: string | null; saved?: number }>();
  const [msgs, setMsgs] = useState<Msg[]>(initial);
  const [text, setText] = useState('');
  const [note, setNote] = useState<string | null>(null);
  const end = useRef<HTMLDivElement>(null);
  const box = useRef<HTMLTextAreaElement>(null);
  const started = useRef(false);
  useEffect(() => { end.current?.scrollIntoView({ block: 'end' }); }, [msgs.length, busy]);
  // First visit: the coach says hello and asks the first question.
  useEffect(() => {
    if (started.current || initial.length) return;
    started.current = true;
    void run('minime/chat', { text: null }, { refresh: false }).then((r) => { if (r?.reply) setMsgs([{ role: 'assistant', text: r.reply }]); });
  }, [initial.length, run]);
  const send = async () => {
    const t = text.trim();
    if (!t || busy) return;
    setMsgs((m) => [...m, { role: 'user', text: t }]); setText(''); setNote(null);
    const r = await run('minime/chat', { text: t }, { refresh: false });
    if (!r) { setMsgs((m) => m.slice(0, -1)); setText(t); return; }
    if (r.reply) setMsgs((m) => [...m, { role: 'assistant', text: r.reply! }]);
    if (r.saved) setNote(`Saved ${r.saved} thing${r.saved === 1 ? '' : 's'} to your mini-me`);
    box.current?.focus();
  };
  return (
    <section aria-label="Chat with your coach" className="flex h-[calc(100dvh-360px)] min-h-[380px] flex-col overflow-hidden rounded-3xl bg-surface shadow-[0_8px_24px_rgb(18_37_29/0.08)]">
      <div className="flex-1 space-y-3 overflow-y-auto p-5 lg:p-7" aria-live="polite">
        {msgs.map((m, i) => (
          <p key={i} className={cx('max-w-[78%] whitespace-pre-wrap rounded-3xl px-5 py-3 text-[17px] leading-relaxed', m.role === 'user' ? 'ml-auto rounded-br-lg bg-primary text-white' : 'rounded-bl-lg bg-page text-ink')}>{m.text}</p>
        ))}
        {busy && <p className="w-fit rounded-3xl rounded-bl-lg bg-page px-5 py-3 text-[17px] text-muted">…</p>}
        <div ref={end} />
      </div>
      <div className="border-t border-line p-3 lg:p-4">
        {note && <p role="status" className="mb-2 px-2 text-[14px] font-semibold text-primary">✓ {note}</p>}
        <ErrorText error={error} />
        <form className="flex items-end gap-2" onSubmit={(e) => { e.preventDefault(); void send(); }}>
          <label htmlFor="mm-input" className="sr-only">Your answer</label>
          <textarea id="mm-input" ref={box} rows={2} maxLength={3000} value={text} onChange={(e) => setText(e.target.value)} placeholder="Type your answer…"
            onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void send(); } }}
            className="max-h-40 min-h-12 flex-1 resize-none rounded-2xl bg-page px-4 py-3 text-[17px] focus:outline-none focus:ring-2 focus:ring-primary" />
          <button type="submit" aria-label="Send" disabled={busy || !text.trim()} className="press flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-primary text-white disabled:opacity-40"><ArrowUp size={22} aria-hidden /></button>
        </form>
      </div>
    </section>
  );
}
