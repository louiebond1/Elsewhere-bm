'use client';
import { useState } from 'react';
import { api, ErrorText, type ApiError } from '@/components/client';
import { cx } from '@/components/ui';

const go = (userType: string) => { try { sessionStorage.clear(); } catch {} window.location.replace(`/${userType}/home`); };

/** One tap signs you in as this account. */
export function AccountButton({ userId, children, className }: { userId: string; children: React.ReactNode; className?: string }) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<ApiError | null>(null);
  return (
    <>
      <button type="button" disabled={busy} className={cx('press w-full text-left disabled:opacity-60', className)} onClick={async () => {
        setBusy(true);
        const r = await api<{ userType: string }>('demo/switch-persona', { body: { userId } });
        if (!r.ok) { setBusy(false); return setErr(r.error); }
        go(r.data.userType);
      }}>{busy ? <span className="font-semibold">Signing in…</span> : children}</button>
      <ErrorText error={err} />
    </>
  );
}

/** A blank company with 10 credits, then straight in as its hiring manager. */
export function NewClientButton({ className, children }: { className?: string; children: React.ReactNode }) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<ApiError | null>(null);
  return (
    <>
      <button type="button" disabled={busy} className={cx('press w-full text-left disabled:opacity-60', className)} onClick={async () => {
        setBusy(true);
        const r = await api<{ userType: string }>('demo/new-client', { body: {} });
        if (!r.ok) { setBusy(false); return setErr(r.error); }
        go(r.data.userType);
      }}>{busy ? <span className="font-semibold">Setting it up…</span> : children}</button>
      <ErrorText error={err} />
    </>
  );
}
