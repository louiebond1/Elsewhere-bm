'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Check, Pencil } from 'lucide-react';
import { useCommand, ErrorText, textareaClass } from './client';
import { LetMyAiButton, AiConnectSheet } from './ai-task';
import { CopyBox } from './copy-box';
import { buttonClass, cx } from './ui';
import { AI_APPS } from '@/lib/ai-connect';

type Q = { key: string; text: string; hint: string | null; answer: string | null; source: 'ai' | 'self' | null; provider: string | null; approved: boolean };
type Section = { key: string; title: string; questions: Q[] };

export const CHECKLIST_PROMPT = 'Help me build my Elsewhere mini-me. Fill in everything you genuinely know about me, ask me about anything you don’t, then save it.';

/** Ask their AI to fill in the checklist, or connect it first. Refreshes while answers arrive. */
export function ChecklistAi({ connected: initial, connectorUrl, autoOpen, waiting }: { connected: string | null; connectorUrl: string; autoOpen: boolean; waiting: boolean }) {
  const router = useRouter();
  const [connected, setConnected] = useState(initial);
  const [sheet, setSheet] = useState(autoOpen && !initial);
  // While their AI might be saving answers, quietly refresh so they appear without reloading.
  useEffect(() => {
    if (!connected || !waiting) return;
    const t = setInterval(() => { if (document.visibilityState === 'visible') router.refresh(); }, 6000);
    return () => clearInterval(t);
  }, [connected, waiting, router]);
  if (!connected) return (
    <>
      <LetMyAiButton connected={null} note="No one knows you better than your ChatGPT. Let it do the typing, you check it." onClick={() => setSheet(true)} />
      <AiConnectSheet open={sheet} onClose={() => setSheet(false)} connectorUrl={connectorUrl} task="build your mini-me" onConnected={(p) => setConnected(p)} />
    </>
  );
  return (
    <section aria-label="Let your AI fill it in" className="rounded-3xl bg-surface p-5 shadow-[0_8px_24px_rgb(18_37_29/0.06)] lg:p-6">
      <h2 className="text-[22px] leading-7">Let your {connected} do the talking</h2>
      <ol className="mt-3 space-y-3 text-[16px]">
        <li><span className="font-semibold">1.</span> Copy this message:<div className="mt-2"><CopyBox text={CHECKLIST_PROMPT} label="Message for your AI" /></div></li>
        <li><span className="font-semibold">2.</span> <a href={connected === 'Claude' ? AI_APPS.claude.open : AI_APPS.chatgpt.open} target="_blank" rel="noreferrer">Open {connected}</a> and paste it. It fills in what it knows and asks you the rest. Type or just talk to it.</li>
        <li><span className="font-semibold">3.</span> Its answers pop up here as it goes. It’ll ask you follow-ups too, and if you’ve got more to share, great: it all helps in your interviews.</li>
      </ol>
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
function Question({ q }: { q: Q }) {
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
