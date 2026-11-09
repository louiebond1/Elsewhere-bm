'use client';
import { useEffect, useState } from 'react';
import { HandHelping, Check, TriangleAlert } from 'lucide-react';
import { api, useCsrf, Dialog } from './client';
import { CopyBox } from './copy-box';
import { buttonClass, cx } from './ui';
import { AI_APPS, AI_NOTE, type AiApp } from '@/lib/ai-connect';

/** The one "Let my AI do this" button, the same everywhere. */
export function LetMyAiButton({ onClick, connected, note = AI_NOTE, disabled }: { onClick: () => void; connected: string | null; note?: string; disabled?: boolean }) {
  return (
    <div>
      <button type="button" className={cx(buttonClass('secondary', true), 'gap-3 border-primary text-[17px] text-primary')} onClick={onClick} disabled={disabled}>
        <HandHelping aria-hidden size={22} strokeWidth={1.8} /> Let my AI do this
      </button>
      <p className="mt-2 text-center text-[14px] text-muted">{connected ? <>Using your {connected} · </> : null}{note}</p>
    </div>
  );
}

function Steps({ step }: { step: 1 | 2 | 3 }) {
  return (
    <ol className="mt-4 flex items-center justify-between gap-2 text-[15px]" aria-label="Steps">
      {['Choose', 'Connect', 'Return'].map((l, i) => {
        const n = i + 1; const on = step === n; const done = step > n;
        return (
          <li key={l} aria-current={on ? 'step' : undefined} className={cx('flex items-center gap-2', on ? 'font-semibold text-ink' : 'text-ink/80')}>
            <span aria-hidden className={cx('flex h-8 w-8 items-center justify-center rounded-full text-[14px] font-bold', on ? 'bg-primary text-white' : done ? 'bg-success-tint text-primary' : 'bg-page text-ink')}>{done ? <Check size={16} /> : n}</span>{l}
          </li>
        );
      })}
    </ol>
  );
}

/** Connect ChatGPT or Claude in three steps, then come back to the task. */
export function AiConnectSheet({ open, onClose, connectorUrl, onConnected, task }: { open: boolean; onClose: () => void; connectorUrl: string; onConnected: (provider: string) => void; task?: string }) {
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [app, setApp] = useState<AiApp>('chatgpt');
  const [provider, setProvider] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);
  const [notYet, setNotYet] = useState(false);
  const how = AI_APPS[app];
  const close = () => { setStep(1); setNotYet(false); onClose(); };
  const check = async () => {
    setChecking(true); setNotYet(false);
    const r = await api<{ connected: string | null }>('ai/status');
    setChecking(false);
    if (r.ok && r.data.connected) { setProvider(r.data.connected); setStep(3); } else setNotYet(true);
  };
  return (
    <Dialog open={open} onClose={close} title="Let your AI help">
      <p className="text-[17px] text-muted">Use your ChatGPT or Claude.</p>
      <Steps step={step} />
      {step === 1 && (
        <div className="mt-5">
          <div role="radiogroup" aria-label="Your AI" className="space-y-3">
            {(['chatgpt', 'claude'] as const).map((k) => {
              const on = app === k;
              return (
                <button key={k} type="button" role="radio" aria-checked={on} onClick={() => setApp(k)}
                  className={cx('flex w-full items-center justify-between rounded-2xl border px-5 py-4 text-left font-display text-[20px] font-extrabold', on ? 'border-primary bg-info-tint ring-1 ring-primary' : 'border-line bg-surface')}>
                  {AI_APPS[k].name}
                  <span aria-hidden className={cx('flex h-6 w-6 items-center justify-center rounded-full border-2', on ? 'border-primary' : 'border-[#BDBCB3]')}>{on && <span className="h-3 w-3 rounded-full bg-primary" />}</span>
                </button>
              );
            })}
          </div>
          <p className="mt-6 font-display text-[20px] font-extrabold">You stay in control</p>
          <p className="text-[15px] text-muted">Drafts only. You send the final answer.</p>
          <button type="button" className={cx(buttonClass('primary', true), 'mt-5 text-[17px]')} onClick={() => setStep(2)}>Connect {how.name}</button>
          <button type="button" className={cx(buttonClass('ghost', true), 'mt-1 text-ink')} onClick={close}>Keep writing myself</button>
        </div>
      )}
      {step === 2 && (
        <div className="mt-5">
          <ol className="space-y-3">
            {how.steps.map((t, i) => (
              <li key={t} className="flex gap-3 text-[15px]"><span aria-hidden className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-page text-[13px] font-bold">{i + 1}</span><span className="pt-0.5">{t}</span></li>
            ))}
          </ol>
          <div className="mt-4"><CopyBox text={connectorUrl} label="Connector address" /></div>
          <p className="mt-2 text-[13px] text-muted">{how.note}</p>
          <div className="mt-5 flex flex-col gap-2">
            <a className={buttonClass('secondary', true)} href={how.open} target="_blank" rel="noreferrer">Open {how.name}</a>
            <button type="button" className={buttonClass('primary', true)} onClick={check} disabled={checking}>{checking ? 'Checking…' : 'I’ve connected, check again'}</button>
            {notYet && <p role="status" className="text-center text-[14px] text-warning">Not connected yet. Finish in {how.name} and press Allow, then check again.</p>}
            <button type="button" className={cx(buttonClass('ghost', true), 'text-ink')} onClick={() => setStep(1)}>Back</button>
          </div>
        </div>
      )}
      {step === 3 && (
        <div className="mt-6">
          <p className="flex items-center gap-2 font-display text-[20px] font-extrabold"><span aria-hidden className="flex h-8 w-8 items-center justify-center rounded-full bg-success-tint text-primary"><Check size={18} /></span>Connected to {provider}</p>
          {task && <p className="mt-2 text-[15px] text-muted">Next: {task}</p>}
          <button type="button" className={cx(buttonClass('primary', true), 'mt-5 text-[17px]')} onClick={() => { onConnected(provider!); close(); }}>Prepare my draft</button>
        </div>
      )}
    </Dialog>
  );
}

type Draft = { body: string; provider: string };

/** Square-bracket gaps the AI left for missing facts, e.g. [Add what changed]. */
export const GAP = /\[[^\]\n]{2,80}\]/g;
export const hasGaps = (t: string) => new RegExp(GAP.source).test(t);
function WithGaps({ text }: { text: string }) {
  const parts = text.split(/(\[[^\]\n]{2,80}\])/g);
  return <>{parts.map((p, i) => (i % 2 ? <mark key={i} className="rounded-md bg-success-tint px-1 text-primary">{p.slice(1, -1)}</mark> : <span key={i}>{p}</span>))}</>;
}

/** The whole "Let my AI do this → check the draft" flow for one question. The person always sends it themselves. */
export function QuestionAi({ questionId, questionText, initialDraft, connected: initialConnected, connectorUrl, hasText, onUse, onReview, autoStart = false }: {
  autoStart?: boolean; questionId: string; questionText: string; initialDraft: Draft | null; connected: string | null; connectorUrl: string; hasText: boolean;
  onUse: (draft: Draft, mode: 'replace' | 'add', edit: boolean) => void; onReview: (reviewing: boolean) => void;
}) {
  const csrf = useCsrf();
  const [state, setState] = useState<'idle' | 'waiting' | 'ready' | 'used'>(initialDraft ? 'ready' : autoStart && initialConnected ? 'waiting' : 'idle');
  const [draft, setDraft] = useState<Draft | null>(initialDraft);
  const [connected, setConnected] = useState(initialConnected);
  const [sheet, setSheet] = useState(autoStart && !initialDraft && !initialConnected);
  const [choose, setChoose] = useState<null | boolean>(null);
  const [error, setError] = useState<string | null>(null);
  const app = connected ?? 'your AI';
  const prompt = `Help me answer my Elsewhere question: “${questionText}”. Use what you remember about me, ask me anything you’re unsure of, then save it as a draft.`;

  // While waiting, look for the draft every few seconds (for up to 15 minutes).
  useEffect(() => {
    if (state !== 'waiting') return;
    let tries = 0;
    const t = setInterval(async () => {
      if (++tries > 225) { clearInterval(t); return; }
      const r = await api<{ draft: Draft | null; answered: boolean }>(`ai/drafts/${questionId}`);
      if (r.ok && r.data.draft) { setDraft(r.data.draft); setState('ready'); onReview(true); }
    }, 4000);
    return () => clearInterval(t);
  }, [state, questionId, onReview]);

  const discard = async () => {
    const r = await api(`ai/drafts/${questionId}/discard`, { body: {}, csrf });
    if (!r.ok) { setError(r.error.message); return; }
    setDraft(null); setState('idle'); onReview(false);
  };
  const apply = (mode: 'replace' | 'add', edit: boolean) => { if (draft) { onUse(draft, mode, edit); setState('used'); onReview(false); } };
  const start = (edit: boolean) => (hasText ? setChoose(edit) : apply('replace', edit));

  if (state === 'used') return null;
  return (
    <div>
      {state === 'idle' && <LetMyAiButton connected={connected} onClick={() => (connected ? setState('waiting') : setSheet(true))} />}
      {state === 'waiting' && (
        <div className="rounded-2xl border border-line bg-page p-5" role="status">
          <p className="font-display text-[19px] font-extrabold">Continue in {app} to prepare your draft</p>
          <ol className="mt-3 space-y-3 text-[15px]">
            <li><span className="font-semibold">1.</span> Copy this message:<div className="mt-2"><CopyBox text={prompt} label="Message for your AI" /></div></li>
            <li><span className="font-semibold">2.</span> <a href={connected === 'Claude' ? AI_APPS.claude.open : AI_APPS.chatgpt.open} target="_blank" rel="noreferrer">Open {app}</a>, paste it and chat it through.</li>
            <li><span className="font-semibold">3.</span> When it saves the draft, it appears here. You can keep writing meanwhile.</li>
          </ol>
          <button type="button" className={cx(buttonClass('ghost'), 'mt-2 text-ink')} onClick={() => setState('idle')}>Cancel</button>
        </div>
      )}
      {state === 'ready' && draft && (
        <section aria-label="Draft ready to check">
          <h2 className="font-display">Check your draft</h2>
          <p className="mt-2 inline-flex rounded-full border border-line px-3 py-1 text-[14px] text-ink">Made with your {draft.provider} · Not sent</p>
          <p className="mt-4 whitespace-pre-wrap rounded-2xl border border-line bg-surface p-5 text-[17px] leading-relaxed"><WithGaps text={draft.body} /></p>
          <p className="mt-4 flex items-center gap-2 text-[15px] font-semibold"><TriangleAlert aria-hidden size={20} strokeWidth={1.8} /> Check every detail is true.</p>
          {choose === null ? (<>
            <div className="mt-4 grid grid-cols-2 gap-3">
              <button type="button" className={buttonClass('secondary', true)} onClick={() => start(true)}>Edit draft</button>
              <button type="button" className={buttonClass('secondary', true)} onClick={discard}>Discard</button>
            </div>
            <button type="button" className={cx(buttonClass('primary', true), 'mt-3 text-[17px]')} onClick={() => start(false)}>Use draft</button>
          </>) : (
            <div className="mt-4 space-y-3" role="group" aria-label="You already wrote something">
              <p className="text-[15px]">You’ve already written something. What should the draft do?</p>
              <button type="button" className={buttonClass('primary', true)} onClick={() => apply('replace', choose)}>Replace answer</button>
              <button type="button" className={buttonClass('secondary', true)} onClick={() => apply('add', choose)}>Add to answer</button>
              <button type="button" className={cx(buttonClass('ghost', true), 'text-ink')} onClick={() => setChoose(null)}>Back</button>
            </div>
          )}
          <p className="mt-3 text-center text-[14px] text-muted">Nothing is sent until you press Send answer.</p>
          {error && <p role="alert" className="mt-2 text-[14px] text-danger">{error}</p>}
        </section>
      )}
      <AiConnectSheet open={sheet} onClose={() => setSheet(false)} connectorUrl={connectorUrl} task="get a draft for this question" onConnected={(p) => { setConnected(p); setState('waiting'); }} />
    </div>
  );
}

/**
 * "Let my AI do this" where the app has no connector for this person yet: copy a ready-made
 * message to ChatGPT or Claude, paste back what it wrote, and it goes into the box (not sent).
 */
export function PasteFromAi({ prompt, onPaste, autoOpen = false, note = 'Your AI drafts. You check and send.', placeLabel = 'Put it in my answer' }: { prompt: string; onPaste: (text: string) => void; autoOpen?: boolean; note?: string; placeLabel?: string }) {
  const [open, setOpen] = useState(autoOpen);
  const [text, setText] = useState('');
  if (!open) return <LetMyAiButton connected={null} note={note} onClick={() => setOpen(true)} />;
  return (
    <section aria-label="Let my AI do this" className="rounded-[24px] border border-line bg-surface p-5">
      <div className="flex items-start justify-between gap-2">
        <p className="font-display text-[20px] font-extrabold">Let your AI do this</p>
        <button type="button" aria-label="Close" onClick={() => setOpen(false)} className="-mr-2 -mt-2 flex h-11 w-11 items-center justify-center rounded-full text-[24px] leading-none hover:bg-page">&times;</button>
      </div>
      <ol className="mt-3 space-y-4 text-[15px]">
        <li><span className="font-semibold">1. Copy this message</span><div className="mt-2"><CopyBox text={prompt} label="Message for your AI" /></div></li>
        <li><span className="font-semibold">2. Paste it into your AI</span>
          <div className="mt-2 flex flex-wrap gap-2">
            <a className={buttonClass('secondary')} href={AI_APPS.chatgpt.open} target="_blank" rel="noreferrer">Open ChatGPT</a>
            <a className={buttonClass('secondary')} href={AI_APPS.claude.open} target="_blank" rel="noreferrer">Open Claude</a>
          </div>
        </li>
        <li><label htmlFor="ai-paste" className="font-semibold">3. Paste what it wrote</label>
          <textarea id="ai-paste" rows={5} maxLength={2000} value={text} onChange={(e) => setText(e.target.value)} placeholder="Paste here…" className="mt-2 w-full rounded-2xl border border-line bg-page px-4 py-3 text-[16px]" />
        </li>
      </ol>
      <button type="button" className={cx(buttonClass('primary', true), 'mt-3')} disabled={!text.trim()} onClick={() => { onPaste(text.trim()); setText(''); setOpen(false); }}>{placeLabel}</button>
      <p className="mt-2 text-center text-[13px] text-muted">Nothing is sent until you press Send. Check every detail is true.</p>
    </section>
  );
}
