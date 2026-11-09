import { cookies } from 'next/headers';
import { SESSION_COOKIE, GATE_COOKIE, gateValid, viewerFromToken, csrfFor } from '@/server/auth';
import { checkAuthorizeRequest, SCOPE_TEXT, SCOPES, providerName } from '@/server/connectors/oauth';
import { Brand } from '@/components/shell';
import { CsrfProvider } from '@/components/client';
import { AllowConnector, ReturnAfterSignIn } from './allow';

export const dynamic = 'force-dynamic';

/** "Allow Claude / ChatGPT to help with your Elsewhere answers?" One screen, two buttons. */
export default async function Authorize({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const q = await searchParams;
  let checked: Awaited<ReturnType<typeof checkAuthorizeRequest>>;
  try { checked = await checkAuthorizeRequest(q); } catch {
    return <Shell><h1 className="text-[24px]">This link doesn’t work</h1><p className="mt-2 text-[15px] text-muted">Start the connection again from your AI assistant.</p></Shell>;
  }
  const c = await cookies();
  if (!gateValid(c.get(GATE_COOKIE)?.value)) return <Shell><ReturnAfterSignIn to="/demo" /></Shell>;
  const token = c.get(SESSION_COOKIE)?.value;
  const viewer = await viewerFromToken(token);
  if (!viewer || !token) return <Shell><ReturnAfterSignIn to="/login" /></Shell>;
  if (viewer.actor.userType !== 'candidate') return <Shell><h1 className="text-[24px]">For candidates only</h1><p className="mt-2 text-[15px] text-muted">Sign in as a candidate to connect your AI assistant.</p></Shell>;
  const scopes = checked.params.scope.split(' ').filter((s): s is (typeof SCOPES)[number] => (SCOPES as readonly string[]).includes(s));
  const app = providerName(checked.client.clientName);
  return (
    <Shell>
      <h1 className="text-[26px] leading-tight">Let {app} help with your answers?</h1>
      <p className="mt-2 text-[15px] text-muted">Signed in as {viewer.displayName ?? viewer.email}. {app} uses your own plan; it costs Elsewhere nothing.</p>
      <ul className="mt-5 space-y-2 text-[16px]">
        {scopes.map((s) => <li key={s} className="flex gap-2"><span aria-hidden className="text-success">✓</span>{SCOPE_TEXT[s]}</li>)}
        <li className="flex gap-2"><span aria-hidden className="text-muted">✕</span>It can’t send anything for you, and it can’t see anyone else.</li>
      </ul>
      <p className="mt-4 text-[14px] text-muted">You can disconnect any time on your Privacy page.</p>
      <CsrfProvider token={csrfFor(token)}><AllowConnector params={checked.params} app={app} /></CsrfProvider>
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <main className="mx-auto max-w-[520px] px-4 py-10">
      <Brand sub="Powered by Elsewhere" />
      <div className="mt-6 rounded-2xl border border-line bg-surface p-6">{children}</div>
    </main>
  );
}
