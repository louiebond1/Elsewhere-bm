'use client';
import { useState } from 'react';
import { api, Field, inputClass, ErrorText, type ApiError } from '@/components/client';
import { buttonClass } from '@/components/ui';

export function SignupForm() {
  const [f, setF] = useState({ fullName: '', email: '', password: '', region: 'london', workModes: ['hybrid'] as string[], roleFamilies: ['finance'] as string[], minSalaryPounds: '', noticeWeeks: '', fictionalConfirmed: false, acceptTerms: false, acceptAi: false, wantsDiscovery: true, aggregateInsights: false });
  const [err, setErr] = useState<ApiError | null>(null);
  const [busy, setBusy] = useState(false);
  const toggle = (k: 'workModes' | 'roleFamilies', v: string) => setF({ ...f, [k]: f[k].includes(v) ? f[k].filter((x) => x !== v) : [...f[k], v] });
  return (
    <form className="mt-6 space-y-5 rounded-xl border border-line bg-surface p-5" onSubmit={async (e) => {
      e.preventDefault(); setBusy(true);
      const r = await api('auth/candidate-signup', { body: { ...f, minSalaryPounds: f.minSalaryPounds ? Number(f.minSalaryPounds) : null, noticeWeeks: f.noticeWeeks ? Number(f.noticeWeeks) : null } });
      setBusy(false);
      if (r.ok) window.location.href = '/candidate/privacy?onboarding=1'; else setErr(r.error);
    }}>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Full name (fictional)" error={err?.fieldErrors?.fullName}><input className={inputClass} value={f.fullName} onChange={(e) => setF({ ...f, fullName: e.target.value })} required /></Field>
        <Field label="Email (fictional)" error={err?.fieldErrors?.email}><input type="email" className={inputClass} value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} required /></Field>
        <Field label="Password" hint="At least 10 characters." error={err?.fieldErrors?.password}><input type="password" autoComplete="new-password" className={inputClass} value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} required /></Field>
        <Field label="Region"><select className={inputClass} value={f.region} onChange={(e) => setF({ ...f, region: e.target.value })}><option value="london">London</option><option value="hertfordshire">Hertfordshire</option><option value="manchester">Manchester</option><option value="remote_uk">Remote, UK</option></select></Field>
        <Field label="Minimum salary (£, optional)"><input inputMode="numeric" className={inputClass} value={f.minSalaryPounds} onChange={(e) => setF({ ...f, minSalaryPounds: e.target.value.replace(/\D/g, '') })} /></Field>
        <Field label="Notice period in weeks (optional)"><input inputMode="numeric" className={inputClass} value={f.noticeWeeks} onChange={(e) => setF({ ...f, noticeWeeks: e.target.value.replace(/\D/g, '') })} /></Field>
      </div>
      <fieldset><legend className="text-[14px] font-medium">Work modes</legend><div className="mt-1 flex flex-wrap gap-4">{['onsite', 'hybrid', 'remote'].map((m) => <label key={m} className="flex items-center gap-2 text-[15px]"><input type="checkbox" checked={f.workModes.includes(m)} onChange={() => toggle('workModes', m)} />{m[0].toUpperCase() + m.slice(1)}</label>)}</div></fieldset>
      <fieldset><legend className="text-[14px] font-medium">Role families</legend><div className="mt-1 flex flex-wrap gap-4">{['finance', 'operations', 'commercial'].map((m) => <label key={m} className="flex items-center gap-2 text-[15px]"><input type="checkbox" checked={f.roleFamilies.includes(m)} onChange={() => toggle('roleFamilies', m)} />{m[0].toUpperCase() + m.slice(1)}</label>)}</div></fieldset>
      <div className="space-y-3 rounded-lg bg-page p-4 text-[15px]">
        <label className="flex gap-2"><input type="checkbox" checked={f.fictionalConfirmed} onChange={(e) => setF({ ...f, fictionalConfirmed: e.target.checked })} /> I am entering fictional information only.</label>
        <label className="flex gap-2"><input type="checkbox" checked={f.acceptTerms} onChange={(e) => setF({ ...f, acceptTerms: e.target.checked })} /> I accept the prototype terms (version prototype-terms-v1).</label>
        <label className="flex gap-2"><input type="checkbox" checked={f.acceptAi} onChange={(e) => setF({ ...f, acceptAi: e.target.checked })} /> I agree that my answers and CV are processed by AI to suggest evidence, which I review before anything is shared.</label>
        <label className="flex gap-2"><input type="checkbox" checked={f.wantsDiscovery} onChange={(e) => setF({ ...f, wantsDiscovery: e.target.checked })} /> I want employers to be able to discover my anonymous profile once it is approved.</label>
        <label className="flex gap-2"><input type="checkbox" checked={f.aggregateInsights} onChange={(e) => setF({ ...f, aggregateInsights: e.target.checked })} /> Optional: my data may contribute to aggregated, anonymised insights.</label>
      </div>
      <ErrorText error={err} />
      <button className={buttonClass('primary', true)} disabled={busy}>{busy ? 'Saving…' : 'Next'}</button>
    </form>
  );
}
