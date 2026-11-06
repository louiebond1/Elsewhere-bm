'use client';
import { useState } from 'react';
import { api, Field, inputClass, ErrorText, type ApiError } from '@/components/client';
import { buttonClass } from '@/components/ui';

export function GateForm() {
  const [pw, setPw] = useState('');
  const [err, setErr] = useState<ApiError | null>(null);
  const [busy, setBusy] = useState(false);
  return (
    <form className="mt-4 space-y-4" onSubmit={async (e) => { e.preventDefault(); setBusy(true); const r = await api('auth/gate', { body: { password: pw } }); setBusy(false); if (r.ok) window.location.href = '/demo/personas'; else setErr(r.error); }}>
      <Field label="Access password"><input className={inputClass} type="password" autoComplete="current-password" value={pw} onChange={(e) => setPw(e.target.value)} required /></Field>
      <ErrorText error={err} />
      <button className={buttonClass('primary', true)} disabled={busy}>{busy ? 'Checking…' : 'Enter private demo'}</button>
    </form>
  );
}
