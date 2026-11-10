'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Check, Pencil, MessageCircle, Zap } from 'lucide-react';
import { useCommand, ErrorText, textareaClass, Dialog } from './client';
import { LetMyAiButton, AiConnectSheet } from './ai-task';
import { CopyBox } from './copy-box';
import { buttonClass, cx } from './ui';
import { AI_APPS } from '@/lib/ai-connect';

type Q = { key: string; text: string; hint: string | null; answer: string | null; source: 'ai' | 'self' | null; provider: string | null; approved: boolean };
type Section = { key: string; title: string; questions: Q[] };


/**
 * While their AI is connected, keep the page up to date: refresh the moment they come back to this tab
 * (e.g. from ChatGPT), and every 15 seconds while it is open and visible.
 */
export function useLiveRefresh(connected: boolean, waiting: boolean, refresh: () => void) {
  useEffect(() => {
    if (!connected) return;
    const onShow = () => { if (document.visibilityState === 'visible') refresh(); };
    document.addEventListener('visibilitychange', onShow);
    window.addEventListener('focus', onShow);
    const t = waiting ? setInterval(onShow, 15000) : null;
    return () => { document.removeEventListener('visibilitychange', onShow); window.removeEventListener('focus', onShow); if (t) clearInterval(t); };
  }, [connected, waiting, refresh]);
}

export const CHECKLIST_PROMPT = 'Let’s build up my Elsewhere profile. Use what you already know about me, then get to know me with a relaxed chat about whatever’s missing, and save everything as we go.';

/** Ask their AI to fill in the checklist, or connect it first. Refreshes while answers arrive. */
export function ChecklistAi({ connected: initial, connectorUrl, autoOpen, waiting }: { connected: string | null; connectorUrl: string; autoOpen: boolean; waiting: boolean }) {
  const router = useRouter();
  const [connected, setConnected] = useState(initial);
  const [sheet, setSheet] = useState(autoOpen && !initial);
  // While their AI might be saving answers, quietly refresh so they appear without reloading.
  useLiveRefresh(!!connected, waiting, router.refresh);
  if (!connected) return (
    <>
      <LetMyAiButton connected={null} note="No one knows you better than your ChatGPT. Let it do the typing, you check it." onClick={() => setSheet(true)} />
      <AiConnectSheet open={sheet} onClose={() => setSheet(false)} connectorUrl={connectorUrl} task="build your mini-me" onConnected={(p) => setConnected(p)} />
    </>
  );
  return (
    <section aria-label="Let your AI fill it in" className="flex flex-col gap-3 rounded-3xl bg-surface p-4 shadow-[0_8px_24px_rgb(18_37_29/0.06)] lg:flex-row lg:items-center lg:gap-5 lg:p-5">
      <p className="text-[16px] lg:w-[250px] lg:shrink-0"><span className="block font-semibold">Let your {connected} do the talking</span><span className="text-muted">Paste this into <a href={connected === 'Claude' ? AI_APPS.claude.open : AI_APPS.chatgpt.open} target="_blank" rel="noreferrer">{connected}</a>. It interviews you like a friendly chat, so you can do it by voice. Answers save in batches.</span></p>
      <div className="min-w-0 flex-1"><CopyBox text={CHECKLIST_PROMPT} label="Message for your AI" /></div>
    </section>
  );
}

export function ApproveAll({ count }: { count: number }) {
  const { run, busy, error } = useCommand();
  return (
    <div>
      <button type="button" className={buttonClass('primary')} disabled={busy} onClick={() => run('onboarding/approve', { keys: 'all' })}>{busy ? 'Saving…' : `All good: approve ${count}`}</button>
      <ErrorText error={error} />
    </div>
  );
}

/** One question: the answer (or a gap), where it came from, and Looks right / Edit. */
export function Question({ q }: { q: Q }) {
  const { run, busy, error } = useCommand();
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(q.answer ?? '');
  const id = `q-${q.key}`;
  return (
    <li className="py-5">
      <p id={id} className="text-[17px] font-semibold">{q.text}</p>
      {q.hint && <p className="text-[14px] text-muted">{q.hint}</p>}
      {editing ? (
        <div className="mt-3">
          <textarea aria-labelledby={id} className={cx(textareaClass, 'min-h-[140px]')} value={text} maxLength={1500} onChange={(e) => setText(e.target.value)} autoFocus />
          <div className="mt-3 flex flex-wrap gap-2">
            <button type="button" className={buttonClass('primary')} disabled={busy} onClick={async () => { if (await run('onboarding/answer', { key: q.key, answer: text }) !== null) setEditing(false); }}>{busy ? 'Saving…' : 'Save'}</button>
            <button type="button" className={buttonClass('ghost')} onClick={() => { setText(q.answer ?? ''); setEditing(false); }}>Cancel</button>
          </div>
        </div>
      ) : q.answer ? (
        <>
          <p className="mt-2 whitespace-pre-wrap text-[17px]">{q.answer}</p>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            {q.approved
              ? <span className="inline-flex items-center gap-1.5 text-[14px] font-semibold text-primary"><Check size={16} aria-hidden /> Checked{q.source === 'ai' && q.provider ? ` · started with your ${q.provider}` : ''}</span>
              : <span className="rounded-full bg-warning-tint px-3 py-1 text-[14px] font-semibold text-warning">From your {q.provider ?? 'AI'} · to check</span>}
            {!q.approved && <button type="button" className={cx(buttonClass('secondary'), 'min-h-11')} disabled={busy} onClick={() => run('onboarding/approve', { keys: [q.key] })}>Looks right</button>}
            <button type="button" className={cx(buttonClass('ghost'), 'min-h-11 gap-1.5 text-ink')} onClick={() => setEditing(true)}><Pencil size={16} aria-hidden /> Edit</button>
          </div>
        </>
      ) : (
        <button type="button" className={cx(buttonClass('ghost'), 'mt-1 min-h-11 px-0 text-primary')} onClick={() => setEditing(true)}>I’ll answer this</button>
      )}
      <ErrorText error={error} />
    </li>
  );
}

export function ChecklistSections({ sections }: { sections: Section[] }) {
  return (
    <div className="space-y-5">
      {sections.map((s) => {
        const done = s.questions.filter((q) => q.answer).length;
        return (
          <details key={s.key} open={done < s.questions.length || s.questions.some((q) => q.answer && !q.approved)} className="group rounded-3xl bg-surface px-5 shadow-[0_8px_24px_rgb(18_37_29/0.06)] lg:px-7">
            <summary className="flex cursor-pointer list-none items-center justify-between gap-3 py-5">
              <h2 className="text-[22px] leading-7">{s.title}</h2>
              <span className="tnum whitespace-nowrap text-[15px] text-muted">{done} of {s.questions.length}</span>
            </summary>
            <ul className="divide-y divide-line border-t border-line">{s.questions.map((q) => <Question key={q.key + (q.answer ?? '') + q.approved} q={q} />)}</ul>
          </details>
        );
      })}
    </div>
  );
}

/** Everything beyond the checklist: their AI's follow-ups and anything they chose to share. More is great. */
export function Extras({ extras }: { extras: Q[] }) {
  const { run, busy, error } = useCommand();
  const [open, setOpen] = useState(false);
  const [topic, setTopic] = useState('');
  const [answer, setAnswer] = useState('');
  return (
    <section aria-labelledby="extras" className="rounded-3xl bg-surface px-5 pb-5 shadow-[0_8px_24px_rgb(18_37_29/0.06)] lg:px-7">
      <div className="flex items-center justify-between gap-3 py-5">
        <h2 id="extras" className="text-[22px] leading-7">Extra things you’ve shared</h2>
        <span className="tnum whitespace-nowrap text-[15px] text-muted">{extras.length}</span>
      </div>
      <p className="border-t border-line pt-4 text-[16px] text-muted">Follow-ups your AI asked, and anything else worth knowing: a project, a result, a story. The more your mini-me knows, the better your interviews go.</p>
      {extras.length > 0 && <ul className="divide-y divide-line">{extras.map((q) => <Question key={q.key + (q.answer ?? '') + q.approved} q={q} />)}</ul>}
      {open ? (
        <form className="mt-4 space-y-3" onSubmit={async (e) => { e.preventDefault(); if (await run('onboarding/extra', { topic, answer }) !== null) { setTopic(''); setAnswer(''); setOpen(false); } }}>
          <label className="block"><span className="text-[16px] font-semibold">What’s it about?</span>
            <input className="mt-2 h-12 w-full rounded-xl border border-control/60 bg-surface px-4 text-[17px]" value={topic} maxLength={200} onChange={(e) => setTopic(e.target.value)} placeholder="For example: The audit I helped prepare" /></label>
          <label className="block"><span className="text-[16px] font-semibold">Tell us</span>
            <textarea className={cx(textareaClass, 'mt-2 min-h-[140px]')} value={answer} maxLength={1500} onChange={(e) => setAnswer(e.target.value)} /></label>
          <div className="flex flex-wrap gap-2">
            <button type="submit" className={buttonClass('primary')} disabled={busy || !topic.trim() || !answer.trim()}>{busy ? 'Saving…' : 'Add it'}</button>
            <button type="button" className={buttonClass('ghost')} onClick={() => setOpen(false)}>Cancel</button>
          </div>
          <ErrorText error={error} />
        </form>
      ) : <button type="button" className={cx(buttonClass('secondary'), 'mt-4')} onClick={() => setOpen(true)}>Add something else</button>}
    </section>
  );
}

/** One question at a time: big card, dots for where you are, back and next. No wall of questions. */
export function QuestionDeck({ title, questions, nextHref }: { title: string; questions: Q[]; nextHref: string | null }) {
  const first = Math.max(0, questions.findIndex((q) => !q.answer || !q.approved));
  const [i, setI] = useState(first);
  const q = questions[i];
  const done = questions.filter((x) => x.approved).length;
  return (
    <section aria-label={title} className="rounded-3xl bg-surface p-6 shadow-[0_8px_24px_rgb(18_37_29/0.06)] lg:p-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-[22px] leading-7">{title}</h2>
        <span className="tnum text-[15px] text-muted">{i + 1} of {questions.length} · {done} checked</span>
      </div>
      <div className="mt-3 flex gap-1.5" aria-hidden>
        {questions.map((x, n) => <button key={x.key} type="button" tabIndex={-1} onClick={() => setI(n)} className={cx('h-1.5 flex-1 rounded-full', n === i ? 'bg-ink' : x.approved ? 'bg-primary' : x.answer ? 'bg-[#E8C27A]' : 'bg-line')} />)}
      </div>
      <ul className="mt-2" key={q.key}><Question q={q} /></ul>
      <div className="mt-2 flex items-center justify-between gap-3 border-t border-line pt-5">
        <button type="button" className={buttonClass('ghost')} disabled={i === 0} onClick={() => setI(i - 1)}>← Back</button>
        {i < questions.length - 1
          ? <button type="button" className={buttonClass('primary')} onClick={() => setI(i + 1)}>Next question →</button>
          : nextHref ? <a href={nextHref} className={cx(buttonClass('primary'), 'no-underline')}>Next section →</a> : <span className="text-[15px] font-semibold text-primary">That’s every section ✓</span>}
      </div>
    </section>
  );
}

export const ALWAYS_ON = 'I’m building my Elsewhere mini-me. In any of our chats, whenever I mention something about my work, skills, results or what I want next, save it to Elsewhere without interrupting. Now and then, when it fits naturally, ask me one of my unanswered Elsewhere questions. Never invent anything.';

/** Always-on: one sentence for their AI's settings, so it learns about them in every chat. */
export function AlwaysOn({ provider }: { provider: string }) {
  return (
    <details className="group rounded-3xl bg-surface shadow-[0_8px_24px_rgb(18_37_29/0.06)]">
      <summary className="flex cursor-pointer list-none flex-wrap items-center justify-between gap-2 p-4 lg:px-5">
        <span><span className="font-semibold">Always-on mode</span> <span className="text-muted">· let your {provider} learn about you in every chat, a little at a time</span></span>
        <span className="text-[15px] font-semibold text-primary group-open:hidden">Turn it on</span>
      </summary>
      <div className="border-t border-line p-4 lg:px-5">
        <ol className="space-y-3 text-[16px]">
          <li><span className="font-semibold">1.</span> Copy this:<div className="mt-2"><CopyBox text={ALWAYS_ON} label="Always-on instruction" /></div></li>
          <li><span className="font-semibold">2.</span> In {provider}, open its settings and paste it where you tell it about yourself or how to respond (personalisation or custom instructions).</li>
          <li><span className="font-semibold">3.</span> Just chat as normal. Over time it asks every question, and whatever it saves pops up here for you to check.</li>
        </ol>
        <p className="mt-3 text-[14px] text-muted">The Elsewhere connector needs to be switched on in those chats. Your AI decides when to use it, and you approve everything here.</p>
      </div>
    </details>
  );
}

/** Add something yourself: a heading and a few words. */
export function AddSomething() {
  const { run, busy, error } = useCommand();
  const [open, setOpen] = useState(false);
  const [topic, setTopic] = useState('');
  const [answer, setAnswer] = useState('');
  if (!open) return <button type="button" className={cx(buttonClass('secondary'), 'rounded-full! bg-surface px-7')} onClick={() => setOpen(true)}>+ Add something yourself</button>;
  return (
    <form className="w-full space-y-3 rounded-3xl bg-surface p-5 shadow-[0_8px_24px_rgb(18_37_29/0.06)]" onSubmit={async (e) => { e.preventDefault(); if (await run('onboarding/extra', { topic, answer }) !== null) { setTopic(''); setAnswer(''); setOpen(false); } }}>
      <label className="block"><span className="text-[16px] font-semibold">What’s it about?</span>
        <input className="mt-2 h-12 w-full rounded-xl border border-control/60 bg-surface px-4 text-[17px]" value={topic} maxLength={200} onChange={(e) => setTopic(e.target.value)} placeholder="For example: The audit I helped with" /></label>
      <label className="block"><span className="text-[16px] font-semibold">Tell us</span>
        <textarea className={cx(textareaClass, 'mt-2 min-h-[120px]')} value={answer} maxLength={1500} onChange={(e) => setAnswer(e.target.value)} /></label>
      <div className="flex flex-wrap gap-2">
        <button type="submit" className={buttonClass('primary')} disabled={busy || !topic.trim() || !answer.trim()}>{busy ? 'Saving…' : 'Add it'}</button>
        <button type="button" className={buttonClass('ghost')} onClick={() => setOpen(false)}>Cancel</button>
      </div>
      <ErrorText error={error} />
    </form>
  );
}

/** The big "Let your ChatGPT do the talking" card. Connect first; once connected, copy the message and go. */
export function ConnectBanner({ connected: initial, connectorUrl, autoOpen, waiting }: { connected: string | null; connectorUrl: string; autoOpen: boolean; waiting: boolean }) {
  const router = useRouter();
  const [connected, setConnected] = useState(initial);
  const [sheet, setSheet] = useState<null | 'chatgpt' | 'claude'>(autoOpen && !initial ? 'chatgpt' : null);
  const [copied, setCopied] = useState(false);
  useLiveRefresh(!!connected, waiting, router.refresh);
  const app = connected ?? 'ChatGPT';
  const copy = async () => { try { await navigator.clipboard.writeText(CHECKLIST_PROMPT); setCopied(true); setTimeout(() => setCopied(false), 2500); } catch { setCopied(false); } };
  return (
    <section aria-label={`Let your ${app} do the talking`} className="relative overflow-hidden rounded-[28px] bg-surface p-5 shadow-[0_16px_40px_-16px_rgb(18_37_29/0.35)] lg:p-7">
      <svg aria-hidden viewBox="0 0 300 160" preserveAspectRatio="none" className="pointer-events-none absolute bottom-0 right-0 hidden h-full w-[280px] lg:block"><path d="M300 0 C250 40 230 120 120 150 L300 160 Z" fill="#2F6A4B" opacity=".9" /><path d="M300 40 C260 90 220 140 60 160 L300 160 Z" fill="#9CC3A6" opacity=".45" /></svg>
      <div className="relative flex flex-col gap-5 lg:flex-row lg:items-center lg:pr-[220px]">
        <span aria-hidden className="flex h-20 w-20 shrink-0 items-center justify-center rounded-3xl bg-primary text-white"><MessageCircle size={38} strokeWidth={1.6} /></span>
        <div className="min-w-0 flex-1">
          <h2 className="text-[24px] leading-8 lg:text-[28px]">Let your {app} do the talking</h2>
          <p className="mt-1 text-[16px] text-muted">Say ‘Let’s build up my Elsewhere profile’ and just chat. Voice works too. What it learns goes straight into your profile as you chat.</p>
          {!connected && <p className="mt-1 flex flex-wrap gap-x-4 text-[16px] font-semibold"><button type="button" className="text-primary underline underline-offset-2" onClick={() => setSheet('claude')}>Use Claude instead</button><a href="/candidate/onboarding/chat" className="text-primary underline underline-offset-2">No ChatGPT or Claude? Chat here</a></p>}
        </div>
        <div className="flex shrink-0 flex-col gap-2 lg:absolute lg:right-6 lg:top-1/2 lg:-translate-y-1/2">
          {connected ? (<>
            <button type="button" onClick={copy} className={cx(buttonClass('primary'), 'rounded-full! px-7')}>{copied ? 'Copied ✓ Now paste it' : 'Copy the message'}</button>
            <a href={connected === 'Claude' ? AI_APPS.claude.open : AI_APPS.chatgpt.open} target="_blank" rel="noreferrer" className="text-center text-[15px] font-semibold">Open {connected} →</a>
          </>) : <button type="button" onClick={() => setSheet('chatgpt')} className={cx(buttonClass('primary'), 'rounded-full! px-7')}>Connect ChatGPT →</button>}
        </div>
      </div>
      {sheet && <AiConnectSheet key={sheet} initialApp={sheet} open onClose={() => setSheet(null)} connectorUrl={connectorUrl} task="build your mini-me" onConnected={(p) => setConnected(p)} />}
    </section>
  );
}

/** Always-on mode as one row. "Turn it on" explains the one sentence to paste: the website can't switch it on by itself. */
export function AlwaysOnRow({ provider }: { provider: string | null }) {
  const [open, setOpen] = useState(false);
  const app = provider ?? 'ChatGPT';
  return (
    <>
      <div className="flex flex-col gap-3 rounded-3xl bg-surface px-5 py-4 shadow-[0_8px_24px_rgb(18_37_29/0.06)] sm:flex-row sm:items-center">
        <span className="flex items-center gap-2 whitespace-nowrap font-display text-[19px] font-semibold"><Zap aria-hidden size={20} strokeWidth={1.8} /> Always-on mode</span>
        <span aria-hidden className="hidden h-6 w-px bg-line sm:block" />
        <span className="flex-1 text-[16px] text-muted">Keep the conversation going. Let your {app} learn about you in every chat, a little at a time.</span>
        <button type="button" onClick={() => setOpen(true)} className={cx(buttonClass('primary'), 'min-h-11 rounded-full! px-6')}>Turn it on</button>
      </div>
      <Dialog open={open} onClose={() => setOpen(false)} title="Turn on always-on mode">
        <ol className="mt-2 space-y-4 text-[16px]">
          <li><span className="font-semibold">1.</span> {provider ? 'Copy this:' : `Connect your ${app} first (the card above), then copy this:`}<div className="mt-2"><CopyBox text={ALWAYS_ON} label="Always-on instruction" /></div></li>
          <li><span className="font-semibold">2.</span> In {app}, open its settings and paste it where you tell it about yourself (personalisation or custom instructions).</li>
          <li><span className="font-semibold">3.</span> Chat as normal. Over time it covers everything, and what it saves shows up here for you to check.</li>
        </ol>
        <button type="button" className={cx(buttonClass('primary', true), 'mt-6')} onClick={() => setOpen(false)}>Done</button>
      </Dialog>
    </>
  );
}

/** One thing the mini-me knows: area, topic, their words, status and actions. Edits in place. */
export function KnowsCard({ q, area }: { q: Q; area: string }) {
  const { run, busy, error } = useCommand();
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(q.answer ?? '');
  return (
    <article className="rise-in flex h-full flex-col rounded-3xl bg-surface p-5 shadow-[0_8px_24px_rgb(18_37_29/0.06)] lg:p-6">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[13px] font-semibold uppercase tracking-wide text-muted">{area}</p>
          <h3 className="mt-1 text-[21px] leading-7">{q.text}</h3>
        </div>
        {q.approved
          ? <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-success-tint px-3 py-1 text-[14px] font-semibold text-primary"><Check size={15} aria-hidden /> {q.source === 'ai' ? `From your ${q.provider ?? 'AI'}` : 'From you'}</span>
          : <span className="shrink-0 rounded-full bg-warning-tint px-3 py-1 text-[14px] font-semibold text-warning">From your {q.provider ?? 'AI'} · to check</span>}
      </div>
      {editing ? (
        <div className="mt-3">
          <textarea aria-label={`Edit: ${q.text}`} className={cx(textareaClass, 'min-h-[120px]')} value={text} maxLength={1500} onChange={(e) => setText(e.target.value)} autoFocus />
          <div className="mt-3 flex flex-wrap gap-2">
            <button type="button" className={buttonClass('primary')} disabled={busy} onClick={async () => { if (await run('onboarding/answer', { key: q.key, answer: text }) !== null) setEditing(false); }}>{busy ? 'Saving…' : 'Save'}</button>
            <button type="button" className={buttonClass('ghost')} onClick={() => { setText(q.answer ?? ''); setEditing(false); }}>Cancel</button>
          </div>
        </div>
      ) : (
        <div className="mt-2 flex flex-1 flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <p className="whitespace-pre-wrap text-[16px] leading-relaxed">“{q.answer}”</p>
          <div className="flex shrink-0 items-center gap-4">
            {!q.approved && <button type="button" className={cx(buttonClass('secondary'), 'min-h-11 rounded-full!')} disabled={busy} onClick={() => run('onboarding/approve', { keys: [q.key] })}>Looks right</button>}
            <button type="button" className="text-[15px] font-semibold text-primary underline underline-offset-2" onClick={() => setEditing(true)}>Edit</button>
            <button type="button" className="text-[15px] text-muted underline underline-offset-2" disabled={busy} onClick={() => { if (window.confirm('Remove this from your profile?')) run('onboarding/answer', { key: q.key, answer: '' }); }}>Remove</button>
          </div>
        </div>
      )}
      <ErrorText error={error} />
    </article>
  );
}
