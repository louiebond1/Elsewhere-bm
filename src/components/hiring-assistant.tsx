'use client';
import { useEffect, useRef, useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCommand, ErrorText, ActionButton, Dialog, api, type ApiError } from './client';
import { buttonClass, cx } from './ui';
import { PasteFromAi } from './ai-task';
import { previewUnits } from './role-form';
import { creditsLabel } from '../lib/format';
import { MIN_ITEMS, QUICK_ANSWERS, REGION_LABEL, MODE_LABEL, FAMILY_LABEL, readyToSave, missingSlots, type Understanding, type Slot } from '../lib/hiring';

type Msg = { role: 'assistant' | 'user'; text: string; at: string };
type Fact = { id: string; text: string };
type Props = { conversationId: string | null; messages: Msg[]; understanding: Understanding; lastAsked: Slot | null; facts: Fact[]; ratePence: number; demo: boolean };

const STILL_NEEDED: Record<Slot, string> = {
  title: 'job title', outcomes: 'what they should achieve', skills: `at least ${MIN_ITEMS} things that matter`, teachable: '',
  salary: 'salary', family: 'area', location: 'location', workMode: 'how they will work',
};

/** Chat with the hiring assistant, plus a live "Your role so far" card. Nothing is charged here. */
export function HiringAssistant({ conversationId, messages, understanding: u, lastAsked, facts, demo, autoAi = false }: Props & { autoAi?: boolean }) {
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
  const price = u.salaryPounds ? previewUnits(u.salaryPounds) : null;

  // One tap to start: show the cost in plain words, then save the job and start the search together.
  type Quote = { title: string; totalUnits: string; depositUnits: string; isExtra: boolean; included: number; enoughForExtra: boolean };
  const activate = useCommand();
  const [quote, setQuote] = useState<Quote | null>(null);
  const [quoteError, setQuoteError] = useState<ApiError | null>(null);
  const [savedId, setSavedId] = useState<string | null>(null);
  const openStart = async () => {
    if (!conversationId) return;
    setQuoteError(null);
    const r = await api<Quote>(`client/hiring/${conversationId}/quote`);
    if (r.ok) setQuote(r.data); else setQuoteError(r.error);
  };
  const saveOnly = async () => {
    if (!conversationId) return;
    const r = await save.run(`client/hiring/${conversationId}/save`, {}, { refresh: false });
    if (r?.id) router.push(`/client/roles/${r.id}`);
  };
  const startSearch = async () => {
    if (!conversationId || !quote) return;
    const id = savedId ?? (await save.run(`client/hiring/${conversationId}/save`, {}, { refresh: false }))?.id;
    if (!id) return;
    setSavedId(id);
    const ok = await activate.run(`roles/${id}/activate`, { confirmExtraDeposit: quote.isExtra }, { refresh: false });
    if (ok !== null) router.push(`/client/roles/${id}`);
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
          {ready && !pending && conversationId && <button type="button" className={cx(buttonClass('primary', true), 'lg:hidden')} onClick={openStart}>Find my best people</button>}
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
          <div className="mt-3">
            <PasteFromAi autoOpen={autoAi} placeLabel="Put it in my message" note="Your AI drafts the brief. You check and send."
              prompt="Help me write a short hiring brief for a role I’m filling. Ask me about: the job title, what they’ll do day to day, what they must already be able to do, what would be nice to have, what they should own after six months, the salary, where they’ll work and whether it’s office, hybrid or remote. Don’t invent anything I haven’t told you. Then give me the brief as one short paragraph I can paste."
              onPaste={(t) => { setText(t); setTimeout(() => box.current?.focus(), 50); }} />
          </div>
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
          {price && <p className="mt-4 rounded-lg bg-page px-3 py-2 text-[14px]">If you hire someone: {creditsLabel(price)}. Nothing is used now.</p>}
          <button type="button" className={cx(buttonClass('primary', true), 'mt-4 min-h-14 text-[18px]')} disabled={!ready || !conversationId} onClick={openStart}>Find my best people</button>
          <p className="mt-2 text-[13px] text-muted">{ready ? 'You’ll see what it costs before anything starts.' : `Still needed: ${needed.join(', ')}.`}</p>
          <ErrorText error={quoteError ?? remove.error} />
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
      <Dialog open={!!quote} onClose={() => setQuote(null)} title={`Find your best people for ${quote?.title ?? 'this job'}?`}>
        {quote && (
          <div className="space-y-3 text-[16px]">
            <p>It costs <span className="font-semibold">{creditsLabel(quote.totalUnits)}</span>, only if you hire someone.</p>
            {quote.isExtra
              ? <p className="rounded-lg bg-warning-tint px-3 py-2 text-warning">This is an extra job on top of the {quote.included} in your plan, so <span className="font-semibold">{creditsLabel(quote.depositUnits)}</span> {BigInt(quote.depositUnits) === 10000n ? 'is' : 'are'} used now. It counts towards the cost if you hire.</p>
              : <p>{creditsLabel(quote.depositUnits)} of that {BigInt(quote.depositUnits) === 10000n ? 'is' : 'are'} used when someone agrees to meet you. Nothing is used now.</p>}
            {quote.isExtra && !quote.enoughForExtra && <p className="text-danger">You don’t have enough credits for this right now. Save it for later, or ask for more credits.</p>}
            <ErrorText error={save.error ?? activate.error} />
            {savedId && activate.error && <p className="text-[14px]"><Link href={`/client/roles/${savedId}`}>Your job is saved. Open it</Link></p>}
            <div className="flex flex-col gap-2 pt-2">
              <button type="button" className={cx(buttonClass('primary', true), 'min-h-14 text-[18px]')} disabled={save.busy || activate.busy || (quote.isExtra && !quote.enoughForExtra)} onClick={startSearch}>{save.busy || activate.busy ? 'Starting…' : 'Find my best people'}</button>
              {!savedId && <button type="button" className={buttonClass('secondary', true)} disabled={save.busy || activate.busy} onClick={saveOnly}>Save it for later</button>}
              <button type="button" className={buttonClass('ghost', true)} onClick={() => setQuote(null)}>Not yet</button>
            </div>
          </div>
        )}
      </Dialog>
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
