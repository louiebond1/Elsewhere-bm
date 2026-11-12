'use client';
import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { QuestionAi, hasGaps } from './ai-task';
import { api, useCsrf, useCommand, ErrorText, Field, inputClass, textareaClass, Dialog, JobPoller, type ApiError } from './client';
import { buttonClass, cx } from './ui';

export function CvUpload({ hasCv }: { hasCv: boolean }) {
  const csrf = useCsrf();
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [over, setOver] = useState(false);
  const [name, setName] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [job, setJob] = useState<string | null>(null);
  const [paste, setPaste] = useState(false);
  const [text, setText] = useState('');
  // Uploads straight away: drop a file or tap to choose. No separate Upload button to miss.
  const send = async (file: File | undefined) => {
    if (!file) return;
    setName(file.name); setBusy(true); setErr(null); setJob(null);
    const fd = new FormData(); fd.append('file', file);
    const r = await api<{ jobId: string }>('files/upload', { form: fd, csrf, key: crypto.randomUUID() });
    setBusy(false);
    if (r.ok) setJob(r.data.jobId); else setErr(r.error.message);
  };
  return (
    <div className="space-y-3">
      <label onDragOver={(e) => { e.preventDefault(); setOver(true); }} onDragLeave={() => setOver(false)} onDrop={(e) => { e.preventDefault(); setOver(false); void send(e.dataTransfer.files?.[0]); }}
        className={cx('flex cursor-pointer flex-col items-center justify-center gap-2 rounded-3xl border-2 border-dashed px-6 py-10 text-center transition-colors', over ? 'border-primary bg-success-tint' : 'border-control/50 bg-page hover:border-primary')}>
        <input type="file" className="sr-only" accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document" aria-label="CV file" onChange={(e) => void send(e.target.files?.[0])} disabled={busy} />
        <span aria-hidden className="flex h-14 w-14 items-center justify-center rounded-full bg-primary text-[26px] text-white">↑</span>
        <span className="font-display text-[20px] font-semibold">{busy ? `Uploading ${name}…` : name && !err ? `${name} uploaded` : hasCv ? 'Drop a new CV here, or tap to choose' : 'Drop your CV here, or tap to choose'}</span>
        <span className="text-[15px] text-muted">PDF or Word (.docx), up to 5 MB. Photos or scans can’t be read.</span>
      </label>
      {job && <JobPoller jobId={job} pendingText="Reading your CV" failText="We couldn’t read text from this file. Try a text PDF, or paste your CV below." />}
      {err && <p role="alert" className="text-[15px] text-danger">{err}</p>}
      <button type="button" className={cx(buttonClass('ghost'), 'px-0')} onClick={() => setPaste(!paste)}>{paste ? 'Hide' : 'Or paste your CV as text'}</button>
      {paste && (
        <div className="space-y-2">
          <textarea className={textareaClass} rows={8} maxLength={30000} value={text} onChange={(e) => setText(e.target.value)} aria-label="CV text" />
          <button type="button" className={buttonClass('primary')} disabled={!text.trim()} onClick={async () => { const r = await api('files/paste', { body: { text }, csrf }); if (r.ok) { setPaste(false); router.refresh(); } else setErr(r.error.message); }}>Save pasted CV</button>
        </div>
      )}
    </div>
  );
}

export function Conversation({ conversationId, question, answered, canFinish, ai, autoAi = false }: { autoAi?: boolean; conversationId: string; question: { id: string; text: string; topic: string; draft?: { body: string; provider: string } | null } | null; answered: number; canFinish: boolean; ai: { connected: string | null; connectorUrl: string } }) {
  const { run, busy, error } = useCommand<{ nextQuestionId: string | null; jobId?: string }>();
  const router = useRouter();
  const box = useRef<HTMLTextAreaElement>(null);
  const [body, setBody] = useState('');
  // Where the text came from: their AI's draft (and whether they changed it since). Shown honestly, never guessed.
  const [fromAi, setFromAi] = useState<string | null>(null);
  const [edited, setEdited] = useState(false);
  const [reviewing, setReviewing] = useState(!!question?.draft);
  const gaps = hasGaps(body);
  const finish = async () => { const r = await run(`conversations/${conversationId}/finish`, {}, { refresh: false }); if (r) router.push('/candidate/home'); };
  if (!question) return (
    <div className="space-y-4">
      <h1>That’s all for now</h1>
      <p className="text-[17px] text-muted">Press Finish to turn your answers into examples for your profile.</p>
      {canFinish && <button type="button" className={buttonClass('primary', true)} disabled={busy} onClick={finish}>Finish for now</button>}
    </div>
  );
  return (
    <div>
      {reviewing ? <p className="mb-4 text-[15px] text-muted">Your question: <span className="text-ink">{question.text}</span></p> : (<>
        <h1>{question.text}</h1>
        <p className="mt-3 text-[17px] text-muted">What did you do, and what changed?</p>
      </>)}
      <div className={reviewing ? 'hidden' : 'mt-6'}>
        <textarea ref={box} className={cx(textareaClass, "min-h-[220px]")} rows={7} maxLength={4000} value={body} placeholder="Write your answer…" onChange={(e) => { setBody(e.target.value); if (fromAi) setEdited(true); }} aria-label="Your answer" />
        <div className="mt-1 flex justify-between gap-2 text-[13px] text-muted"><span>{fromAi ? `Started with your ${fromAi}${edited ? ' · Edited by you' : ''} · Not sent` : ''}</span><span>{body.length} / 4000</span></div>
        {gaps && <p role="status" className="mt-2 rounded-xl bg-success-tint px-4 py-2 text-[15px] text-primary">Fill in the gaps in [square brackets] before sending.</p>}
      </div>
      <div className={reviewing ? '' : 'mt-5'}>
        <QuestionAi questionId={question.id} questionText={question.text} initialDraft={question.draft ?? null} connected={ai.connected} connectorUrl={ai.connectorUrl} hasText={!!body.trim()} onReview={setReviewing} autoStart={autoAi}
          onUse={(d, mode, edit) => { setBody((b) => (mode === 'add' && b.trim() ? `${b.trim()}\n\n${d.body}` : d.body)); setFromAi(d.provider); setEdited(false); if (edit) setTimeout(() => box.current?.focus(), 50); }} />
      </div>
      {!reviewing && (
        <div className="mt-5">
          <ErrorText error={error} />
          <button type="button" className={cx(buttonClass('primary', true), 'text-[17px]')} disabled={busy || !body.trim() || gaps} onClick={async () => { if (await run(`conversations/${conversationId}/answers`, { questionId: question.id, body, usedDraft: !!fromAi }) !== null) { setBody(''); setFromAi(null); } }}>{busy ? 'Sending…' : 'Send answer'}</button>
          <div className="mt-4 flex flex-wrap items-center justify-center gap-x-1 text-[15px]">
            <button type="button" className={cx(buttonClass('ghost'), 'min-h-11 px-3 text-ink')} disabled={busy} onClick={() => run(`conversations/${conversationId}/skip`, { questionId: question.id })}>Skip question</button>
            <span aria-hidden className="text-line">|</span>
            <button type="button" className={cx(buttonClass('ghost'), 'min-h-11 px-3 text-ink')} onClick={async () => { await run(`conversations/${conversationId}/pause`, {}, { refresh: false }); router.push('/candidate/home'); }}>Save and leave</button>
            {canFinish && <><span aria-hidden className="text-line">|</span><button type="button" className={cx(buttonClass('ghost'), 'min-h-11 px-3 text-ink')} disabled={busy} onClick={finish}>Finish for now</button></>}
          </div>
          <p className="mt-2 text-center text-[13px] text-muted">{answered} answered. Skipping never counts against you.</p>
        </div>
      )}
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

export function PreferencesForm({ initial }: { initial: { region: string; workModes: string[]; roleFamilies: string[]; minSalaryPounds: number | null; noticeWeeks: number | null; workAuthorisation: string; experienceBand: string; over18: boolean | null; roleFamilyNonNegotiable: boolean } }) {
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
      <label className="flex items-center gap-2 text-[15px]"><input type="checkbox" checked={f.roleFamilyNonNegotiable} onChange={(e) => setF({ ...f, roleFamilyNonNegotiable: e.target.checked })} /> Only these types of job: it’s a must for me</label>
      <Field label="Are you 18 or over?" hint="Private. Only used for jobs that must have someone 18 or over; employers never see it."><select className={inputClass} value={f.over18 == null ? '' : f.over18 ? 'yes' : 'no'} onChange={(e) => setF({ ...f, over18: e.target.value === '' ? null : e.target.value === 'yes' })}><option value="">Prefer not to say yet</option><option value="yes">Yes</option><option value="no">No</option></select></Field>
      <ErrorText error={error} />
      {saved && <p role="status" className="text-[14px] text-success">Preferences saved. Matches refreshed.</p>}
      <button className={buttonClass('primary')} disabled={busy}>Save preferences</button>
    </form>
  );
}

/** Full reset: start again with an empty mini-me. Typed RESET so it's never an accident. */
export function ResetProfile() {
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<ApiError | null>(null);
  const csrf = useCsrf();
  return (
    <>
      <button type="button" className={buttonClass('danger')} onClick={() => setOpen(true)}>Full reset</button>
      <Dialog open={open} onClose={() => setOpen(false)} title="Start again from scratch?">
        <p className="text-[15px]">This clears your mini-me, chats, examples, CV, interviews, matches and job preferences. You keep your login, your name, your connected ChatGPT or Claude, and who you’ve hidden from.</p>
        <label className="mt-4 block text-[14px] font-medium">Type RESET to confirm<input className={cx(inputClass, 'mt-1')} value={typed} onChange={(e) => setTyped(e.target.value)} /></label>
        <ErrorText error={err} />
        <div className="mt-5 flex justify-end gap-2">
          <button type="button" className={buttonClass('secondary')} onClick={() => setOpen(false)}>Cancel</button>
          <button type="button" className={buttonClass('danger')} disabled={typed !== 'RESET' || busy} onClick={async () => {
            setBusy(true);
            const r = await api('candidate/reset-profile', { body: { confirm: typed }, csrf });
            setBusy(false);
            if (!r.ok) return setErr(r.error);
            window.location.replace('/candidate/home');
          }}>{busy ? 'Resetting…' : 'Reset everything'}</button>
        </div>
      </Dialog>
    </>
  );
}
