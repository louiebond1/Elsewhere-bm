'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useCommand, ErrorText, Field, inputClass, textareaClass, Dialog, fillTemplate } from './client';
import { buttonClass } from './ui';

export function AdjustmentForm(props: { roleId: string; candidateId: string; evidence: { id: string; claim: string }[] }) {
  void props;
  return <p className="text-[14px] text-muted">Ranking bonuses are retired. Record a screening assessment against each requirement instead.</p>;
}

export function SimpleForm({ path, fields, submitLabel, extra, redirect, numberFields = [] }: { path: string; fields: Array<{ name: string; label: string; type?: string; options?: Array<[string, string]>; hint?: string; textarea?: boolean; defaultValue?: string; required?: boolean }>; submitLabel: string; extra?: Record<string, unknown>; redirect?: string; numberFields?: string[] }) {
  const { run, busy, error } = useCommand();
  const router = useRouter();
  const [vals, setVals] = useState<Record<string, string>>(() => Object.fromEntries(fields.map((f) => [f.name, f.defaultValue ?? ''])));
  const [saved, setSaved] = useState(false);
  return (
    <form className="space-y-3" onSubmit={async (e) => { e.preventDefault(); setSaved(false); const conv: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(vals)) { if (v === '') continue; conv[k] = numberFields.includes(k) ? Number(v) : v; }
      const body = { ...conv, ...extra }; const d = await run(path, body); if (d !== null) { setSaved(true); if (redirect) router.push(fillTemplate(redirect, d)); } }}>
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

type Proposal = { criteria: { criterionId: string; level: string; evidenceIds: string[]; reasonSafe: string }[] };
type ReviewRes = { proposal: Proposal; provider: string; model: string; profileVersionId: string | null; roleVersion: number; evidenceFingerprint: string };

/** Consultant-requested review of an ambiguous assessment. The proposal is applied only on explicit approval. */
export function AiReviewButton({ roleId, candidateId, criteria, current }: { roleId: string; candidateId: string; criteria: { id: string; label: string }[]; current: Record<string, string> }) {
  const review = useCommand<ReviewRes>();
  const apply = useCommand();
  const [res, setRes] = useState<ReviewRes | null>(null);
  return (
    <>
      <button type="button" className={buttonClass('secondary')} disabled={review.busy} onClick={async () => { const r = await review.run('consultant/matches/review', { roleId, candidateId }, { refresh: false }); if (r) setRes(r); }}>{review.busy ? 'Reviewing…' : 'Ask for an AI review'}</button>
      <ErrorText error={review.error} />
      <Dialog open={!!res} onClose={() => setRes(null)} title="Proposed assessment">
        {res && (
          <div className="space-y-3 text-[15px]">
            <p className="text-[13px] text-muted">{res.provider === 'fixture' ? 'Demo responses (no live model).' : `Model: ${res.model}.`} Uses approved, anonymity-reviewed evidence only. Nothing changes until you apply it.</p>
            <ul className="divide-y divide-line">{criteria.map((c) => { const p = res.proposal.criteria.find((x) => x.criterionId === c.id); return <li key={c.id} className="py-2"><span className="font-medium">{c.label}</span>: {current[c.id] ?? 'unknown'} → <span className="font-medium">{p?.level ?? 'unknown'}</span><p className="text-[14px] text-muted">{p?.reasonSafe}</p></li>; })}</ul>
          </div>
        )}
        <ErrorText error={apply.error} />
        <div className="mt-4 flex justify-end gap-2"><button type="button" className={buttonClass('secondary')} onClick={() => setRes(null)}>Discard</button><button type="button" className={buttonClass('primary')} disabled={apply.busy} onClick={async () => { if (res && await apply.run('consultant/matches/apply-review', { roleId, candidateId, profileVersionId: res.profileVersionId, roleVersion: res.roleVersion, evidenceFingerprint: res.evidenceFingerprint, proposal: res.proposal }) !== null) setRes(null); }}>Apply assessment</button></div>
      </Dialog>
    </>
  );
}
