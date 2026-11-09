'use client';
import { useState } from 'react';
import Link from 'next/link';
import { Eye, EyeOff, Check } from 'lucide-react';
import { useCommand, ErrorText, inputClass } from './client';
import { CopyBox } from './copy-box';
import { buttonClass, cx } from './ui';

/** Onboard a new client: four fields, one button, then their login details to send them. */
export function OnboardClient({ loginUrl }: { loginUrl: string }) {
  const { run, busy, error } = useCommand<{ clientId: string; email: string }>();
  const [f, setF] = useState({ companyName: '', contactName: '', contactEmail: '', password: '', startingCredits: '10' });
  const [show, setShow] = useState(false);
  const [done, setDone] = useState<{ clientId: string; email: string; password: string; name: string; company: string } | null>(null);
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement>) => setF((v) => ({ ...v, [k]: e.target.value }));
  const fe = error?.fieldErrors ?? {};

  if (done) {
    const first = done.name.split(' ')[0];
    const message = `Hi ${first}, welcome to BondMoran. You can log in here: ${loginUrl}\nEmail: ${done.email}\nPassword: ${done.password}`;
    return (
      <div className="mx-auto max-w-[640px]">
        <p className="flex items-center gap-2 text-[17px] font-semibold text-primary"><span className="flex h-8 w-8 items-center justify-center rounded-full bg-success-tint"><Check size={18} aria-hidden /></span> {done.company} is ready</p>
        <h1 className="mt-3">Send {first} their login</h1>
        <p className="mt-3 text-[17px] text-muted">Copy this and send it to them yourself. We don’t email it.</p>
        <div className="mt-6"><CopyBox text={message} label="Login details to send" /></div>
        <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:flex-wrap [&>*]:whitespace-nowrap">
          <Link href={`/consultant/clients/${done.clientId}`} className={cx(buttonClass('primary'), 'no-underline')}>Open {done.company}</Link>
          <Link href="/demo/personas" className={cx(buttonClass('secondary'), 'no-underline')}>Log in as {first} to try it</Link>
          <button type="button" className={buttonClass('ghost')} onClick={() => { setDone(null); setF({ companyName: '', contactName: '', contactEmail: '', password: '', startingCredits: '10' }); }}>Onboard someone else</button>
        </div>
      </div>
    );
  }

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const r = await run('consultant/onboard-client', { ...f, startingCredits: Number(f.startingCredits || 0) }, { refresh: false });
    if (r) setDone({ ...r, password: f.password, name: f.contactName, company: f.companyName });
  };
  const field = (k: keyof typeof f, label: string, props: React.InputHTMLAttributes<HTMLInputElement> = {}, hint?: string) => (
    <div>
      <label htmlFor={`ob-${k}`} className="block text-[16px] font-semibold">{label}</label>
      {hint && <p className="text-[14px] text-muted">{hint}</p>}
      <input id={`ob-${k}`} className={cx(inputClass, 'mt-2 h-14', fe[k] && 'border-danger')} value={f[k]} onChange={set(k)} aria-invalid={!!fe[k]} {...props} />
      {fe[k] && <p className="mt-1 text-[14px] text-danger">{fe[k]}</p>}
    </div>
  );
  return (
    <form onSubmit={submit} className="mx-auto max-w-[640px]" noValidate>
      <h1>Onboard someone new</h1>
      <p className="mt-3 text-[17px] text-muted">A new client company and their first hiring manager. They can log in and start hiring straight away.</p>
      <div className="mt-8 space-y-5">
        {field('companyName', 'Company name', { autoComplete: 'organization', required: true })}
        {field('contactName', 'Hiring manager’s name', { autoComplete: 'name', required: true })}
        {field('contactEmail', 'Their email', { type: 'email', autoComplete: 'off', required: true }, 'This is what they log in with.')}
        <div>
          <label htmlFor="ob-password" className="block text-[16px] font-semibold">Starting password</label>
          <p className="text-[14px] text-muted">At least 10 characters. You’ll send it to them.</p>
          <div className="relative mt-2">
            <input id="ob-password" className={cx(inputClass, 'h-14 pr-14', fe.password && 'border-danger')} type={show ? 'text' : 'password'} autoComplete="new-password" value={f.password} onChange={set('password')} aria-invalid={!!fe.password} />
            <button type="button" onClick={() => setShow((v) => !v)} aria-label={show ? 'Hide password' : 'Show password'} className="absolute right-2 top-1/2 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full hover:bg-page">{show ? <EyeOff size={20} aria-hidden /> : <Eye size={20} aria-hidden />}</button>
          </div>
          {fe.password && <p className="mt-1 text-[14px] text-danger">{fe.password}</p>}
        </div>
        {field('startingCredits', 'Starting credits', { type: 'number', min: 0, max: 100, inputMode: 'numeric' }, 'Credits they can use for hires. Demo credits, no money changes hands.')}
      </div>
      <ErrorText error={error ? { ...error, fieldErrors: null } : null} />
      <button type="submit" disabled={busy} className={cx(buttonClass('primary', true), 'mt-8 text-[18px]')}>{busy ? 'Setting them up…' : 'Create their account'}</button>
    </form>
  );
}
