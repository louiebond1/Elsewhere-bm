'use client';
import { useState } from 'react';
import { useCommand, ErrorText, Field, inputClass, textareaClass, Dialog, ActionButton } from './client';
import { buttonClass } from './ui';

type O = { introStatus: string; trainingStatus: string; trainingMode: string | null; interviewTrainingDone: boolean; processDesignDone: boolean; jobSpecsDone: boolean; assessmentTrainingDone: boolean; hiringBrief: string | null };

export function OnboardingForm({ clientId, o }: { clientId: string; o: O }) {
  const { run, busy, error } = useCommand();
  const [f, setF] = useState(o);
  const [saved, setSaved] = useState(false);
  return (
    <form className="space-y-3" onSubmit={async (e) => { e.preventDefault(); setSaved(false); if (await run(`consultant/onboarding/${clientId}`, f) !== null) setSaved(true); }}>
      <div className="grid gap-3 sm:grid-cols-3">
        <Field label="Introductory session"><select className={inputClass} value={f.introStatus} onChange={(e) => setF({ ...f, introStatus: e.target.value })}>{['not_booked', 'booked', 'completed'].map((x) => <option key={x} value={x}>{x.replace('_', ' ')}</option>)}</select></Field>
        <Field label="Training"><select className={inputClass} value={f.trainingStatus} onChange={(e) => setF({ ...f, trainingStatus: e.target.value })}>{['not_booked', 'booked', 'completed'].map((x) => <option key={x} value={x}>{x.replace('_', ' ')}</option>)}</select></Field>
        <Field label="Format"><select className={inputClass} value={f.trainingMode ?? ''} onChange={(e) => setF({ ...f, trainingMode: e.target.value || null })}><option value="">Not chosen</option><option value="online">Online</option><option value="in_person">In person</option></select></Field>
      </div>
      {(['interviewTrainingDone', 'processDesignDone', 'jobSpecsDone', 'assessmentTrainingDone'] as const).map((k) => <label key={k} className="flex items-center gap-2 text-[15px]"><input type="checkbox" checked={f[k]} onChange={(e) => setF({ ...f, [k]: e.target.checked })} />{{ interviewTrainingDone: 'Interview training', processDesignDone: 'Hiring process design', jobSpecsDone: 'Job specifications', assessmentTrainingDone: 'Fair assessment' }[k]}</label>)}
      <Field label="Hiring brief"><textarea className={textareaClass} rows={4} value={f.hiringBrief ?? ''} onChange={(e) => setF({ ...f, hiringBrief: e.target.value || null })} /></Field>
      <ErrorText error={error} />
      {saved && <p role="status" className="text-[14px] text-success">Saved.</p>}
      <button className={buttonClass('primary')} disabled={busy}>Save</button>
    </form>
  );
}

export function ReverseButton({ txId }: { txId: string }) {
  const [reason, setReason] = useState('');
  return <ActionButton path="consultant/reversals" body={{ transactionId: txId, reason }} label="Correct" variant="ghost" confirm={{ title: 'Post an exact reversal', confirmLabel: 'Post reversal', body: <><p>This inserts an exact opposite entry linked to the original. The original entry is never edited or deleted. Post a new correct entry afterwards if needed.</p><label className="block text-[14px] font-medium">Correction reason<input className="mt-1 h-11 w-full rounded-lg border border-line px-3" value={reason} onChange={(e) => setReason(e.target.value)} /></label></> }} />;
}

export function ContractForm({ clientId, businessDate, defaultEndDate }: { clientId: string; businessDate: string; defaultEndDate: string }) {
  const { run, busy, error } = useCommand();
  const [f, setF] = useState({ planType: 'annual', startDate: businessDate, endDate: defaultEndDate, creditRatePounds: '3800', includedOpenRoles: '2', committedCredits: '10', instalmentCount: '12', label: '' });
  const futureStart = f.startDate > businessDate;
  const [ok, setOk] = useState(false);
  return (
    <form className="space-y-3" onSubmit={async (e) => { e.preventDefault(); setOk(false); const r = await run('consultant/contracts', { clientId, planType: f.planType, startDate: f.startDate, endDate: f.endDate, creditRatePounds: f.creditRatePounds ? Number(f.creditRatePounds) : null, includedOpenRoles: Number(f.includedOpenRoles), committedCredits: Number(f.committedCredits), instalmentCount: Number(f.instalmentCount), label: f.label || undefined }); if (r !== null) setOk(true); }}>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Plan"><select className={inputClass} value={f.planType} onChange={(e) => setF({ ...f, planType: e.target.value })}><option value="annual">Annual</option><option value="monthly">Monthly</option></select></Field>
        <Field label="Label"><input className={inputClass} value={f.label} onChange={(e) => setF({ ...f, label: e.target.value })} /></Field>
        <Field label="Start" hint={`Defaults to today's business date (${businessDate}).`}><input type="date" className={inputClass} value={f.startDate} onChange={(e) => setF({ ...f, startDate: e.target.value })} /></Field>
        <Field label="End"><input type="date" className={inputClass} value={f.endDate} onChange={(e) => setF({ ...f, endDate: e.target.value })} /></Field>
        <Field label="Credit rate (£)" hint="Required. No standard monthly price is assumed. Pack £3,800, single £4,500."><input inputMode="decimal" className={inputClass} value={f.creditRatePounds} onChange={(e) => setF({ ...f, creditRatePounds: e.target.value })} /></Field>
        <Field label="Included open roles"><input inputMode="numeric" className={inputClass} value={f.includedOpenRoles} onChange={(e) => setF({ ...f, includedOpenRoles: e.target.value })} /></Field>
        <Field label="Committed credits" hint="Granted once at activation."><input inputMode="decimal" className={inputClass} value={f.committedCredits} onChange={(e) => setF({ ...f, committedCredits: e.target.value })} /></Field>
        <Field label="Instalments" hint="Schedule only. No payment collection."><input inputMode="numeric" className={inputClass} value={f.instalmentCount} onChange={(e) => setF({ ...f, instalmentCount: e.target.value })} /></Field>
      </div>
      {futureStart && <p role="status" className="rounded-lg bg-warning-tint px-3 py-2 text-[14px] text-warning">This start date is after today&apos;s business date ({businessDate}). Until it starts, the client cannot open roles or request introductions, even after activation.</p>}
      <ErrorText error={error} />
      {ok && <p role="status" className="text-[14px] text-success">Draft saved.</p>}
      <button className={buttonClass('primary')} disabled={busy}>Save draft contract</button>
    </form>
  );
}

export { Dialog };
