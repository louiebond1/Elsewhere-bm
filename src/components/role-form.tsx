'use client';
import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useForm, useFieldArray } from 'react-hook-form';
import { Field, inputClass, textareaClass, useCommand, ErrorText, api, useCsrf } from './client';
import { buttonClass, cx } from './ui';
import { gbp } from '../lib/format';
import { TAG_LABEL } from '../lib/hiring';

const TAGS = Object.keys(TAG_LABEL) as Array<keyof typeof TAG_LABEL>;

type Crit = { key: string; label: string; description: string; importance: 'essential' | 'desirable'; weight: number; evidenceTags: string[] };
type Form = { vacancyKey: string; title: string; roleFamily: 'finance' | 'operations' | 'commercial'; salaryPounds: string; locationRegion: string; workMode: string; outcomes: string; teachableSkills: string; briefText: string; serviceMode: 'standard' | 'full_search'; criteria: Crit[] };

/** Deterministic price preview using the same band rules as the server. The server remains authoritative. */
export function previewUnits(salaryPounds: number) {
  const s = salaryPounds * 100;
  const bands: [number, number][] = [[3500000, 5000], [6000000, 10000], [8500000, 15000], [11000000, 20000], [13500000, 25000], [16000000, 30000]];
  for (const [u, v] of bands) if (s <= u) return v;
  return 30000 + Math.ceil((s - 16000000) / 2500000) * 5000;
}

export function RoleForm({ clientId, ratePence, base, initial, roleId, rowVersion, locked }: { clientId?: string; ratePence: number; base: string; initial?: Partial<Form>; roleId?: string; rowVersion?: number; locked?: boolean }) {
  const router = useRouter();
  const csrf = useCsrf();
  const { run, busy, error } = useCommand<{ id: string }>();
  const [aiNote, setAiNote] = useState<string | null>(null);
  const { register, control, handleSubmit, watch, setValue, formState } = useForm<Form>({
    defaultValues: { vacancyKey: '', title: '', roleFamily: 'finance', salaryPounds: '', locationRegion: 'london', workMode: 'hybrid', outcomes: '', teachableSkills: 'Our internal systems\nOur reporting format', briefText: '', serviceMode: 'standard', criteria: [{ key: 'criterion_1', label: '', description: '', importance: 'essential', weight: 5, evidenceTags: [] }, { key: 'criterion_2', label: '', description: '', importance: 'essential', weight: 3, evidenceTags: [] }, { key: 'criterion_3', label: '', description: '', importance: 'desirable', weight: 2, evidenceTags: [] }], ...initial },
  });
  const { fields, append, remove, replace } = useFieldArray({ control, name: 'criteria' });
  const salary = Number(watch('salaryPounds') || 0);
  const mode = watch('serviceMode');
  const price = useMemo(() => {
    if (!salary || salary <= 0 || salary > 1000000) return null;
    const base = previewUnits(salary);
    const total = mode === 'full_search' ? base * 1.5 : base;
    return { base, total, deposit: base * 0.25, totalPence: Math.round((total * ratePence) / 10000), depositPence: Math.round((base * 0.25 * ratePence) / 10000) };
  }, [salary, mode, ratePence]);
  const submit = handleSubmit(async (f) => {
    const body = {
      ...(clientId ? { clientId } : {}),
      vacancyKey: f.vacancyKey, title: f.title, roleFamily: f.roleFamily, salaryPounds: Number(f.salaryPounds), locationRegion: f.locationRegion, workMode: f.workMode, workAuthorisationRequired: true,
      outcomes: f.outcomes.split('\n').map((x) => x.trim()).filter(Boolean), teachableSkills: f.teachableSkills.split('\n').map((x) => x.trim()).filter(Boolean), briefText: f.briefText, serviceMode: f.serviceMode,
      criteria: f.criteria.filter((c) => c.label.trim()).map((c, i) => ({ ...c, key: c.key || `criterion_${i + 1}`, weight: Number(c.weight) })),
    };
    const r = roleId ? await run(`roles/${roleId}/update-brief`, { ...body, expectedRowVersion: rowVersion, ...(locked ? { salaryPounds: undefined, vacancyKey: undefined, serviceMode: undefined } : {}) }) : await run('roles/draft', body);
    if (r) router.push(`${base}/roles/${r.id}`);
  });
  const structure = async () => {
    if (!roleId) { setAiNote('Save the draft first, then use Structure my brief.'); return; }
    const r = await api<{ draft: { outcomes: string[]; teachableSkills: string[]; criteria: Crit[]; warnings: string[] }; provider: string }>(`roles/${roleId}/structure`, { body: { brief: watch('briefText'), title: watch('title') }, csrf });
    if (!r.ok) { setAiNote(r.error.message); return; }
    const d = r.data.draft;
    if (d.outcomes.length) setValue('outcomes', d.outcomes.join('\n'));
    if (d.teachableSkills.length) setValue('teachableSkills', d.teachableSkills.join('\n'));
    if (d.criteria.length) replace(d.criteria);
    setAiNote(`${r.data.provider === 'fixture' ? 'Demo responses. ' : ''}Draft only: review every field before activating.${d.warnings.length ? ' ' + d.warnings.join(' ') : ''}`);
  };
  return (
    <form onSubmit={submit} className="grid gap-6 lg:grid-cols-[1fr_320px]">
      <div className="space-y-5">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Vacancy reference" hint="Your requisition reference, for example ALD-004."><input className={inputClass} disabled={locked} {...register('vacancyKey', { required: true })} /></Field>
          <Field label="Role title"><input className={inputClass} {...register('title', { required: true })} /></Field>
          <Field label="Role family"><select className={inputClass} {...register('roleFamily')}><option value="finance">Finance</option><option value="operations">Operations</option><option value="commercial">Commercial</option></select></Field>
          <Field label="Annual salary (£)" hint={locked ? 'Locked for pricing once the role is active.' : 'Whole pounds. This is the agreed charge salary.'}><input inputMode="numeric" className={inputClass} disabled={locked} {...register('salaryPounds', { required: true, pattern: /^\d+$/ })} /></Field>
          <Field label="Location"><select className={inputClass} {...register('locationRegion')}><option value="london">London</option><option value="hertfordshire">Hertfordshire</option><option value="manchester">Manchester</option><option value="remote_uk">Remote, UK</option></select></Field>
          <Field label="Work mode"><select className={inputClass} {...register('workMode')}><option value="hybrid">Hybrid</option><option value="onsite">Onsite</option><option value="remote">Remote</option></select></Field>
        </div>
        <Field label="Brief" hint="Describe what the person will do. Optional AI help turns it into an editable draft."><textarea className={textareaClass} rows={4} maxLength={8000} {...register('briefText')} /></Field>
        <div className="flex flex-wrap items-center gap-2"><button type="button" className={buttonClass('secondary')} onClick={structure}>Structure my brief</button>{aiNote && <span className="text-[14px] text-muted">{aiNote}</span>}</div>
        <Field label="Outcomes" hint="One per line. At least one is needed to activate."><textarea className={textareaClass} rows={3} {...register('outcomes')} /></Field>
        <Field label="Teachable skills" hint="One per line. Things you will teach, so they are not requirements."><textarea className={textareaClass} rows={2} {...register('teachableSkills')} /></Field>
        <fieldset>
          <legend className="text-[14px] font-medium">What matters (3 to 6 things, job-related only)</legend>
          <p className="text-[13px] text-muted">No protected traits, school prestige or years-of-experience requirements that the role does not need.</p>
          <div className="mt-2 space-y-3">
            {fields.map((f, i) => (
              <div key={f.id} className="rounded-lg border border-line p-3">
                <div className="grid gap-3 sm:grid-cols-[1fr_140px_100px]">
                  <Field label="Label"><input className={inputClass} {...register(`criteria.${i}.label`)} /></Field>
                  <Field label="Importance"><select className={inputClass} {...register(`criteria.${i}.importance`)}><option value="essential">Essential</option><option value="desirable">Desirable</option></select></Field>
                  <Field label="Weight 1-5"><input type="number" min={1} max={5} className={inputClass} {...register(`criteria.${i}.weight`, { valueAsNumber: true })} /></Field>
                </div>
                <fieldset className="mt-2">
                  <legend className="text-[14px] font-medium">Skills this covers <span className="font-normal text-muted">(tap one or more)</span></legend>
                  <div className="mt-1 flex flex-wrap gap-2">
                    {TAGS.map((t) => (
                      <label key={t} className="cursor-pointer">
                        <input type="checkbox" value={t} className="peer sr-only" {...register(`criteria.${i}.evidenceTags`)} />
                        <span className="inline-flex min-h-9 items-center rounded-full border border-line px-3 text-[14px] peer-checked:border-primary peer-checked:bg-primary peer-checked:text-white peer-focus-visible:ring-2 peer-focus-visible:ring-primary">{TAG_LABEL[t]}</span>
                      </label>
                    ))}
                  </div>
                </fieldset>
                <input type="hidden" {...register(`criteria.${i}.key`)} />
                <input type="hidden" {...register(`criteria.${i}.description`)} />
                {fields.length > 3 && <button type="button" className="mt-2 text-[14px] text-danger" onClick={() => remove(i)}>Remove</button>}
              </div>
            ))}
          </div>
          {fields.length < 6 && <button type="button" className={cx(buttonClass('ghost'), 'mt-2')} onClick={() => append({ key: `criterion_${fields.length + 1}`, label: '', description: '', importance: 'desirable', weight: 2, evidenceTags: [] })}>Add another</button>}
        </fieldset>
        <ErrorText error={error} />
        {error?.fieldErrors && <ul className="text-[14px] text-danger">{Object.entries(error.fieldErrors).map(([k, v]) => <li key={k}>{k}: {v}</li>)}</ul>}
        <div className="flex gap-2"><button className={buttonClass('primary')} disabled={busy || formState.isSubmitting}>{busy ? 'Saving…' : roleId ? 'Save changes' : 'Save draft'}</button></div>
        {!roleId && <p className="text-[14px] text-muted">Saving a draft is free and uses no open-role slot.</p>}
      </div>
      <aside className="h-fit rounded-xl border border-line bg-surface p-4 lg:sticky lg:top-4">
        <h3 className="text-[18px] font-semibold">Preview charges</h3>
        {!locked && <label className="mt-2 flex items-center gap-2 text-[15px]"><input type="checkbox" checked={mode === 'full_search'} onChange={(e) => setValue('serviceMode', e.target.checked ? 'full_search' : 'standard')} /> Full search from the start</label>}
        {price ? (
          <dl className="mt-3 space-y-1 text-[15px]">
            <div className="flex justify-between"><dt className="text-muted">Total</dt><dd>{price.total / 10000} credits / {gbp(price.totalPence)}</dd></div>
            <div className="flex justify-between"><dt className="text-muted">Deposit</dt><dd>{price.deposit / 10000} credits / {gbp(price.depositPence)}</dd></div>
            <div className="flex justify-between"><dt className="text-muted">Remaining on hire</dt><dd>{gbp(price.totalPence - price.depositPence)}</dd></div>
          </dl>
        ) : <p className="mt-3 text-[14px] text-muted">Enter a salary to preview the price.</p>}
        <p className="mt-3 text-[13px] text-muted">Preview only. The server calculates the price at activation. VAT treatment to be agreed.</p>
      </aside>
    </form>
  );
}
