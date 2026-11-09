'use client';
import { useEffect } from 'react';
import { useCommand, ErrorText } from '@/components/client';
import { buttonClass, cx } from '@/components/ui';

type Params = { clientId: string; redirectUri: string; state: string | null; codeChallenge: string; scope: string };

export function AllowConnector({ params, app }: { params: Params; app: string }) {
  const { run, busy, error } = useCommand<{ redirectTo: string }>();
  const allow = async () => { const r = await run('oauth/approve', params, { refresh: false }); if (r?.redirectTo) window.location.href = r.redirectTo; };
  const deny = () => { const u = new URL(params.redirectUri); u.searchParams.set('error', 'access_denied'); if (params.state) u.searchParams.set('state', params.state); window.location.href = u.toString(); };
  return (
    <div className="mt-6 flex flex-col gap-2">
      <button type="button" className={cx(buttonClass('primary', true), 'min-h-14 text-[18px]')} disabled={busy} onClick={allow}>{busy ? 'Connecting…' : `Allow ${app}`}</button>
      <button type="button" className={buttonClass('ghost', true)} disabled={busy} onClick={deny}>Not now</button>
      <ErrorText error={error} />
    </div>
  );
}

/** Remember this page, send the person to sign in, and bring them back afterwards. */
export function ReturnAfterSignIn({ to }: { to: string }) {
  useEffect(() => {
    try { sessionStorage.setItem('bm_return', window.location.pathname + window.location.search); } catch {}
    window.location.replace(to);
  }, [to]);
  return <p className="text-[15px]">Taking you to sign in…</p>;
}
