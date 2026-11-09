'use client';
import { useRouter } from 'next/navigation';
import { HandHelping } from 'lucide-react';
import { useCommand, ErrorText } from './client';
import { buttonClass, cx } from './ui';

/** "Let my AI do this" from the home page: opens the next question with the AI flow already started. */
export function HomeAiButton({ conversationId, startKind }: { conversationId: string | null; startKind: 'check_in' | 'initial_screening' }) {
  const router = useRouter();
  const { run, busy, error } = useCommand<{ id: string }>();
  const go = async () => {
    if (conversationId) { router.push(`/candidate/conversation/${conversationId}?ai=1`); return; }
    const r = await run('conversations/start', { kind: startKind }, { refresh: false });
    if (r) router.push(`/candidate/conversation/${r.id}?ai=1`);
  };
  return (
    <>
      <button type="button" onClick={go} disabled={busy} className={cx(buttonClass('secondary', true), 'gap-3 border-primary text-[17px] text-primary')}>
        <HandHelping aria-hidden size={22} strokeWidth={1.8} /> Let my AI do this
      </button>
      <ErrorText error={error} />
    </>
  );
}
