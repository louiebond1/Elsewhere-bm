'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Eye, EyeOff } from 'lucide-react';
import { api, inputClass, ErrorText, type ApiError } from '@/components/client';
import { buttonClass, cx } from '@/components/ui';

export function SignupForm() {
  const router = useRouter();
  const [f, setF] = useState({ fullName: '', email: '', password: '' });
  const [agree, setAgree] = useState(false);
  const [show, setShow] = useState(false);
  const [err, setErr] = useState<ApiError | null>(null);
  const [busy, setBusy] = useState(false);
  const fe = err?.fieldErrors ?? {};
  const field = (k: 'fullName' | 'email', label: string, type: string, auto: string) => (
    <label className="block"><span className="text-[16px] font-semibold">{label}</span>
      <input className={cx(inputClass, 'mt-2 h-14', fe[k] && 'border-danger')} type={type} autoComplete={auto} value={f[k]} onChange={(e) => setF({ ...f, [k]: e.target.value })} required />
      {fe[k] && <span className="mt-1 block text-[14px] text-danger">{fe[k]}</span>}
    </label>
  );
  return (
    <form className="rounded-[28px] bg-surface p-6 shadow-[0_24px_64px_rgb(18_37_29/0.2)] lg:p-8" noValidate onSubmit={async (e) => {
      e.preventDefault(); setBusy(true); setErr(null);
      // Where and what they want comes later (from their AI, or the Practical details on their mini-me).
      const r = await api('auth/candidate-signup', { body: { ...f, region: 'london', workModes: ['hybrid'], roleFamilies: ['finance'], minSalaryPounds: null, noticeWeeks: null, fictionalConfirmed: false, acceptTerms: agree, acceptAi: agree, wantsDiscovery: true, aggregateInsights: false, preferencesConfirmed: false } });
      setBusy(false);
      if (r.ok) router.push('/candidate/welcome'); else setErr(r.error);
    }}>
      <h2 className="text-[28px] leading-8">Create your account</h2>
      <p className="mt-1 text-[16px] text-muted">Takes a minute. Your AI can do the rest.</p>
      <div className="mt-6 space-y-4">
        {field('fullName', 'Your name', 'text', 'name')}
        {field('email', 'Email', 'email', 'email')}
        <label className="block"><span className="text-[16px] font-semibold">Password</span> <span className="text-[14px] text-muted">(at least 10 characters)</span>
          <span className="relative mt-2 block">
            <input className={cx(inputClass, 'h-14 pr-14', fe.password && 'border-danger')} type={show ? 'text' : 'password'} autoComplete="new-password" value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} required />
            <button type="button" onClick={() => setShow((v) => !v)} aria-label={show ? 'Hide password' : 'Show password'} className="absolute right-2 top-1/2 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full hover:bg-page">{show ? <EyeOff size={20} aria-hidden /> : <Eye size={20} aria-hidden />}</button>
          </span>
          {fe.password && <span className="mt-1 block text-[14px] text-danger">{fe.password}</span>}
        </label>
        <label className="flex items-start gap-3 rounded-2xl bg-page p-4 text-[15px]">
          <input type="checkbox" className="mt-1 h-5 w-5 accent-[#16543D]" checked={agree} onChange={(e) => setAgree(e.target.checked)} />
          <span>I agree to the prototype terms, and to AI helping build my profile. This is a test system.</span>
        </label>
      </div>
      <ErrorText error={err ? { ...err, fieldErrors: null } : null} />
      <button className={cx(buttonClass('primary', true), 'mt-6 rounded-full! text-[18px]')} disabled={busy || !agree}>{busy ? 'Creating your account…' : 'Create my account'}</button>
    </form>
  );
}
