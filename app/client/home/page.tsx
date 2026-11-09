import Link from 'next/link';
import { pageViewer } from '@/server/page-auth';
import { clientSummary, walletView, rolesForClient, hiresForClient } from '@/server/views/client';
import { activeContractForClient } from '@/server/services/contracts';
import { Badge, buttonClass, cx } from '@/components/ui';
import { creditsLabel, gbp, label } from '@/lib/format';

/** The one screen a hiring manager needs: credits, one big button, and their hires. */
export default async function ClientHome() {
  const { viewer, ctx } = await pageViewer('client');
  const id = viewer.actor.clientId!;
  const [c, w, roles, hires, contract] = await Promise.all([clientSummary(ctx, id), walletView(ctx, id), rolesForClient(ctx, id), hiresForClient(ctx, id), activeContractForClient(ctx, id)]);
  const first = (viewer.displayName ?? '').split(' ')[0] || 'there';
  const current = roles.filter((r) => r.status !== 'closed');
  const value = contract?.creditRatePence ? gbp((BigInt(w.spendable) * BigInt(contract.creditRatePence)) / 10000n) : null;
  return (
    <div className="mx-auto max-w-[760px]">
      <h1 className="text-[32px] leading-tight">Hi {first}</h1>
      <p className="mt-1 text-[16px] text-muted">{c.name}</p>

      <Link href="/client/credits" className="mt-6 flex items-center justify-between rounded-2xl border border-line bg-surface px-5 py-4 no-underline hover:border-primary">
        <span>
          <span className="block text-[15px] text-muted">You have</span>
          <span className="block text-[28px] font-semibold text-ink">{creditsLabel(w.spendable)}</span>
          {value && <span className="block text-[14px] text-muted">worth about {value}</span>}
        </span>
        <span className="text-[15px] text-link">See credits →</span>
      </Link>

      <Link href="/client/roles/new" className={cx(buttonClass('primary', true), 'mt-4 min-h-16 rounded-2xl text-[20px]')}>Start a new hire</Link>
      <p className="mt-2 text-center text-[14px] text-muted">Tell your assistant who you need. We find your best people. You only pay if you hire.</p>

      <h2 className="mt-10 text-[20px]">Your hiring</h2>
      {current.length === 0 ? <p className="mt-2 rounded-xl border border-dashed border-line px-5 py-6 text-center text-[15px] text-muted">Nothing yet. Press “Start a new hire” to begin.</p> : (
        <ul className="mt-3 space-y-3">
          {current.map((r) => (
            <li key={r.id}>
              <Link href={`/client/roles/${r.id}`} className="block rounded-2xl border border-line bg-surface px-5 py-4 no-underline hover:border-primary">
                <span className="flex items-start justify-between gap-3">
                  <span className="text-[18px] font-semibold text-ink">{r.title}</span>
                  <Badge tone={r.status === 'open' ? 'success' : 'neutral'}>{r.status === 'open' ? 'Live' : r.status === 'draft' ? 'Not started' : label(r.status)}</Badge>
                </span>
                <span className="mt-1 block text-[14px] text-muted">{gbp(r.salaryPence)} · {label(r.workMode)}</span>
                <span className="mt-2 block text-[16px] font-medium text-primary">{r.next} →</span>
              </Link>
            </li>
          ))}
        </ul>
      )}

      <div className="mt-10 grid gap-3 text-[15px] sm:grid-cols-3">
        <Link href="/client/hires" className="rounded-xl border border-line bg-surface px-4 py-3 no-underline hover:border-primary"><span className="block text-ink">People you’ve hired</span><span className="text-muted">{hires.length}</span></Link>
        <Link href="/client/support" className="rounded-xl border border-line bg-surface px-4 py-3 no-underline hover:border-primary"><span className="block text-ink">Ask {c.consultant.name?.split(' ')[0] ?? 'us'} for help</span><span className="text-muted">Your BondMoran contact</span></Link>
        <Link href="/client/onboarding" className="rounded-xl border border-line bg-surface px-4 py-3 no-underline hover:border-primary"><span className="block text-ink">Hiring training</span><span className="text-muted">{c.onboarding?.trainingStatus === 'completed' ? 'Done' : c.onboarding?.trainingStatus === 'booked' ? 'Booked' : 'Not booked'}</span></Link>
      </div>
    </div>
  );
}
