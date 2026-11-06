'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useCommand, ErrorText, Field, inputClass, textareaClass, Dialog } from './client';
import { buttonClass } from './ui';

export function AdjustmentForm({ roleId, candidateId, evidence }: { roleId: string; candidateId: string; evidence: { id: string; claim: string }[] }) {
  const { run, busy, error } = useCommand();
  const [open, setOpen] = useState(false);
  const [adj, setAdj] = useState(0);
  const [reason, setReason] = useState('');
  const [ids, setIds] = useState<string[]>([]);
  return (
    <>
      <button type="button" className={buttonClass('secondary')} onClick={() => setOpen(true)}>Add ranking adjustment</button>
      <Dialog open={open} onClose={() => setOpen(false)} title="Role-specific ranking adjustment">
        <Field label={`Adjustment (${adj > 0 ? '+' : ''}${adj})`} hint="Between -10 and +10. Applies to this role only."><input type="range" min={-10} max={10} value={adj} onChange={(e) => setAdj(Number(e.target.value))} className="w-full" /></Field>
        <Field label="Reason (private)"><textarea className={textareaClass} rows={3} value={reason} onChange={(e) => setReason(e.target.value)} /></Field>
        <fieldset className="mt-3"><legend className="text-[14px] font-medium">Referenced evidence</legend>{evidence.map((e) => <label key={e.id} className="mt-1 flex gap-2 text-[14px]"><input type="checkbox" checked={ids.includes(e.id)} onChange={(x) => setIds(x.target.checked ? [...ids, e.id] : ids.filter((i) => i !== e.id))} />{e.claim}</label>)}</fieldset>
        <ErrorText error={error} />
        <div className="mt-4 flex justify-end gap-2"><button type="button" className={buttonClass('secondary')} onClick={() => setOpen(false)}>Cancel</button><button type="button" className={buttonClass('primary')} disabled={busy} onClick={async () => { if (await run('consultant/ranking-adjustment', { roleId, candidateId, adjustment: adj, reason, evidenceIds: ids }) !== null) setOpen(false); }}>Save adjustment</button></div>
      </Dialog>
    </>
  );
}

export function SimpleForm({ path, fields, submitLabel, extra, redirect, transform }: { path: string; fields: Array<{ name: string; label: string; type?: string; options?: Array<[string, string]>; hint?: string; textarea?: boolean; defaultValue?: string; required?: boolean }>; submitLabel: string; extra?: Record<string, unknown>; redirect?: (d: unknown) => string; transform?: (v: Record<string, string>) => Record<string, unknown> }) {
  const { run, busy, error } = useCommand();
  const router = useRouter();
  const [vals, setVals] = useState<Record<string, string>>(() => Object.fromEntries(fields.map((f) => [f.name, f.defaultValue ?? ''])));
  const [saved, setSaved] = useState(false);
  return (
    <form className="space-y-3" onSubmit={async (e) => { e.preventDefault(); setSaved(false); const body = { ...(transform ? transform(vals) : vals), ...extra }; const d = await run(path, body); if (d !== null) { setSaved(true); if (redirect) router.push(redirect(d)); } }}>
      {fields.map((f) => (
        <Field key={f.name} label={f.label} hint={f.hint} error={error?.fieldErrors?.[f.name]}>
          {f.options ? <select className={inputClass} value={vals[f.name]} onChange={(e) => setVals({ ...vals, [f.name]: e.target.value })}>{f.options.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>
            : f.textarea ? <textarea className={textareaClass} rows={4} value={vals[f.name]} onChange={(e) => setVals({ ...vals, [f.name]: e.target.value })} />
            : <input className={inputClass} type={f.type ?? 'text'} required={f.required} value={vals[f.name]} onChange={(e) => setVals({ ...vals, [f.name]: e.target.value })} />}
        </Field>
      ))}
      <ErrorText error={error} />
      {saved && <p role="status" className="text-[14px] text-success">Saved.</p>}
      <button className={buttonClass('primary')} disabled={busy}>{busy ? 'Saving…' : submitLabel}</button>
    </form>
  );
}
