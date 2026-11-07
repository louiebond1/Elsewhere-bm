'use client';
import { useMemo, useState } from 'react';
import { api, Dialog, ErrorText, inputClass, type ApiError } from '@/components/client';
import { buttonClass, cx } from '@/components/ui';

type P = { userId: string; type: string; label: string; ref: string | null; email: string; status: string | null };
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
    try { sessionStorage.clear(); } catch {}
    window.location.replace(`/${r.data.userType}/home`);
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
  const personaFor = (code: string) => {
    if (code.startsWith('client:')) return people.find((p) => p.type === 'client' && p.email.includes({ A: 'alder', B: 'beacon', C: 'cedar' }[code.slice(7)]!));
    if (code === 'jamie' || code === 'alex') return people.find((p) => p.email.startsWith(code));
    return byRef(`CAND-0${code.slice(1)}`);
  };
  const candidates = useMemo(() => people.filter((p) => p.type === 'candidate' && (!q || `${p.label} ${p.ref}`.toLowerCase().includes(q.toLowerCase()))).sort((a, b) => (a.ref ?? '').localeCompare(b.ref ?? '')), [people, q]);
  const card = (p: P | undefined, sub: string) => p && (
    <button key={p.userId} type="button" onClick={() => switchTo(p.userId)} disabled={!!busy} className="flex w-full items-center justify-between rounded-xl border border-line bg-surface p-4 text-left hover:border-primary">
      <span><span className="block font-semibold">{p.label}</span><span className="text-[14px] text-muted">{sub}</span></span>
      <span className="text-[14px] text-link">{busy === p.userId ? 'Switching…' : 'Use account'}</span>
    </button>
  );
  return (
    <div className="mt-6 space-y-8">
      <ErrorText error={err} />
      <section className="rounded-xl border border-line bg-surface p-4">
        <h2 className="text-[20px]">Test it yourself from scratch</h2>
        <p className="mt-1 text-[15px] text-muted">{activeScenario === 'EMPTY' ? 'You are in the empty workspace. Sign in as Alex Morgan to create a client, a contract and a role, then create candidates from the sign-up page.' : 'Replace the shared demo with an empty workspace: only the two consultant accounts, no clients, candidates or roles.'}</p>
        <div className="mt-3 flex flex-wrap gap-2">
          <button type="button" className={buttonClass(activeScenario === 'EMPTY' ? 'secondary' : 'primary')} disabled={!!busy} onClick={() => load('EMPTY')}>{busy === 'EMPTY' ? 'Preparing…' : activeScenario === 'EMPTY' ? 'Start empty again' : 'Start empty workspace'}</button>
          <a className={buttonClass('secondary')} href="/candidate/start">Create a fictional candidate</a>
          <button type="button" className={buttonClass('ghost')} onClick={() => setReset(true)}>Back to full demo data</button>
        </div>
      </section>
      <section>
        <h2 className="mb-3 text-[20px]">Client</h2>
        <div className="grid gap-3 md:grid-cols-3">
          {people.filter((p) => p.type === 'client').map((p) => card(p, p.email))}
        </div>
        {!people.some((p) => p.type === 'client') && <p className="text-[15px] text-muted">No client accounts yet. Create one as a consultant on the Clients page.</p>}
      </section>
      <section>
        <h2 className="mb-3 text-[20px]">Consultant</h2>
        <div className="grid gap-3 md:grid-cols-3">{people.filter((p) => p.type === 'consultant').map((p) => card(p, 'BondMoran consultant'))}</div>
      </section>
      <section>
        <h2 className="mb-3 text-[20px]">Candidate</h2>
        {!people.some((p) => p.type === 'candidate') && <p className="mb-3 text-[15px] text-muted">No candidates yet. Use Create a fictional candidate above.</p>}
        <div className="grid gap-3 md:grid-cols-4">{HIGHLIGHT.map((r) => card(byRef(r), `${r}${r === 'CAND-001' ? ' · stronger after conversation' : r === 'CAND-005' ? ' · hidden from current employer' : r === 'CAND-025' ? ' · screened, at offer' : ' · new graduate, onboarding'}`))}</div>
        <details className="mt-3 rounded-xl border border-line bg-surface p-4">
          <summary className="cursor-pointer font-medium">All fictional candidates ({people.filter((p) => p.type === 'candidate').length})</summary>
          <input className={cx(inputClass, 'mt-3')} placeholder="Search name or reference" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search candidates" />
          <ul className="mt-3 grid gap-2 md:grid-cols-2">
            {candidates.map((p) => (
              <li key={p.userId}><button type="button" className="flex h-11 w-full items-center justify-between rounded-lg px-3 text-left hover:bg-page" onClick={() => switchTo(p.userId)}><span>{p.ref} · {p.label}</span><span className="text-[13px] text-muted">{p.status}</span></button></li>
            ))}
          </ul>
        </details>
      </section>
      <section>
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-[20px]">Scenario launcher</h2>
          <button type="button" className={buttonClass('danger')} onClick={() => setReset(true)}>Reset demo</button>
        </div>
        <p className="mb-3 rounded-lg bg-warning-tint px-4 py-3 text-[14px] text-warning">Demo facilitator controls. Loading a scenario replaces the shared fictional dataset and signs everyone out. Actions then use the normal screens.</p>
        <div className="grid gap-3 md:grid-cols-2">
          {scenarios.map((s) => {
            const p = personaFor(s.personaCode);
            return (
              <div key={s.code} className={cx('rounded-xl border bg-surface p-4', activeScenario === s.code ? 'border-primary' : 'border-line')}>
                <div className="flex items-start justify-between gap-2"><h3 className="text-[16px]">{s.code} · {s.title}</h3>{activeScenario === s.code && <span className="rounded-full bg-primary px-2 py-0.5 text-[12px] text-white">Loaded</span>}</div>
                <p className="mt-2 text-[14px]"><span className="text-muted">Next action:</span> {s.action}</p>
                <p className="mt-1 text-[14px]"><span className="text-muted">As:</span> {s.persona}</p>
                {activeScenario === s.code && <p className="mt-2 rounded-lg bg-success-tint px-3 py-2 text-[14px] text-success">Expected: {s.expected}</p>}
                <div className="mt-3 flex flex-wrap gap-2">
                  <button type="button" className={buttonClass(activeScenario === s.code ? 'secondary' : 'primary')} disabled={!!busy} onClick={() => load(s.code)}>{busy === s.code ? 'Loading…' : activeScenario === s.code ? 'Reload scenario' : 'Load scenario'}</button>
                  {activeScenario === s.code && p && <button type="button" className={buttonClass('primary')} onClick={() => switchTo(p.userId)}>Play next step as {p.label}</button>}
                </div>
              </div>
            );
          })}
        </div>
      </section>
      <Dialog open={reset} onClose={() => setReset(false)} title="Reset demo">
        <p className="text-[15px]">This resets every fictional account in this shared demo to the baseline and signs everyone out.</p>
        <label className="mt-4 block text-[14px] font-medium">Type RESET to confirm<input className={cx(inputClass, 'mt-1')} value={typed} onChange={(e) => setTyped(e.target.value)} /></label>
        <div className="mt-5 flex justify-end gap-2"><button type="button" className={buttonClass('secondary')} onClick={() => setReset(false)}>Cancel</button><button type="button" className={buttonClass('danger')} disabled={typed !== 'RESET' || busy === 'reset'} onClick={doReset}>{busy === 'reset' ? 'Resetting…' : 'Reset demo'}</button></div>
      </Dialog>
    </div>
  );
}
