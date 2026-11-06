'use client';
import { useState } from 'react';
import { api, Field, inputClass, ErrorText, type ApiError } from '@/components/client';
import { buttonClass } from '@/components/ui';

export function LoginForm() {
  const [email, setEmail] = useState('');
  const [pw, setPw] = useState('');
  const [err, setErr] = useState<ApiError | null>(null);
  const [busy, setBusy] = useState(false);
  return (
    <form className="mt-4 space-y-4" onSubmit={async (e) => { e.preventDefault(); setBusy(true); const r = await api<{ userType: string }>('auth/login', { body: { email, password: pw } }); setBusy(false); if (r.ok) window.location.href = `/${r.data.userType}/home`; else setErr(r.error); }}>
      <Field label="Email"><input className={inputClass} type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} required /></Field>
      <Field label="Password"><input className={inputClass} type="password" autoComplete="current-password" value={pw} onChange={(e) => setPw(e.target.value)} required /></Field>
      <ErrorText error={err} />
      <button className={buttonClass('primary', true)} disabled={busy}>{busy ? 'Signing in…' : 'Sign in'}</button>
    </form>
  );
}
