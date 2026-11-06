'use client';
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { buttonClass, cx } from './ui';

const CsrfContext = createContext<string>('');
export function CsrfProvider({ token, children }: { token: string; children: ReactNode }) {
  return <CsrfContext.Provider value={token}>{children}</CsrfContext.Provider>;
}
export const useCsrf = () => useContext(CsrfContext);

export type ApiError = { code: string; message: string; fieldErrors?: Record<string, string> | null; details?: Record<string, string> | null };

export async function api<T = unknown>(path: string, opts: { method?: 'GET' | 'POST'; body?: unknown; csrf?: string; key?: string; form?: FormData } = {}): Promise<{ ok: true; data: T } | { ok: false; error: ApiError }> {
  const headers: Record<string, string> = {};
  if (opts.csrf) headers['x-csrf-token'] = opts.csrf;
  if (opts.key) headers['idempotency-key'] = opts.key;
  if (opts.body !== undefined) headers['content-type'] = 'application/json';
  let res: Response;
  try {
    res = await fetch(`/api/${path}`, { method: opts.method ?? (opts.body !== undefined || opts.form ? 'POST' : 'GET'), headers, body: opts.form ?? (opts.body !== undefined ? JSON.stringify(opts.body) : undefined), credentials: 'same-origin', cache: 'no-store' });
  } catch {
    return { ok: false, error: { code: 'NETWORK', message: 'We could not reach the server. Your progress is saved. Try again.' } };
  }
  const j = await res.json().catch(() => null);
  if (!res.ok || !j) return { ok: false, error: j?.error ?? { code: 'UNKNOWN', message: 'Something went wrong.' } };
  return { ok: true, data: j.data as T };
}

/**
 * One idempotency key per deliberate action, reused on retry of the same action.
 * A new key is created only after the action succeeds or the user changes the request.
 */
export function useCommand<T = unknown>() {
  const csrf = useCsrf();
  const router = useRouter();
  const key = useRef<string>(crypto.randomUUID());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);
  const run = useCallback(async (path: string, body: unknown = {}, opts: { refresh?: boolean; form?: FormData } = {}) => {
    setBusy(true);
    setError(null);
    const r = await api<T>(path, { body: opts.form ? undefined : body, form: opts.form, csrf, key: key.current });
    setBusy(false);
    if (!r.ok) {
      setError(r.error);
      if (r.error.code === 'STALE_DATASET' || r.error.code === 'UNAUTHENTICATED') setTimeout(() => (window.location.href = '/login'), 1200);
      return null;
    }
    key.current = crypto.randomUUID();
    if (opts.refresh !== false) router.refresh();
    return r.data;
  }, [csrf, router]);
  return { run, busy, error, setError, resetKey: () => (key.current = crypto.randomUUID()) };
}

export function ErrorText({ error }: { error: ApiError | null }) {
  if (!error) return null;
  return <p role="alert" className="mt-2 text-[14px] text-danger">{error.message}</p>;
}

/** Accessible modal with focus trap, Escape to close and focus return. */
export function Dialog({ open, onClose, title, children }: { open: boolean; onClose: () => void; title: string; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const opener = useRef<Element | null>(null);
  useEffect(() => {
    if (!open) return;
    opener.current = document.activeElement;
    const el = ref.current;
    const focusables = () => Array.from(el?.querySelectorAll<HTMLElement>('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])') ?? []).filter((x) => !x.hasAttribute('disabled'));
    focusables()[0]?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'Tab') {
        const f = focusables();
        if (!f.length) return;
        if (e.shiftKey && document.activeElement === f[0]) { e.preventDefault(); f[f.length - 1].focus(); }
        else if (!e.shiftKey && document.activeElement === f[f.length - 1]) { e.preventDefault(); f[0].focus(); }
      }
    };
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('keydown', onKey); (opener.current as HTMLElement | null)?.focus?.(); };
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-0 md:items-center md:p-4" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div ref={ref} role="dialog" aria-modal="true" aria-label={title} className="max-h-[90vh] w-full overflow-y-auto rounded-t-xl bg-surface p-5 md:max-w-lg md:rounded-xl">
        <h3 className="mb-3 text-[20px] font-semibold">{title}</h3>
        {children}
      </div>
    </div>
  );
}

type ActionProps = {
  path: string;
  body?: unknown;
  label: ReactNode;
  variant?: 'primary' | 'secondary' | 'danger' | 'ghost';
  confirm?: { title: string; body: ReactNode; confirmLabel?: string; typed?: string };
  /** Path, optionally with {field} placeholders filled from the response data. */
  redirect?: string;
  disabledReason?: string | null;
  full?: boolean;
  onDone?: (data: unknown) => void;
  successText?: string;
};

/** A button that runs one server command, with optional confirmation that states the exact effect. */
export function ActionButton({ path, body = {}, label, variant = 'primary', confirm, redirect, disabledReason, full, onDone, successText }: ActionProps) {
  const { run, busy, error, setError } = useCommand();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState('');
  const [done, setDone] = useState(false);
  const go = async () => {
    const data = await run(path, body);
    if (data === null) return;
    setOpen(false);
    setDone(true);
    onDone?.(data);
    const to = redirect ? fillTemplate(redirect, data) : null;
    if (to) router.push(to);
  };
  return (
    <span className={cx('inline-flex flex-col', full && 'w-full')}>
      <button type="button" className={buttonClass(variant, full)} disabled={busy || !!disabledReason} title={disabledReason ?? undefined} aria-describedby={disabledReason ? undefined : undefined} onClick={() => (confirm ? (setError(null), setOpen(true)) : go())}>
        {busy && !confirm ? 'Working…' : label}
      </button>
      {disabledReason && <span className="mt-1 text-[13px] text-muted">{disabledReason}</span>}
      {!confirm && <ErrorText error={error} />}
      {done && successText && <span role="status" className="mt-1 text-[13px] text-success">{successText}</span>}
      {confirm && (
        <Dialog open={open} onClose={() => setOpen(false)} title={confirm.title}>
          <div className="space-y-3 text-[15px]">{confirm.body}</div>
          {confirm.typed && (
            <label className="mt-4 block text-[14px] font-medium">Type {confirm.typed} to confirm
              <input className="mt-1 h-11 w-full rounded-lg border border-line px-3" value={typed} onChange={(e) => setTyped(e.target.value)} autoComplete="off" />
            </label>
          )}
          <ErrorText error={error} />
          <div className="mt-5 flex flex-col-reverse gap-2 md:flex-row md:justify-end">
            <button type="button" className={buttonClass('secondary')} onClick={() => setOpen(false)}>Cancel</button>
            <button type="button" className={buttonClass(variant === 'danger' ? 'danger' : 'primary')} disabled={busy || (!!confirm.typed && typed !== confirm.typed)} onClick={go}>{busy ? 'Working…' : confirm.confirmLabel ?? 'Confirm'}</button>
          </div>
        </Dialog>
      )}
    </span>
  );
}

export function fillTemplate(t: string, data: unknown) {
  return t.replace(/\{(\w+)\}/g, (_m, k) => encodeURIComponent(String((data as Record<string, unknown> | null)?.[k] ?? '')));
}

export function Field({ label, hint, error, children }: { label: string; hint?: string; error?: string | null; children: ReactNode }) {
  return (
    <label className="block text-[14px] font-medium">
      {label}
      <div className="mt-1">{children}</div>
      {hint && <span className="mt-1 block text-[13px] font-normal text-muted">{hint}</span>}
      {error && <span className="mt-1 block text-[13px] font-normal text-danger">{error}</span>}
    </label>
  );
}

export const inputClass = 'h-11 w-full rounded-lg border border-line bg-surface px-3 text-[16px]';
export const textareaClass = 'w-full rounded-lg border border-line bg-surface px-3 py-2 text-[16px]';

/** Polls a job until it finishes, then refreshes the page. */
export function JobPoller({ jobId, pendingText = 'Building your profile', failText }: { jobId: string; pendingText?: string; failText?: string }) {
  const router = useRouter();
  const [status, setStatus] = useState('queued');
  useEffect(() => {
    let stop = false;
    const tick = async () => {
      const r = await api<{ status: string }>(`jobs/${jobId}`);
      if (stop) return;
      if (r.ok) {
        setStatus(r.data.status);
        if (r.data.status === 'succeeded' || r.data.status === 'failed') { router.refresh(); return; }
      }
      setTimeout(tick, 1500);
    };
    tick();
    return () => { stop = true; };
  }, [jobId, router]);
  if (status === 'failed') return <p role="status" className="text-[15px] text-danger">{failText ?? 'Your answer is saved. We could not update your profile just now. Try again.'}</p>;
  if (status === 'succeeded') return null;
  return <p role="status" className="text-[15px] text-muted">{pendingText}…</p>;
}
