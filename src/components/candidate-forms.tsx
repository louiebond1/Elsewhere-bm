'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { api, useCsrf, useCommand, ErrorText, Field, inputClass, textareaClass, Dialog, JobPoller } from './client';
import { buttonClass, cx } from './ui';

export function CvUpload({ hasCv }: { hasCv: boolean }) {
  const csrf = useCsrf();
  const router = useRouter();
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [job, setJob] = useState<string | null>(null);
  const [paste, setPaste] = useState(false);
  const [text, setText] = useState('');
  return (
    <div className="space-y-3">
      <p className="text-[14px] text-muted">Text-based PDF or DOCX, up to 5 MB and 15 pages. Scanned images cannot be read.</p>
      <input type="file" accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document" aria-label="CV file" onChange={(e) => setFile(e.target.files?.[0] ?? null)} className="block w-full text-[15px]" />
      <div className="flex flex-wrap gap-2">
        <button type="button" className={buttonClass('primary')} disabled={!file || busy} onClick={async () => {
          if (!file) return; setBusy(true); setErr(null);
          const fd = new FormData(); fd.append('file', file);
          const r = await api<{ jobId: string }>('files/upload', { form: fd, csrf, key: crypto.randomUUID() });
          setBusy(false);
          if (r.ok) setJob(r.data.jobId); else setErr(r.error.message);
        }}>{busy ? 'Uploading…' : hasCv ? 'Replace' : 'Upload'}</button>
        <button type="button" className={buttonClass('secondary')} onClick={() => setPaste(!paste)}>Paste CV instead</button>
      </div>
      {job && <JobPoller jobId={job} pendingText="Reading your CV" failText="We could not read text from this file. Upload a text PDF or paste your CV." />}
      {err && <p role="alert" className="text-[14px] text-danger">{err}</p>}
      {paste && (
        <div className="space-y-2">
          <textarea className={textareaClass} rows={8} maxLength={30000} value={text} onChange={(e) => setText(e.target.value)} aria-label="CV text" />
          <button type="button" className={buttonClass('primary')} disabled={!text.trim()} onClick={async () => { const r = await api('files/paste', { body: { text }, csrf }); if (r.ok) { setPaste(false); router.refresh(); } else setErr(r.error.message); }}>Save pasted CV</button>
        </div>
      )}
    </div>
  );
}

export function Conversation({ conversationId, question, answered, canFinish }: { conversationId: string; question: { id: string; text: string; topic: string } | null; answered: number; canFinish: boolean }) {
  const { run, busy, error } = useCommand<{ nextQuestionId: string | null; jobId?: string }>();
  const router = useRouter();
  const [body, setBody] = useState('');
  return (
    <div className="space-y-4">
      {question ? (
        <div className="rounded-xl border border-line bg-surface p-5">
          <p className="text-[13px] text-muted">Topic: {question.topic}</p>
          <p className="mt-1 text-[18px] font-medium">{question.text}</p>
          <p className="mt-2 text-[14px] text-muted">An example from work, study, volunteering or everyday responsibility is useful.</p>
          <textarea className={cx(textareaClass, 'mt-3')} rows={6} maxLength={4000} value={body} onChange={(e) => setBody(e.target.value)} aria-label="Your answer" />
          <div className="mt-1 text-right text-[12px] text-muted">{body.length} / 4000</div>
          <ErrorText error={error} />
          <div className="mt-3 flex flex-wrap gap-2">
            <button type="button" className={buttonClass('primary')} disabled={busy || !body.trim()} onClick={async () => { if (await run(`conversations/${conversationId}/answers`, { questionId: question.id, body }) !== null) setBody(''); }}>{busy ? 'Saving…' : 'Send'}</button>
            <button type="button" className={buttonClass('secondary')} disabled={busy} onClick={() => run(`conversations/${conversationId}/skip`, { questionId: question.id })}>Skip question</button>
            <button type="button" className={buttonClass('ghost')} onClick={async () => { await run(`conversations/${conversationId}/pause`, {}, { refresh: false }); router.push('/candidate/home'); }}>Save and leave</button>
          </div>
        </div>
      ) : <p className="rounded-xl border border-line bg-surface p-5 text-[15px]">That is all the questions for this session. Choose Finish for now to build your draft evidence.</p>}
      {canFinish && <button type="button" className={buttonClass(question ? 'secondary' : 'primary')} disabled={busy} onClick={async () => { const r = await run(`conversations/${conversationId}/finish`, {}, { refresh: false }); if (r) router.push('/candidate/home'); }}>Finish for now</button>}
      <p className="text-[13px] text-muted">{answered} answered. You can stop at any time; skipping never counts against you.</p>
    </div>
  );
}

const TAGS = ['reconciliations', 'reporting', 'month_end', 'budgeting', 'forecasting', 'controls', 'audit', 'payroll', 'bookkeeping', 'credit_control', 'tax', 'analysis', 'excel', 'sql', 'automation', 'process_design', 'customer_work', 'sales', 'partnerships', 'project_delivery', 'coordination', 'leadership', 'learning'];

export function EvidenceEdit({ e }: { e: { id: string; claim: string; safeClaim: string | null; tags: string[]; uncertainty: string | null } }) {
  const { run, busy, error } = useCommand();
  const [open, setOpen] = useState(false);
  const [claim, setClaim] = useState(e.claim);
  const [safe, setSafe] = useState(e.safeClaim ?? '');
  const [tags, setTags] = useState<string[]>(e.tags);
  const [unc, setUnc] = useState(e.uncertainty ?? '');
  return (
    <>
      <button type="button" className={buttonClass('secondary')} onClick={() => setOpen(true)}>Edit</button>
      <Dialog open={open} onClose={() => setOpen(false)} title="Edit evidence">
        <p className="mb-3 text-[14px] text-muted">Editing creates a new version. The old version stops being shown to employers immediately, and BondMoran reviews the new text for anonymity.</p>
        <Field label="What you did (private)"><textarea className={textareaClass} rows={3} value={claim} onChange={(x) => setClaim(x.target.value)} /></Field>
        <div className="mt-3"><Field label="Client-safe summary" hint="No names, employers, schools, links or contact details."><textarea className={textareaClass} rows={3} value={safe} onChange={(x) => setSafe(x.target.value)} /></Field></div>
        <div className="mt-3"><Field label="Uncertainty or limitation (optional)"><input className={inputClass} value={unc} onChange={(x) => setUnc(x.target.value)} /></Field></div>
        <fieldset className="mt-3"><legend className="text-[14px] font-medium">Skill tags</legend><div className="mt-1 flex flex-wrap gap-2">{TAGS.map((t) => <label key={t} className={cx('cursor-pointer rounded-full border px-3 py-1 text-[13px]', tags.includes(t) ? 'border-primary bg-info-tint' : 'border-line')}><input type="checkbox" className="sr-only" checked={tags.includes(t)} onChange={() => setTags(tags.includes(t) ? tags.filter((x) => x !== t) : [...tags, t].slice(0, 8))} />{t.replace(/_/g, ' ')}</label>)}</div></fieldset>
        <ErrorText error={error} />
        <div className="mt-4 flex justify-end gap-2"><button type="button" className={buttonClass('secondary')} onClick={() => setOpen(false)}>Cancel</button><button type="button" className={buttonClass('primary')} disabled={busy} onClick={async () => { if (await run('candidate/evidence/revise', { evidenceId: e.id, claim, safeClaim: safe, tags, uncertainty: unc || null }) !== null) setOpen(false); }}>Save new version</button></div>
      </Dialog>
    </>
  );
}

export function EmployerPicker({ orgs, current }: { orgs: { id: string; name: string }[]; current: string | null }) {
  const { run, busy, error } = useCommand<{ status: string }>();
  const [mode, setMode] = useState<'organisation' | 'typed' | 'not_employed'>(current ? 'organisation' : 'organisation');
  const [org, setOrg] = useState(current ?? '');
  const [typed, setTyped] = useState('');
  const [msg, setMsg] = useState<string | null>(null);
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-4 text-[15px]">
        <label className="flex items-center gap-2"><input type="radio" checked={mode === 'organisation'} onChange={() => setMode('organisation')} /> Choose from the directory</label>
        <label className="flex items-center gap-2"><input type="radio" checked={mode === 'typed'} onChange={() => setMode('typed')} /> Not listed</label>
        <label className="flex items-center gap-2"><input type="radio" checked={mode === 'not_employed'} onChange={() => setMode('not_employed')} /> Not currently employed</label>
      </div>
      {mode === 'organisation' && <select className={inputClass} value={org} onChange={(e) => setOrg(e.target.value)} aria-label="Current employer"><option value="">Choose an organisation</option>{orgs.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}</select>}
      {mode === 'typed' && <><input className={inputClass} value={typed} onChange={(e) => setTyped(e.target.value)} placeholder="Employer name or website" aria-label="Employer name" /><p className="text-[13px] text-warning">If we cannot match this exactly, discovery is paused until BondMoran confirms the organisation.</p></>}
      <ErrorText error={error} />
      {msg && <p role="status" className="text-[14px] text-success">{msg}</p>}
      <button type="button" className={buttonClass('primary')} disabled={busy || (mode === 'organisation' && !org) || (mode === 'typed' && typed.trim().length < 2)} onClick={async () => {
        const body = mode === 'organisation' ? { mode, organisationId: org } : mode === 'typed' ? { mode, label: typed } : { mode };
        const r = await run('candidate/employer', body);
        if (r) setMsg(r.status === 'unresolved' ? 'Saved. Discovery is paused until your employer is confirmed: Needs confirmation.' : r.status === 'resolved' ? 'Saved. Your profile is hidden from this employer and its group.' : 'Saved. No current employer.');
      }}>Save employer</button>
    </div>
  );
}

export function BlockPicker({ orgs }: { orgs: { id: string; name: string }[] }) {
  const { run, busy, error } = useCommand();
  const [org, setOrg] = useState('');
  return (
    <div className="flex flex-col gap-2 sm:flex-row">
      <select className={inputClass} value={org} onChange={(e) => setOrg(e.target.value)} aria-label="Organisation to hide from"><option value="">Choose an organisation</option>{orgs.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}</select>
      <button type="button" className={buttonClass('secondary')} disabled={!org || busy} onClick={() => run('candidate/blocks', { organisationId: org })}>Hide from this organisation</button>
      <ErrorText error={error} />
    </div>
  );
}

export function DeleteForm() {
  const { run, busy, error } = useCommand();
  const [pw, setPw] = useState('');
  const [typed, setTyped] = useState('');
  return (
    <form className="space-y-3" onSubmit={async (e) => { e.preventDefault(); const r = await run('candidate/delete', { password: pw, confirm: typed }, { refresh: false }); if (r) window.location.replace('/candidate/deleted'); }}>
      <Field label="Current password"><input type="password" autoComplete="current-password" className={inputClass} value={pw} onChange={(e) => setPw(e.target.value)} /></Field>
      <Field label="Type DELETE to confirm"><input className={inputClass} value={typed} onChange={(e) => setTyped(e.target.value)} autoComplete="off" /></Field>
      <ErrorText error={error} />
      <button className={buttonClass('danger')} disabled={busy || typed !== 'DELETE' || !pw}>{busy ? 'Deleting…' : 'Delete profile'}</button>
    </form>
  );
}

export function PreferencesForm({ initial }: { initial: { region: string; workModes: string[]; roleFamilies: string[]; minSalaryPounds: number | null; noticeWeeks: number | null; workAuthorisation: string; experienceBand: string } }) {
  const { run, busy, error } = useCommand();
  const [f, setF] = useState(initial);
  const [saved, setSaved] = useState(false);
  const toggle = (k: 'workModes' | 'roleFamilies', v: string) => setF({ ...f, [k]: f[k].includes(v) ? f[k].filter((x) => x !== v) : [...f[k], v] });
  return (
    <form className="space-y-3" onSubmit={async (e) => { e.preventDefault(); setSaved(false); if (await run('candidate/preferences', f) !== null) setSaved(true); }}>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Region"><select className={inputClass} value={f.region} onChange={(e) => setF({ ...f, region: e.target.value })}><option value="london">London</option><option value="hertfordshire">Hertfordshire</option><option value="manchester">Manchester</option><option value="remote_uk">Remote, UK</option></select></Field>
        <Field label="Minimum salary (£)"><input inputMode="numeric" className={inputClass} value={f.minSalaryPounds ?? ''} onChange={(e) => setF({ ...f, minSalaryPounds: e.target.value ? Number(e.target.value.replace(/\D/g, '')) : null })} /></Field>
        <Field label="Notice (weeks)"><input inputMode="numeric" className={inputClass} value={f.noticeWeeks ?? ''} onChange={(e) => setF({ ...f, noticeWeeks: e.target.value ? Number(e.target.value.replace(/\D/g, '')) : null })} /></Field>
        <Field label="Right to work in the UK" hint="A self-reported statement, not citizenship or nationality."><select className={inputClass} value={f.workAuthorisation} onChange={(e) => setF({ ...f, workAuthorisation: e.target.value })}><option value="confirmed">Confirmed</option><option value="needs_discussion">Needs discussion</option><option value="unknown">Prefer to discuss later</option></select></Field>
        <Field label="Experience level employers see" hint="A broad description you choose. Age is never inferred."><select className={inputClass} value={f.experienceBand} onChange={(e) => setF({ ...f, experienceBand: e.target.value })}><option value="early_career">Early career</option><option value="established">Established practitioner</option><option value="leadership">Leadership experience</option><option value="unknown">Unknown</option></select></Field>
      </div>
      <fieldset><legend className="text-[14px] font-medium">Work modes</legend><div className="mt-1 flex flex-wrap gap-4">{['onsite', 'hybrid', 'remote'].map((m) => <label key={m} className="flex items-center gap-2 text-[15px]"><input type="checkbox" checked={f.workModes.includes(m)} onChange={() => toggle('workModes', m)} />{m}</label>)}</div></fieldset>
      <fieldset><legend className="text-[14px] font-medium">Role families</legend><div className="mt-1 flex flex-wrap gap-4">{['finance', 'operations', 'commercial'].map((m) => <label key={m} className="flex items-center gap-2 text-[15px]"><input type="checkbox" checked={f.roleFamilies.includes(m)} onChange={() => toggle('roleFamilies', m)} />{m}</label>)}</div></fieldset>
      <ErrorText error={error} />
      {saved && <p role="status" className="text-[14px] text-success">Preferences saved. Matches refreshed.</p>}
      <button className={buttonClass('primary')} disabled={busy}>Save preferences</button>
    </form>
  );
}
