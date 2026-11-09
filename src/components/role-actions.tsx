'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { ActionButton, Dialog, ErrorText, Field, inputClass, useCommand, api, useCsrf } from './client';
import { buttonClass } from './ui';
import { credits, gbp, creditsLabel } from '../lib/format';

export function ActivateRole({ roleId, willBeExtra, depositUnits, depositPence, base }: { roleId: string; willBeExtra: boolean; depositUnits: string; depositPence: string; base: string }) {
  return (
    <ActionButton path={`roles/${roleId}/activate`} body={{ confirmExtraDeposit: willBeExtra }} label="Make role live" redirect={`${base}/roles/${roleId}`}
      confirm={willBeExtra
        ? { title: 'Make this extra role live', confirmLabel: `Pay ${gbp(depositPence)} and make it live`, body: <><p>This client already has its included open roles. This role is an extra role.</p><p className="font-semibold">{creditsLabel(depositUnits)} ({gbp(depositPence)}) will be charged now as this role&apos;s one deposit.</p><p>The deposit is allocated to this role&apos;s first hire. It is not charged again when the first introduction is accepted, and closing the role does not refund it.</p></> }
        : { title: 'Make this role live', confirmLabel: 'Make it live', body: <><p>This role is inside your included open roles. Nothing is charged now.</p><p>The deposit of {creditsLabel(depositUnits)} ({gbp(depositPence)}) is reserved when you request the first introduction and charged when a candidate accepts.</p><p>The salary is locked for pricing once the role is live.</p></> }} />
  );
}

export function CloseRole({ roleId }: { roleId: string }) {
  const { run, busy, error } = useCommand();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState('filled');
  return (
    <>
      <button type="button" className={buttonClass('secondary')} onClick={() => setOpen(true)}>Close role</button>
      <Dialog open={open} onClose={() => setOpen(false)} title="Close role">
        <p className="text-[15px]">Closing cancels pending introduction requests, releases any unused reservation and cancels incomplete screening bookings. A paid deposit is not refunded. Accepted introductions, completed screenings and history stay, and an accepted candidate can still be hired at the quoted price.</p>
        <Field label="Reason"><select className={inputClass} value={reason} onChange={(e) => setReason(e.target.value)}><option value="filled">Filled</option><option value="cancelled">Cancelled</option><option value="on_hold">On hold</option><option value="other">Other</option></select></Field>
        <ErrorText error={error} />
        <div className="mt-5 flex justify-end gap-2"><button type="button" className={buttonClass('secondary')} onClick={() => setOpen(false)}>Cancel</button><button type="button" className={buttonClass('primary')} disabled={busy} onClick={async () => { if (await run(`roles/${roleId}/close`, { reason }) !== null) setOpen(false); }}>{busy ? 'Closing…' : 'Close role'}</button></div>
      </Dialog>
    </>
  );
}

export function ReopenRole({ roleId }: { roleId: string }) {
  const csrf = useCsrf();
  const router = useRouter();
  const [key] = useState(() => crypto.randomUUID());
  const [busy, setBusy] = useState(false);
  const [need, setNeed] = useState<string | null>(null);
  const [err, setErr] = useState<{ code: string; message: string } | null>(null);
  const go = async (confirmDeposit: boolean) => {
    setBusy(true);
    const r = await api(`roles/${roleId}/reopen`, { body: { confirmDeposit }, csrf, key: confirmDeposit ? crypto.randomUUID() : key });
    setBusy(false);
    if (r.ok) { setNeed(null); router.refresh(); return; }
    if (r.error.code === 'REOPEN_DEPOSIT_CONFIRMATION_REQUIRED') setNeed(r.error.message); else setErr(r.error);
  };
  return (
    <span className="inline-flex flex-col">
      <button type="button" className={buttonClass('secondary')} disabled={busy} onClick={() => go(!!need)}>{busy ? 'Reopening…' : need ? 'Confirm deposit and reopen' : 'Reopen'}</button>
      {need && <span className="mt-1 max-w-xs text-[13px] text-warning">{need}</span>}
      <ErrorText error={err} />
    </span>
  );
}

export function UpgradeRole({ roleId, ch }: { roleId: string; ch: { fullSearchPreview: { totalUnits: string; totalPence: string; remainingPence: string; remainingUnits: string }; paidPence: string; firstHirePaid: boolean } }) {
  return (
    <ActionButton path={`roles/${roleId}/upgrade`} label="Request full search" variant="secondary"
      confirm={{ title: 'Upgrade to full search', confirmLabel: 'Upgrade, no charge now', body: ch.firstHirePaid
        ? <><p>The first hire on this role is already paid and its price does not change.</p><p>Any further hire on this role will be priced as full search at {creditsLabel(ch.fullSearchPreview.totalUnits)}.</p></>
        : <><p>Full search is 1.5 times the standard credit price.</p><p className="font-semibold">New total: {creditsLabel(ch.fullSearchPreview.totalUnits)} / {gbp(ch.fullSearchPreview.totalPence)}. Already paid: {gbp(ch.paidPence)}. Remaining on hire: {creditsLabel(ch.fullSearchPreview.remainingUnits)} / {gbp(ch.fullSearchPreview.remainingPence)}.</p><p>Nothing is charged when you upgrade. A downgrade is not supported in this prototype.</p></> }} />
  );
}

export function RequestIntro({ roleId, candidateRef, depositPaid, holdExists, depositUnits, depositPence, disabledReason }: { roleId: string; candidateRef: string; depositPaid: boolean; holdExists: boolean; depositUnits: string; depositPence: string; disabledReason?: string | null }) {
  const [msg, setMsg] = useState('We would like to talk to you about this role.');
  const effect = depositPaid ? 'This role’s deposit is already paid. Nothing more is reserved or charged.' : holdExists ? 'This request shares the role’s existing reservation. Nothing more is reserved or charged.' : `${creditsLabel(depositUnits)} (${gbp(depositPence)}) will be reserved now and charged only when the first candidate accepts. A reservation is not a charge.`;
  return (
    <ActionButton path="intros/request" body={{ roleId, candidateRef, message: msg }} label="Request intro" disabledReason={disabledReason}
      confirm={{ title: 'Request an introduction', confirmLabel: 'Send request', body: <><p>The candidate sees your organisation, the role, salary and work location, then chooses whether to share their name and email for this role only.</p><p className="font-semibold">{effect}</p><p className="text-muted">Requests expire after 7 days. An in-app notification is sent; no email is sent in this demo.</p><label className="block text-[14px] font-medium">Message to the candidate<textarea className="mt-1 w-full rounded-lg border border-line p-2" rows={3} maxLength={600} value={msg} onChange={(e) => setMsg(e.target.value)} /></label></> }} />
  );
}

export function RequestScreening({ roleId, candidateRef, disabledReason }: { roleId: string; candidateRef: string; disabledReason?: string | null }) {
  return <ActionButton path="screenings/request" body={{ roleId, candidateRef }} label="Request screening" variant="secondary" disabledReason={disabledReason} confirm={{ title: 'Request a screening', confirmLabel: 'Request screening', body: <><p>This uses one of the five included human screenings for this role. Nothing is charged.</p><p>You can cancel before it is completed to free the slot.</p></> }} />;
}

type Pick = { ref: string; confidence: string; discoverySlot: boolean };
export function AutoPicks({ roleId, slotsLeft }: { roleId: string; slotsLeft: number }) {
  const csrf = useCsrf();
  const { run, busy, error } = useCommand();
  const [picks, setPicks] = useState<Pick[] | null>(null);
  const [shortfall, setShortfall] = useState(0);
  const [loading, setLoading] = useState(false);
  if (slotsLeft <= 0) return <span className="text-[14px] text-muted">All five included screenings are used or booked. Further screening pricing is not agreed yet, so ask your consultant.</span>;
  return (
    <>
      <button type="button" className={buttonClass('secondary')} disabled={loading} onClick={async () => { setLoading(true); const r = await api<{ picks: Pick[]; shortfall: number }>('screenings/auto-picks/preview', { body: { roleId }, csrf }); setLoading(false); if (r.ok) { setPicks(r.data.picks); setShortfall(r.data.shortfall); } }}>{loading ? 'Choosing…' : `Auto-select ${slotsLeft}`}</button>
      <Dialog open={!!picks} onClose={() => setPicks(null)} title="Proposed screenings">
        {picks && picks.length === 0 ? <p>No suitable profiles to screen yet.</p> : (
          <ul className="space-y-2 text-[15px]">{picks?.map((p) => <li key={p.ref} className="rounded-lg border border-line px-3 py-2">Candidate {p.ref.slice(0, 9)} · {p.confidence} evidence coverage{p.discoverySlot ? ' · reserved discovery slot: little evidence yet, but relevant' : p.confidence === 'low' ? ' · next highest ranked' : ''}</li>)}</ul>
        )}
        {shortfall > 0 && <p className="mt-2 text-[14px] text-muted">Only {picks?.length} suitable candidates are available, so {shortfall} slot{shortfall > 1 ? 's stay' : ' stays'} free.</p>}
        <p className="mt-3 text-[14px]">Confirming books these within your five included screenings. Nothing is charged.</p>
        <ErrorText error={error} />
        <div className="mt-4 flex justify-end gap-2"><button type="button" className={buttonClass('secondary')} onClick={() => setPicks(null)}>Cancel</button><button type="button" disabled={busy || !picks?.length} className={buttonClass('primary')} onClick={async () => { if (await run('screenings/auto-picks/confirm', { roleId, refs: picks!.map((p) => p.ref) }) !== null) setPicks(null); }}>{busy ? 'Booking…' : 'Confirm screenings'}</button></div>
      </Dialog>
    </>
  );
}

export function StageMenu({ introId, stage }: { introId: string; stage: string }) {
  const { run, busy, error } = useCommand();
  return (
    <span className="inline-flex flex-col">
      <label className="text-[13px] text-muted">Change stage
        <select className="ml-2 h-11 rounded-lg border border-line px-2 text-[15px] text-ink" value={stage} disabled={busy} onChange={(e) => run(`intros/${introId}/stage`, { stage: e.target.value })}>
          <option value="introduced">Introduced</option><option value="interview">Interview</option><option value="offer">Offer</option><option value="rejected">Rejected</option>
        </select>
      </label>
      <ErrorText error={error} />
    </span>
  );
}

type Preview = { kind: string; totalUnits: string; totalPence: string; paidPence: string; remainingUnits: string; remainingPence: string; salaryPence: string; isNewFullPrice: boolean; recorded: { offerDate: string; startDate: string; source: string } | null };

export function RecordHire({ introId, label: who, defaultOffer = '2026-11-06', defaultStart = '2026-11-20', outside, clientId }: { introId: string; label: string; defaultOffer?: string; defaultStart?: string; outside?: boolean; clientId?: string }) {
  const csrf = useCsrf();
  const router = useRouter();
  const { run, busy, error, setError } = useCommand<{ hire: { id: string }; existing: boolean }>();
  const [open, setOpen] = useState(false);
  const [p, setP] = useState<Preview | null>(null);
  const [offer, setOffer] = useState(defaultOffer);
  const [start, setStart] = useState(defaultStart);
  const [salary, setSalary] = useState('');
  const [done, setDone] = useState<string | null>(null);
  const openIt = async () => { setError(null); setOpen(true); const r = await api<Preview>(`intros/${introId}/hire-preview`, { csrf }); if (r.ok && r.data) { setP(r.data); setSalary(String(Number(BigInt(r.data.salaryPence) / 100n))); } };
  return (
    <>
      <button type="button" className={buttonClass('primary')} onClick={openIt}>{outside ? 'Review outside hire' : 'Record hire'}</button>
      <Dialog open={open} onClose={() => setOpen(false)} title={outside ? 'Recover an outside-system hire' : `Record hire: ${who}`}>
        {!p ? <p>Loading the price…</p> : p.kind === 'already_recorded' ? (
          <div className="space-y-2 text-[15px]">
            <p className="rounded-lg bg-success-tint px-3 py-2 text-success">Already recorded. Nothing more will be charged.</p>
            <p>This hire was recorded with offer accepted on {p.recorded?.offerDate} and start date {p.recorded?.startDate}. Price {creditsLabel(p.totalUnits)} / {gbp(p.totalPence)}, of which {gbp(p.paidPence)} has been charged.</p>
            <p className="text-muted">A second hire of the same person needs BondMoran review.</p>
          </div>
        ) : (
          <div className="space-y-3 text-[15px]">
            {p.isNewFullPrice ? <p className="rounded-lg bg-warning-tint px-3 py-2 text-warning">New hire, new full price. The first hire on this role is already paid, so this is a separate order and the role&apos;s deposit is not reused.</p> : null}
            <p>Total {creditsLabel(p.totalUnits)} / {gbp(p.totalPence)}. Already paid {gbp(p.paidPence)}.</p>
            <p className="font-semibold">This records the hire and charges {creditsLabel(p.remainingUnits)} ({gbp(p.remainingPence)}) now.</p>
            {outside && <p className="text-muted">This collects the remaining quoted price only. It adds no penalty and never recharges a paid hire.</p>}
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Offer accepted on"><input type="date" className={inputClass} value={offer} onChange={(e) => setOffer(e.target.value)} /></Field>
              <Field label="Start date"><input type="date" className={inputClass} value={start} onChange={(e) => setStart(e.target.value)} /></Field>
            </div>
            <Field label="Agreed annual salary (£)" hint={`The quoted charge salary is ${gbp(p.salaryPence)}.`}><input inputMode="numeric" className={inputClass} value={salary} onChange={(e) => setSalary(e.target.value.replace(/[^0-9]/g, ''))} /></Field>
          </div>
        )}
        <ErrorText error={error} />
        {done && <p role="status" className="mt-2 text-success">{done}</p>}
        <div className="mt-5 flex justify-end gap-2">
          <button type="button" className={buttonClass('secondary')} onClick={() => setOpen(false)}>Cancel</button>
          {p?.kind !== 'already_recorded' && <button type="button" className={buttonClass('primary')} disabled={busy || !p} onClick={async () => {
            const body = { introductionId: introId, acceptedOfferDate: offer, startDate: start, salaryPounds: Number(salary), ...(outside ? { clientId } : {}) };
            const r = await run(outside ? 'hires/outside' : 'hires/record', body);
            if (r) { setDone(r.existing ? 'This hire was already recorded. Nothing more was charged.' : 'Hire recorded.'); setTimeout(() => { setOpen(false); router.refresh(); }, 900); }
          }}>{busy ? 'Recording…' : 'Confirm hire'}</button>}
        </div>
      </Dialog>
    </>
  );
}

export function CancelIntro({ introId }: { introId: string }) {
  return <ActionButton path={`intros/${introId}/cancel`} label="Cancel request" variant="ghost" confirm={{ title: 'Cancel this request', body: <p>The candidate will no longer see this request. If no other request is pending, the role&apos;s reservation is released. Nothing is charged.</p>, confirmLabel: 'Cancel request' }} />;
}

export { credits };
