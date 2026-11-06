'use client';
import { useState } from 'react';
import { useCommand, Dialog, Field, inputClass, textareaClass, ErrorText } from './client';
import { buttonClass } from './ui';

export function DepartureButton({ hireId }: { hireId: string }) {
  const { run, busy, error } = useCommand();
  const [open, setOpen] = useState(false);
  const [d, setD] = useState('2026-11-06');
  const [reason, setReason] = useState('');
  return (
    <>
      <button type="button" className={buttonClass('secondary')} onClick={() => setOpen(true)}>Record departure</button>
      <Dialog open={open} onClose={() => setOpen(false)} title="Record departure">
        <Field label="Departure date"><input type="date" className={inputClass} value={d} onChange={(e) => setD(e.target.value)} /></Field>
        <div className="mt-3"><Field label="Reason"><textarea className={textareaClass} rows={3} value={reason} onChange={(e) => setReason(e.target.value)} /></Field></div>
        <ErrorText error={error} />
        <div className="mt-4 flex justify-end gap-2"><button type="button" className={buttonClass('secondary')} onClick={() => setOpen(false)}>Cancel</button><button type="button" className={buttonClass('primary')} disabled={busy} onClick={async () => { if (await run(`hires/${hireId}/departure`, { leftDate: d, reason }) !== null) setOpen(false); }}>Save departure</button></div>
      </Dialog>
    </>
  );
}

export function ReplacementButton({ hireId }: { hireId: string }) {
  const { run, busy, error } = useCommand<{ eligibility: string; status: string }>();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState('');
  const [res, setRes] = useState<{ eligibility: string } | null>(null);
  return (
    <>
      <button type="button" className={buttonClass('primary')} onClick={() => setOpen(true)}>Request replacement</button>
      <Dialog open={open} onClose={() => setOpen(false)} title="Request a replacement">
        <p className="text-[15px]">One free replacement is included per paid hire when the person leaves within 90 calendar days of their start date. BondMoran confirms eligibility before a linked replacement role opens. Nothing is charged.</p>
        <div className="mt-3"><Field label="What happened"><textarea className={textareaClass} rows={3} value={reason} onChange={(e) => setReason(e.target.value)} /></Field></div>
        <ErrorText error={error} />
        {res && <p role="status" className="mt-2 text-[15px]">{res.eligibility === 'eligible' ? 'Request sent. Your consultant will review it.' : res.eligibility === 'outside_window' ? 'Not eligible: the departure is outside the 90-day replacement window. No replacement role was created and nothing was charged. A new paid role would need your explicit agreement.' : 'Not eligible for a free replacement.'}</p>}
        <div className="mt-4 flex justify-end gap-2"><button type="button" className={buttonClass('secondary')} onClick={() => setOpen(false)}>Close</button>{!res && <button type="button" className={buttonClass('primary')} disabled={busy || reason.length < 2} onClick={async () => { const r = await run(`hires/${hireId}/replacement-request`, { reason }); if (r) setRes(r); }}>Send request</button>}</div>
      </Dialog>
    </>
  );
}
