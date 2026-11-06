'use client';
import { useState } from 'react';
import { useCommand, ErrorText, textareaClass, inputClass } from './client';
import { buttonClass } from './ui';

export function AnonymityReview({ evidenceId, safeClaim }: { evidenceId: string; safeClaim: string }) {
  const { run, busy, error } = useCommand();
  const [text, setText] = useState(safeClaim);
  return (
    <div className="space-y-2">
      <textarea className={textareaClass} rows={3} value={text} onChange={(e) => setText(e.target.value)} aria-label="Client-safe claim" />
      <p className="text-[13px] text-muted">Check the residual prose for anything identifying: names, employers, schools, exact project or customer labels, contact details or links.</p>
      <div className="flex gap-2">
        <button type="button" className={buttonClass('primary')} disabled={busy} onClick={() => run('consultant/evidence/anonymity-review', { evidenceId, decision: 'approved', safeClaim: text })}>Approve for clients</button>
        <button type="button" className={buttonClass('secondary')} disabled={busy} onClick={() => run('consultant/evidence/anonymity-review', { evidenceId, decision: 'rejected' })}>Needs changes</button>
      </div>
      <ErrorText error={error} />
    </div>
  );
}

export function ResolveEmployer({ candidateId, orgs }: { candidateId: string; orgs: { id: string; name: string }[] }) {
  const { run, busy, error } = useCommand();
  const [org, setOrg] = useState('');
  return (
    <div className="flex flex-col gap-2">
      <select className={inputClass} value={org} onChange={(e) => setOrg(e.target.value)} aria-label="Organisation"><option value="">Choose the matching organisation</option>{orgs.sort((a, b) => a.name.localeCompare(b.name)).map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}</select>
      <button type="button" className={buttonClass('primary')} disabled={!org || busy} onClick={() => run('consultant/resolve-employer', { candidateId, organisationId: org })}>Confirm organisation</button>
      <ErrorText error={error} />
    </div>
  );
}
