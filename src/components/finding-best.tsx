'use client';
import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { api, useCsrf } from './client';

/**
 * Starts the simulated interviews for this job (if any are needed) and refreshes the page as results arrive.
 * With no results yet it shows a friendly "Finding your best people" panel; otherwise a quiet one-line note.
 */
export function FindingBest({ roleId, hasResults }: { roleId: string; hasResults: boolean }) {
  const csrf = useCsrf();
  const router = useRouter();
  const [working, setWorking] = useState(!hasResults);
  const seen = useRef(-1);
  useEffect(() => {
    let stop = false;
    let timer: ReturnType<typeof setTimeout>;
    const poll = async () => {
      const r = await api<{ pending: boolean; ready: number }>(`roles/${roleId}/simulate-status`);
      if (stop || !r.ok) return;
      if (r.data.ready !== seen.current) { seen.current = r.data.ready; if (r.data.ready > 0) router.refresh(); }
      setWorking(r.data.pending);
      if (r.data.pending) timer = setTimeout(poll, 2500);
    };
    (async () => {
      const q = await api<{ queued: boolean }>(`roles/${roleId}/simulate`, { body: {}, csrf });
      if (stop) return;
      if (q.ok) { timer = setTimeout(poll, 1500); } else setWorking(false);
    })();
    return () => { stop = true; clearTimeout(timer); };
  }, [roleId, csrf, router]);

  if (hasResults) return working ? <p role="status" className="text-[14px] text-muted">Assessing more profiles… new results appear here automatically.</p> : null;
  return (
    <div role="status" className="rounded-2xl border border-line bg-info-tint px-6 py-8 text-center">
      {working ? (
        <>
          <div aria-hidden className="mx-auto mb-4 h-10 w-10 animate-spin rounded-full border-4 border-primary border-t-transparent" />
          <p className="text-[20px] font-semibold">Finding your best people…</p>
          <p className="mt-2 text-[15px] text-muted">We’re checking the evidence against your approved job checklist. Results appear as they are ready.</p>
        </>
      ) : (
        <>
          <p className="text-[20px] font-semibold">Assessment pending</p>
          <p className="mt-2 text-[15px] text-muted">No current assessments are ready. Check the job checklist or ask BondMoran to check assessment availability.</p>
        </>
      )}
    </div>
  );
}
