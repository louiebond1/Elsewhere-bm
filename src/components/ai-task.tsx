'use client';
import { useEffect, useState } from 'react';
import { HandHelping, Check } from 'lucide-react';
import { api, useCsrf, Dialog } from './client';
import { CopyBox } from './copy-box';
import { buttonClass, cx } from './ui';
import { AI_APPS, AI_NOTE, type AiApp } from '@/lib/ai-connect';

/** The one "Let my AI do this" button, the same everywhere. */
export function LetMyAiButton({ onClick, connected, note = AI_NOTE, disabled }: { onClick: () => void; connected: string | null; note?: string; disabled?: boolean }) {
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
      <button type="button" className={cx(buttonClass('secondary'), 'gap-2')} onClick={onClick} disabled={disabled}>
        <HandHelping aria-hidden size={18} /> Let my AI do this
      </button>
      <span className="text-[13px] text-muted">{connected ? <>Using {connected} · </> : null}{note}</span>
    </div>
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
      <p className="text-[15px] text-muted">Connect your ChatGPT or Claude to prepare drafts for you. You check everything before it’s sent.</p>
      <ol className="mt-4 flex gap-2 text-[13px]" aria-label="Steps">
        {['Choose', 'Connect', 'Done'].map((l, i) => (
          <li key={l} aria-current={step === i + 1 ? 'step' : undefined} className={cx('flex-1 rounded-full px-2 py-1 text-center', step === i + 1 ? 'bg-ink text-white' : step > i + 1 ? 'bg-success-tint text-success' : 'bg-page text-muted')}>{i + 1}. {l}</li>
        ))}
      </ol>
      {step === 1 && (
        <div className="mt-5 grid gap-2 sm:grid-cols-2">
          {(['chatgpt', 'claude'] as const).map((k) => (
            <button key={k} type="button" className={cx(buttonClass(k === 'chatgpt' ? 'primary' : 'secondary', true), 'min-h-14 text-[17px]')} onClick={() => { setApp(k); setStep(2); }}>Connect {AI_APPS[k].name}</button>
          ))}
        </div>
      )}
      {step === 2 && (
        <div className="mt-5">
          <ol className="space-y-3">
            {how.steps.map((t, i) => (
              <li key={t} className="flex gap-3 text-[15px]"><span aria-hidden className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-page font-semibold">{i + 1}</span><span className="pt-0.5">{t}</span></li>
            ))}
          </ol>
          <div className="mt-4"><CopyBox text={connectorUrl} label="Connector address" /></div>
          <p className="mt-2 text-[13px] text-muted">{how.note}</p>
          <div className="mt-4 flex flex-col gap-2">
            <a className={buttonClass('secondary', true)} href={how.open} target="_blank" rel="noreferrer">Open {how.name}</a>
            <button type="button" className={buttonClass('primary', true)} onClick={check} disabled={checking}>{checking ? 'Checking…' : 'I’ve connected, check again'}</button>
            {notYet && <p role="status" className="text-[14px] text-warning">Not connected yet. Finish the steps in {how.name} and press Allow, then check again.</p>}
            <button type="button" className={buttonClass('ghost', true)} onClick={() => setStep(1)}>Back</button>
          </div>
        </div>
      )}
      {step === 3 && (
        <div className="mt-5">
          <p className="flex items-center gap-2 text-[17px] font-medium"><Check aria-hidden className="text-success" /> Connected to {provider}</p>
          {task && <p className="mt-2 text-[15px] text-muted">Next: {task}</p>}
          <button type="button" className={cx(buttonClass('primary', true), 'mt-4')} onClick={() => { onConnected(provider!); close(); }}>Prepare my draft</button>
        </div>
      )}
    </Dialog>
  );
}

type Draft = { body: string; provider: string };

/** The whole "Let my AI do this → check the draft" flow for one question. The person always sends it themselves. */
export function QuestionAi({ questionId, questionText, initialDraft, connected: initialConnected, connectorUrl, hasText, onUse }: {
  questionId: string; questionText: string; initialDraft: Draft | null; connected: string | null; connectorUrl: string; hasText: boolean;
  onUse: (draft: Draft, mode: 'replace' | 'add') => void;
}) {
  const csrf = useCsrf();
  const [state, setState] = useState<'idle' | 'waiting' | 'ready' | 'used'>(initialDraft ? 'ready' : 'idle');
  const [draft, setDraft] = useState<Draft | null>(initialDraft);
  const [connected, setConnected] = useState(initialConnected);
  const [sheet, setSheet] = useState(false);
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
      if (r.ok && r.data.draft) { setDraft(r.data.draft); setState('ready'); }
    }, 4000);
    return () => clearInterval(t);
  }, [state, questionId]);

  const discard = async () => {
    const r = await api(`ai/drafts/${questionId}/discard`, { body: {}, csrf });
    if (!r.ok) { setError(r.error.message); return; }
    setDraft(null); setState('idle');
  };
  const use = (mode: 'replace' | 'add') => { if (draft) { onUse(draft, mode); setState('used'); } };

  if (state === 'used') return null;
  return (
    <div className="mt-3">
      {state === 'idle' && <LetMyAiButton connected={connected} onClick={() => (connected ? setState('waiting') : setSheet(true))} />}
      {state === 'waiting' && (
        <div className="rounded-xl border border-line bg-page p-4" role="status">
          <p className="font-medium">Continue in {app} to prepare your draft</p>
          <ol className="mt-3 space-y-3 text-[15px]">
            <li><span className="font-medium">1.</span> Copy this message:<div className="mt-2"><CopyBox text={prompt} label="Message for your AI" /></div></li>
            <li><span className="font-medium">2.</span> <a href={connected === 'Claude' ? AI_APPS.claude.open : AI_APPS.chatgpt.open} target="_blank" rel="noreferrer">Open {app}</a>, paste it and chat it through.</li>
            <li><span className="font-medium">3.</span> When it saves the draft, it appears here. You can keep working meanwhile.</li>
          </ol>
          <button type="button" className={cx(buttonClass('ghost'), 'mt-2')} onClick={() => setState('idle')}>Cancel</button>
        </div>
      )}
      {state === 'ready' && draft && (
        <section aria-label="Draft ready to check" className="rounded-xl border border-ink/20 bg-info-tint p-4">
          <p className="font-semibold">Draft ready to check</p>
          <p className="text-[13px] text-muted">Made with your {draft.provider} · Not sent</p>
          <p className="mt-3 whitespace-pre-wrap rounded-lg bg-surface p-3 text-[15px]">{draft.body}</p>
          <div className="mt-3 flex flex-wrap gap-2">
            {hasText ? (<>
              <button type="button" className={buttonClass('secondary')} onClick={() => use('replace')}>Replace answer</button>
              <button type="button" className={buttonClass('secondary')} onClick={() => use('add')}>Add to answer</button>
            </>) : <button type="button" className={buttonClass('secondary')} onClick={() => use('replace')}>Use draft</button>}
            <button type="button" className={buttonClass('ghost')} onClick={discard}>Discard</button>
          </div>
          <p className="mt-2 text-[13px] text-muted">Using it only puts it in your answer box. Nothing is sent until you press Send answer.</p>
          {error && <p role="alert" className="mt-2 text-[14px] text-danger">{error}</p>}
        </section>
      )}
      <AiConnectSheet open={sheet} onClose={() => setSheet(false)} connectorUrl={connectorUrl} task="get a draft for this question" onConnected={(p) => { setConnected(p); setState('waiting'); }} />
    </div>
  );
}
