'use client';
import { takeReturnPath } from '@/lib/return-after-sign-in';
import { useEffect, useMemo, useState } from 'react';
import { api, Dialog, ErrorText, inputClass, type ApiError } from '@/components/client';
import { buttonClass, cx } from '@/components/ui';

type P = { userId: string; type: string; label: string; ref: string | null; email: string; status: string | null; hasRequest?: boolean };
type Sc = { code: string; title: string; persona: string; personaCode: string; action: string; expected: string };

const HIGHLIGHT = ['CAND-001', 'CAND-005', 'CAND-025', 'CAND-040'];

export function Personas({ people, scenarios, activeScenario }: { people: P[]; scenarios: Sc[]; activeScenario: string | null }) {
  const [err, setErr] = useState<ApiError | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [q, setQ] = useState('');
  const [reset, setReset] = useState(false);
  const [typed, setTyped] = useState('');
  const switchTo = async (userId: string) => {
    setBusy(userId);
    const r = await api<{ userType: string }>('demo/switch-persona', { body: { userId } });
    setBusy(null);
    if (!r.ok) return setErr(r.error);
    const back = takeReturnPath();
    try { sessionStorage.clear(); } catch {}
    window.location.replace(back ?? `/${r.data.userType}/home`);
  };
  const load = async (code: string) => {
    setBusy(code);
    const r = await api(`demo/scenario/${code}/load`, { body: {} });
    setBusy(null);
    if (!r.ok) return setErr(r.error);
    window.location.reload();
  };
  const doReset = async () => {
    setBusy('reset');
    const r = await api('demo/reset', { body: { confirm: typed } });
    setBusy(null);
    if (!r.ok) return setErr(r.error);
    window.location.reload();
  };
  const byRef = (ref: string) => people.find((p) => p.ref === ref);
  const waiting = people.filter((p) => p.type === 'candidate' && p.hasRequest);
  // "Start my own test": load the clean start, then sign in as its hiring manager.
  const startOwnTest = async () => {
    setBusy('FRESH');
    const r = await api('demo/scenario/FRESH/load', { body: {} });
    if (!r.ok) { setBusy(null); return setErr(r.error); }
    window.location.replace('/demo/tools#go-emma');
    window.location.reload();
  };
  useEffect(() => {
    if (activeScenario !== 'FRESH' || window.location.hash !== '#go-emma') return;
    const emma = people.find((p) => p.type === 'client' && p.email.includes('alder'));
    history.replaceState(null, '', '/demo/tools');
    if (emma) void api<{ userType: string }>('demo/switch-persona', { body: { userId: emma.userId } }).then((r) => { if (r.ok) window.location.replace(`/${r.data.userType}/home`); });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const personaFor = (code: string) => {
    if (code.startsWith('client:')) return people.find((p) => p.type === 'client' && p.email.includes({ A: 'alder', B: 'beacon', C: 'cedar' }[code.slice(7)]!));
    if (code === 'jamie' || code === 'alex') return people.find((p) => p.email.startsWith(code));
    return byRef(`CAND-0${code.slice(1)}`);
  };
  const candidates = useMemo(() => people.filter((p) => p.type === 'candidate' && (!q || `${p.label} ${p.ref}`.toLowerCase().includes(q.toLowerCase()))).sort((a, b) => Number(!!b.hasRequest) - Number(!!a.hasRequest) || (a.ref ?? '').localeCompare(b.ref ?? '')), [people, q]);
  const pill = (p: P | undefined, sub?: string) => p && (
    <button key={p.userId} type="button" onClick={() => switchTo(p.userId)} disabled={!!busy} className="press flex items-center gap-3 rounded-full bg-surface py-2 pl-2 pr-5 text-left shadow-[0_2px_10px_rgb(18_37_29/0.08)] hover:bg-white">
      <span aria-hidden className="flex h-9 w-9 items-center justify-center rounded-full bg-primary font-display text-[14px] font-semibold text-white">{p.label.split(' ').map((w) => w[0]).slice(0, 2).join('')}</span>
      <span><span className="block text-[15px] font-semibold leading-tight">{busy === p.userId ? 'Switching…' : p.label}</span>{sub && <span className="text-[13px] text-muted">{sub}</span>}</span>
    </button>
  );
  const group = (title: string, items: React.ReactNode[]) => items.filter(Boolean).length > 0 && (
    <div><h3 className="mb-3 text-[13px] font-semibold uppercase tracking-wide text-muted">{title}</h3><div className="flex flex-wrap gap-2">{items}</div></div>
  );
  return (
    <div className="mt-8 space-y-6">
      <ErrorText error={err} />
      <div className="grid gap-4 md:grid-cols-2">
        <a href="/candidate/start" className="lift rounded-[28px] bg-primary p-7 text-white no-underline shadow-[0_16px_40px_-16px_rgb(18_37_29/0.5)]">
          <span className="block font-display text-[26px] font-semibold">Create your account</span>
          <span className="mt-1 block text-[16px] text-white/85">Start fresh as yourself. Takes a minute.</span>
          <span className="mt-5 inline-block font-semibold">Get started →</span>
        </a>
        <a href="/login" className="lift rounded-[28px] bg-surface p-7 text-ink no-underline shadow-[0_16px_40px_-20px_rgb(18_37_29/0.35)]">
          <span className="block font-display text-[26px] font-semibold">Log in</span>
          <span className="mt-1 block text-[16px] text-muted">Already have an account? Use your email and password.</span>
          <span className="mt-5 inline-block font-semibold text-primary">Log in →</span>
        </a>
      </div>

      <section className="rounded-[28px] bg-surface/80 p-6 shadow-[0_8px_24px_rgb(18_37_29/0.06)] backdrop-blur-sm lg:p-8">
        <h2 className="text-[24px]">Or look around with a demo account</h2>
        <p className="mt-1 text-[16px] text-muted">Fictional people. One tap signs you in.</p>
        <div className="mt-6 grid gap-6 lg:grid-cols-3">
          {group('Candidates', HIGHLIGHT.map((r) => pill(byRef(r))))}
          {group('Hiring managers', people.filter((p) => p.type === 'client').map((p) => pill(p)))}
          {group('BondMoran team', people.filter((p) => p.type === 'consultant').map((p) => pill(p)))}
        </div>
        {waiting.length > 0 && <p className="mt-5 text-[15px] text-muted">To answer a meeting request as the candidate, use: {waiting.map((p, i) => <button key={p.userId} type="button" className="mx-1 font-semibold text-primary underline" onClick={() => switchTo(p.userId)}>{p.label}{i < waiting.length - 1 ? ',' : ''}</button>)}</p>}
        <details className="mt-5">
          <summary className="cursor-pointer text-[15px] font-semibold text-primary">All fictional candidates ({people.filter((p) => p.type === 'candidate').length})</summary>
          <input className={cx(inputClass, 'mt-3')} placeholder="Search name or reference" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search candidates" />
          <ul className="mt-3 grid max-h-[320px] gap-1 overflow-y-auto md:grid-cols-2">
            {candidates.map((p) => (
              <li key={p.userId}><button type="button" className="flex h-11 w-full items-center justify-between rounded-xl px-3 text-left hover:bg-page" onClick={() => switchTo(p.userId)}><span>{p.ref} · {p.label}</span><span className="text-[13px] text-muted">{p.status}</span></button></li>
            ))}
          </ul>
        </details>
      </section>

      <section className="rounded-[28px] border border-dashed border-line p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div><h2 className="text-[20px]">Tester tools</h2><p className="text-[14px] text-muted">These replace the shared demo data for everyone, including accounts you created.</p></div>
          <button type="button" className={buttonClass('secondary')} disabled={!!busy} onClick={startOwnTest}>{busy === 'FRESH' ? 'Getting it ready…' : 'Start my own test'}</button>
        </div>
        <details className="mt-4 text-[15px]">
          <summary className="cursor-pointer text-muted">Scenarios, empty workspace and reset</summary>
          <div className="mt-4 flex flex-wrap gap-2">
            <button type="button" className={buttonClass('secondary')} disabled={!!busy} onClick={() => load('EMPTY')}>{busy === 'EMPTY' ? 'Preparing…' : 'Completely empty workspace'}</button>
            <button type="button" className={buttonClass('danger')} onClick={() => setReset(true)}>Reset demo</button>
            <a className={buttonClass('ghost')} href="/demo/guide">Guided walkthrough</a>
          </div>
          <ul className="mt-4 grid gap-2 md:grid-cols-2">
            {scenarios.map((s) => {
              const p = personaFor(s.personaCode);
              return (
                <li key={s.code} className={cx('rounded-2xl bg-surface p-4', activeScenario === s.code && 'ring-2 ring-primary')}>
                  <p className="font-semibold">{s.code} · {s.title}</p>
                  <p className="text-[14px] text-muted">{s.action} · as {s.persona}</p>
                  {activeScenario === s.code && <p className="mt-1 text-[14px] text-success">Expected: {s.expected}</p>}
                  <div className="mt-2 flex flex-wrap gap-2">
                    <button type="button" className={cx(buttonClass('secondary'), 'min-h-10')} disabled={!!busy} onClick={() => load(s.code)}>{busy === s.code ? 'Loading…' : activeScenario === s.code ? 'Reload' : 'Load'}</button>
                    {activeScenario === s.code && p && <button type="button" className={cx(buttonClass('primary'), 'min-h-10')} onClick={() => switchTo(p.userId)}>Play as {p.label}</button>}
                  </div>
                </li>
              );
            })}
          </ul>
        </details>
      </section>
      <Dialog open={reset} onClose={() => setReset(false)} title="Reset demo">
        <p className="text-[15px]">This resets every fictional account in this shared demo to the baseline and signs everyone out.</p>
        <label className="mt-4 block text-[14px] font-medium">Type RESET to confirm<input className={cx(inputClass, 'mt-1')} value={typed} onChange={(e) => setTyped(e.target.value)} /></label>
        <div className="mt-5 flex justify-end gap-2"><button type="button" className={buttonClass('secondary')} onClick={() => setReset(false)}>Cancel</button><button type="button" className={buttonClass('danger')} disabled={typed !== 'RESET' || busy === 'reset'} onClick={doReset}>{busy === 'reset' ? 'Resetting…' : 'Reset demo'}</button></div>
      </Dialog>
    </div>
  );
}
