'use client';
import { useEffect, useRef, useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCommand, ErrorText, ActionButton } from './client';
import { buttonClass, cx } from './ui';
import { previewUnits } from './role-form';
import { gbp } from '../lib/format';
import { MIN_ITEMS, QUICK_ANSWERS, REGION_LABEL, MODE_LABEL, FAMILY_LABEL, readyToSave, missingSlots, type Understanding, type Slot } from '../lib/hiring';

type Msg = { role: 'assistant' | 'user'; text: string; at: string };
type Fact = { id: string; text: string };
type Props = { conversationId: string | null; messages: Msg[]; understanding: Understanding; lastAsked: Slot | null; facts: Fact[]; ratePence: number; demo: boolean };

const STILL_NEEDED: Record<Slot, string> = {
  title: 'job title', outcomes: 'what they should achieve', skills: `at least ${MIN_ITEMS} things that matter`, teachable: '',
  salary: 'salary', family: 'area', location: 'location', workMode: 'how they will work',
};

/** Chat with the hiring assistant, plus a live "Your role so far" card. Nothing is charged here. */
export function HiringAssistant({ conversationId, messages, understanding: u, lastAsked, facts, ratePence, demo }: Props) {
  const router = useRouter();
  const send = useCommand<{ id: string }>();
  const save = useCommand<{ id: string }>();
  const remove = useCommand();
  const [text, setText] = useState('');
  // A sent message shows until the server's copy arrives (the message count moves on).
  const [sent, setSent] = useState<{ text: string; at: number } | null>(null);
  const pending = sent && sent.at === messages.length ? sent.text : null;
  const [, startTransition] = useTransition();
  const end = useRef<HTMLDivElement>(null);
  const box = useRef<HTMLTextAreaElement>(null);

  useEffect(() => { end.current?.scrollIntoView({ block: 'end' }); }, [messages.length, pending]);

  const submit = async (value: string) => {
    const t = value.trim();
    if (!t || send.busy) return;
    setSent({ text: t, at: messages.length });
    setText('');
    const r = await send.run('client/hiring/message', { conversationId, text: t }, { refresh: false });
    if (!r) { setSent(null); setText(t); box.current?.focus(); return; }
    startTransition(() => router.refresh());
    box.current?.focus();
  };

  const ready = readyToSave(u);
  const needed = missingSlots(u).filter((s) => s !== 'teachable').map((s) => STILL_NEEDED[s]);
  const quick = lastAsked ? QUICK_ANSWERS[lastAsked] : undefined;
  const items = u.mustHaves.length + u.niceToHaves.length;
  const price = u.salaryPounds ? (() => { const units = previewUnits(u.salaryPounds); return { credits: units / 10000, pence: Math.round((units * ratePence) / 10000) }; })() : null;

  const createRole = async () => {
    if (!conversationId) return;
    const r = await save.run(`client/hiring/${conversationId}/save`, {}, { refresh: false });
    if (r?.id) router.push(`/client/roles/${r.id}`);
  };
  const drop = (list: 'mustHaves' | 'niceToHaves' | 'outcomes' | 'teachable', index: number) => conversationId && remove.run(`client/hiring/${conversationId}/remove`, { list, index });

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
      <section aria-label="Conversation with your hiring assistant" className="flex min-h-[60vh] flex-col rounded-xl border border-line bg-surface">
        {demo && <p className="rounded-t-xl bg-info-tint px-4 py-2 text-[13px]">Demo mode: the assistant picks out key words from what you type. It is not live AI.</p>}
        <div className="flex-1 space-y-3 overflow-y-auto p-4" aria-live="polite">
          {messages.map((m, i) => <Bubble key={i} m={m} />)}
          {pending && <Bubble m={{ role: 'user', text: pending, at: '' }} />}
          {pending && <p className="text-[14px] text-muted">Your assistant is thinking…</p>}
          {ready && !pending && conversationId && <button type="button" className={cx(buttonClass('primary', true), 'lg:hidden')} disabled={save.busy} onClick={createRole}>{save.busy ? 'Creating…' : 'Create role'}</button>}
          <div ref={end} />
        </div>
        <div className="border-t border-line p-3">
          {quick && !pending && (
            <div className="mb-2 flex flex-wrap gap-2" aria-label="Quick answers">
              {quick.map((q) => <button key={q} type="button" className="min-h-11 rounded-full border border-primary px-4 text-[15px] text-primary hover:bg-info-tint" onClick={() => submit(q)}>{q}</button>)}
            </div>
          )}
          <form className="flex items-end gap-2" onSubmit={(e) => { e.preventDefault(); submit(text); }}>
            <label htmlFor="assistant-input" className="sr-only">Your answer</label>
            <textarea id="assistant-input" ref={box} rows={2} maxLength={2000} value={text} placeholder="Type your answer…" className="min-h-11 flex-1 resize-none rounded-lg border border-line bg-surface px-3 py-2 text-[16px]"
              onChange={(e) => setText(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submit(text); } }} />
            <button type="submit" className={buttonClass('primary')} disabled={send.busy || !text.trim()}>Send</button>
          </form>
          <ErrorText error={send.error} />
        </div>
      </section>

      <aside className="h-fit space-y-4 lg:sticky lg:top-4">
        <div className="rounded-xl border border-line bg-surface p-4">
          <h2 className="text-[18px] font-semibold">Your role so far</h2>
          <dl className="mt-3 space-y-2 text-[15px]">
            <Row done={!!u.title} label="Job">{u.title}</Row>
            <Row done={!!u.salaryPounds} label="Salary">{u.salaryPounds ? `£${u.salaryPounds.toLocaleString('en-GB')}` : null}</Row>
            <Row done={!!u.locationRegion} label="Where">{u.locationRegion ? `${REGION_LABEL[u.locationRegion]}${u.assumed.includes('locationRegion') ? ' (same as last time)' : ''}` : null}</Row>
            <Row done={!!u.workMode} label="How">{u.workMode ? `${MODE_LABEL[u.workMode]}${u.assumed.includes('workMode') ? ' (same as last time)' : ''}` : null}</Row>
            <Row done={!!u.roleFamily} label="Area">{u.roleFamily ? FAMILY_LABEL[u.roleFamily] : null}</Row>
          </dl>
          <List title="What they should achieve" done={u.outcomes.length > 0} items={u.outcomes} onRemove={(i) => drop('outcomes', i)} busy={remove.busy} />
          <List title="Must have" done={items >= MIN_ITEMS} items={u.mustHaves.map((x) => x.label)} onRemove={(i) => drop('mustHaves', i)} busy={remove.busy} />
          {items < MIN_ITEMS && <p className="ml-6 mt-1 text-[13px] text-muted">{items} of {MIN_ITEMS} things that matter so far.</p>}
          {u.niceToHaves.length > 0 && <List title="Nice to have" done items={u.niceToHaves.map((x) => x.label)} onRemove={(i) => drop('niceToHaves', i)} busy={remove.busy} />}
          {u.teachable.length > 0 && <List title="You'll teach them" done items={u.teachable} onRemove={(i) => drop('teachable', i)} busy={remove.busy} />}
          {price && <p className="mt-4 rounded-lg bg-page px-3 py-2 text-[14px]">If you hire through us: {price.credits} {price.credits === 1 ? 'credit' : 'credits'} ({gbp(price.pence)}). Nothing is charged now.</p>}
          <button type="button" className={cx(buttonClass('primary', true), 'mt-4')} disabled={!ready || save.busy || !conversationId} onClick={createRole}>{save.busy ? 'Creating…' : 'Create role'}</button>
          <p className="mt-2 text-[13px] text-muted">{ready ? 'It is saved as a draft for you to check. Nothing is charged until you make it live.' : `Still needed: ${needed.join(', ')}.`}</p>
          <ErrorText error={save.error ?? remove.error} />
        </div>

        {facts.length > 0 && (
          <details className="rounded-xl border border-line bg-surface p-4">
            <summary className="cursor-pointer text-[15px] font-medium">What I’ve learned about how you hire ({facts.length})</summary>
            <ul className="mt-3 space-y-2 text-[14px]">
              {facts.map((f) => <li key={f.id} className="flex items-start justify-between gap-2"><span>{f.text}</span><ActionButton path="client/hiring/forget" body={{ factId: f.id }} label="Forget" variant="ghost" /></li>)}
            </ul>
          </details>
        )}

        <div className="flex flex-wrap items-center justify-between gap-2 text-[14px]">
          {conversationId ? <ActionButton path={`client/hiring/${conversationId}/start-over`} label="Start again" variant="ghost" confirm={{ title: 'Start again?', body: 'This clears this conversation. Your roles are not affected.', confirmLabel: 'Start again' }} /> : <span />}
          <Link href="/client/roles/new?form=1">Prefer a form?</Link>
        </div>
      </aside>
    </div>
  );
}

function Bubble({ m }: { m: Msg }) {
  const mine = m.role === 'user';
  return (
    <div className={cx('flex', mine ? 'justify-end' : 'justify-start')}>
      <div className={cx('max-w-[85%] whitespace-pre-wrap rounded-2xl px-4 py-2 text-[15px]', mine ? 'bg-primary text-white' : 'bg-page text-ink')}>
        {!mine && <span className="mb-0.5 block text-[12px] font-semibold text-muted">Hiring assistant</span>}
        {m.text}
      </div>
    </div>
  );
}

function Row({ done, label, children }: { done: boolean; label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-baseline gap-2">
      <span aria-hidden className={done ? 'text-success' : 'text-muted'}>{done ? '✓' : '○'}</span>
      <dt className="w-16 shrink-0 text-muted">{label}</dt>
      <dd className={done ? '' : 'text-muted'}>{children ?? 'Not yet'}</dd>
    </div>
  );
}

function List({ title, done, items, onRemove, busy }: { title: string; done: boolean; items: string[]; onRemove: (i: number) => void; busy: boolean }) {
  return (
    <div className="mt-4">
      <h3 className="flex items-baseline gap-2 text-[15px] font-medium"><span aria-hidden className={done ? 'text-success' : 'text-muted'}>{done ? '✓' : '○'}</span>{title}</h3>
      {items.length === 0 ? <p className="ml-6 text-[14px] text-muted">Not yet</p> : (
        <ul className="ml-6 mt-1 space-y-1">
          {items.map((t, i) => (
            <li key={`${t}-${i}`} className="flex items-start justify-between gap-2 text-[14px]">
              <span>{t}</span>
              <button type="button" className="h-7 w-7 shrink-0 rounded-full text-muted hover:bg-page" aria-label={`Remove ${t}`} disabled={busy} onClick={() => onRemove(i)}>×</button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
