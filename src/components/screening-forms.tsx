'use client';
import { useState } from 'react';
import { useCommand, ErrorText, Field, inputClass, textareaClass, api, useCsrf } from './client';
import { buttonClass } from './ui';
import { useRouter } from 'next/navigation';

type C = { id: string; label: string };

export function CompleteScreening({ screeningId, criteria, evidence }: { screeningId: string; criteria: C[]; evidence: { id: string; claim: string }[] }) {
  const { run, busy, error } = useCommand();
  const [minutes, setMinutes] = useState('18');
  const [notes, setNotes] = useState('');
  const [summary, setSummary] = useState('');
  const [a, setA] = useState(() => Object.fromEntries(criteria.map((c) => [c.id, { level: 'unknown', obs: '', ev: [] as string[] }])));
  return (
    <form className="space-y-4" onSubmit={async (e) => { e.preventDefault(); await run(`screenings/${screeningId}/complete`, { minutes: Number(minutes), notesPrivate: notes, summarySafe: summary, assessments: criteria.map((c) => ({ criterionId: c.id, level: a[c.id].level, evidenceIds: a[c.id].ev, observationPrivate: a[c.id].obs })) }); }}>
      {criteria.map((c) => (
        <fieldset key={c.id} className="rounded-lg border border-line p-3">
          <legend className="px-1 font-medium">{c.label}</legend>
          <div className="grid gap-2 sm:grid-cols-[180px_1fr]">
            <select className={inputClass} value={a[c.id].level} onChange={(e) => setA({ ...a, [c.id]: { ...a[c.id], level: e.target.value } })} aria-label={`Observation level for ${c.label}`}><option value="specific">Specific</option><option value="partial">Partial</option><option value="unknown">Unknown</option><option value="contradictory">Conflicting</option></select>
            <input className={inputClass} placeholder="Private observation" value={a[c.id].obs} onChange={(e) => setA({ ...a, [c.id]: { ...a[c.id], obs: e.target.value } })} aria-label={`Observation for ${c.label}`} />
          </div>
          {evidence.length > 0 && <div className="mt-2 flex flex-wrap gap-3 text-[13px]">{evidence.map((ev) => <label key={ev.id} className="flex items-center gap-1"><input type="checkbox" checked={a[c.id].ev.includes(ev.id)} onChange={(x) => setA({ ...a, [c.id]: { ...a[c.id], ev: x.target.checked ? [...a[c.id].ev, ev.id] : a[c.id].ev.filter((i) => i !== ev.id) } })} />{ev.claim.slice(0, 50)}…</label>)}</div>}
        </fieldset>
      ))}
      <Field label="Private notes"><textarea className={textareaClass} rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} /></Field>
      <Field label="Client-safe summary" hint="Shown to the client. No names, employers or identifying details."><textarea className={textareaClass} rows={3} value={summary} onChange={(e) => setSummary(e.target.value)} /></Field>
      <Field label="Actual minutes"><input inputMode="numeric" className={inputClass} value={minutes} onChange={(e) => setMinutes(e.target.value.replace(/\D/g, ''))} /></Field>
      <ErrorText error={error} />
      <button className={buttonClass('primary')} disabled={busy}>Complete screening</button>
    </form>
  );
}

export function ScheduleScreening({ screeningId }: { screeningId: string }) {
  const { run, busy, error } = useCommand();
  const [at, setAt] = useState('2026-11-10T10:00');
  return <div className="flex flex-wrap items-end gap-2"><Field label="Scheduled for"><input type="datetime-local" className={inputClass} value={at} onChange={(e) => setAt(e.target.value)} /></Field><button type="button" className={buttonClass('secondary')} disabled={busy} onClick={() => run(`screenings/${screeningId}/schedule`, { scheduledAt: new Date(at).toISOString() })}>Schedule</button><ErrorText error={error} /></div>;
}

export function RecordingUpload({ screeningId, consented }: { screeningId: string; consented: boolean }) {
  const csrf = useCsrf();
  const router = useRouter();
  const { run, busy } = useCommand();
  const [file, setFile] = useState<File | null>(null);
  const [err, setErr] = useState<string | null>(null);
  if (!consented) return <div><p className="mb-2 text-[14px]">Recording consent is required before upload.</p><button type="button" className={buttonClass('secondary')} disabled={busy} onClick={() => run(`screenings/${screeningId}/consent`, {})}>Record candidate&apos;s recording consent now</button></div>;
  return (
    <div className="space-y-2">
      <input type="file" accept=".mp3,.wav,audio/mpeg,audio/wav" onChange={(e) => setFile(e.target.files?.[0] ?? null)} aria-label="Recording file" />
      <button type="button" className={buttonClass('secondary')} disabled={!file} onClick={async () => { const fd = new FormData(); fd.append('file', file!); const r = await api(`screenings/${screeningId}/upload-recording`, { form: fd, csrf, key: crypto.randomUUID() }); if (r.ok) router.refresh(); else setErr(r.error.message); }}>Upload recording</button>
      {err && <p role="alert" className="text-[14px] text-danger">{err}</p>}
      <p className="text-[13px] text-muted">MP3 or WAV, up to 25 MB. Only consultants can list or play recordings.</p>
    </div>
  );
}

export function PrepEditor({ introId, initial, evidence }: { introId: string; initial: { questions: string[]; discussionPoints: { text: string; evidenceIds: string[] }[] }; evidence: { id: string; claim: string }[] }) {
  const { run, busy, error } = useCommand();
  const [qs, setQs] = useState(initial.questions.join('\n'));
  const [pts, setPts] = useState(initial.discussionPoints);
  const [ok, setOk] = useState(false);
  return (
    <div className="mt-6 rounded-xl border border-line bg-surface p-4">
      <h3 className="text-[18px]">Edit shared preparation</h3>
      <p className="text-[13px] text-muted">Both the client and the candidate see this text. Never include private notes.</p>
      <Field label="Questions (one per line)"><textarea className={textareaClass} rows={4} value={qs} onChange={(e) => setQs(e.target.value)} /></Field>
      <div className="mt-3 space-y-2">{pts.map((p, i) => <div key={i} className="flex gap-2"><input className={inputClass} value={p.text} onChange={(e) => setPts(pts.map((x, j) => (j === i ? { ...x, text: e.target.value } : x)))} /><button type="button" className={buttonClass('ghost')} onClick={() => setPts(pts.filter((_, j) => j !== i))}>Remove</button></div>)}</div>
      {pts.length < 3 && evidence.length > 0 && <select className={`${inputClass} mt-2`} value="" onChange={(e) => { const ev = evidence.find((x) => x.id === e.target.value); if (ev) setPts([...pts, { text: ev.claim, evidenceIds: [ev.id] }]); }} aria-label="Add discussion point from evidence"><option value="">Add a discussion point from approved evidence</option>{evidence.map((ev) => <option key={ev.id} value={ev.id}>{ev.claim.slice(0, 80)}</option>)}</select>}
      <ErrorText error={error} />
      {ok && <p role="status" className="text-[14px] text-success">Saved.</p>}
      <button type="button" className={`${buttonClass('primary')} mt-3`} disabled={busy} onClick={async () => { setOk(false); if (await run(`intros/${introId}/prep`, { questions: qs.split('\n').map((x) => x.trim()).filter(Boolean).slice(0, 5), discussionPoints: pts }) !== null) setOk(true); }}>Save preparation</button>
    </div>
  );
}
