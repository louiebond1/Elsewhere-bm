import Link from 'next/link';
import { pageViewer } from '@/server/page-auth';
import { clientSummary, walletView, rolesForClient, awaitingAction } from '@/server/views/client';
import { PageHeader, Stat, Card, LinkButton, Empty, Badge } from '@/components/ui';
import { creditsLabel, gbp, label } from '@/lib/format';

export default async function ClientHome() {
  const { viewer, ctx } = await pageViewer('client');
  const id = viewer.actor.clientId!;
  const [c, w, roles, waiting] = await Promise.all([clientSummary(ctx, id), walletView(ctx, id), rolesForClient(ctx, id), awaitingAction(ctx, id)]);
  const open = roles.filter((r) => r.status === 'open');
  return (
    <>
      <PageHeader title={c.name} subtitle="Your hiring with BondMoran" actions={<LinkButton href="/client/roles/new">Add a role</LinkButton>} />
      <div className="grid gap-3 sm:grid-cols-3">
        <Stat label="Open roles" value={open.length} />
        <Stat label="People ready to interview" value={waiting} />
        <Stat label="Credits you can use" value={<Link href="/client/credits" className="text-ink no-underline hover:underline">{creditsLabel(w.spendable)}</Link>} hint={w.held !== '0' ? `${creditsLabel(w.held)} set aside while people decide` : undefined} />
      </div>
      <div className="mt-6 grid gap-6 lg:grid-cols-[1fr_320px]">
        <div className="space-y-3">
          <h2 className="text-[20px]">Your roles</h2>
          {roles.length === 0 ? <Empty action={<LinkButton href="/client/roles/new">Add a role</LinkButton>}>Add your first role and we’ll show you people who fit.</Empty> : roles.filter((r) => r.status !== 'closed').map((r) => (
            <Link key={r.id} href={`/client/roles/${r.id}`} className="block rounded-xl border border-line bg-surface p-4 no-underline hover:border-primary">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="font-semibold text-ink">{r.title}</span>
                <span className="flex gap-1">{r.isExtra && <Badge>Extra role</Badge>}{r.isReplacement && <Badge tone="success">Replacement</Badge>}<Badge tone={r.status === 'open' ? 'success' : 'neutral'}>{r.status === 'open' ? 'Live' : r.status === 'draft' ? 'Draft' : label(r.status)}</Badge></span>
              </div>
              <p className="mt-1 text-[14px] text-muted">{gbp(r.salaryPence)} · {label(r.workMode)}{r.charges ? ` · ${r.charges.accepted} of ${r.charges.maxIntros} people met` : ''}</p>
              <p className="mt-1 text-[14px] font-medium text-primary">Next: {r.next} →</p>
            </Link>
          ))}
        </div>
        <div className="space-y-4">
          <Card title="Your consultant">
            <p className="font-semibold">{c.consultant.name}</p>
            <p className="text-[14px] text-muted">{c.consultant.email}</p>
            <p className="mt-2 text-[14px]">Your contact at BondMoran. Each role includes 5 phone screenings and interview help.</p>
            <div className="mt-3"><LinkButton href="/client/support" variant="secondary">Ask for help</LinkButton></div>
          </Card>
          <Card title="Training">
            <p className="text-[15px]">{c.onboarding?.trainingStatus === 'completed' ? 'Hiring training completed' : c.onboarding?.trainingStatus === 'booked' ? 'Hiring training booked' : 'Training not booked yet'}{c.onboarding?.trainingMode ? ` (${c.onboarding.trainingMode === 'online' ? 'online' : 'in person'})` : ''}.</p>
            <div className="mt-3"><LinkButton href="/client/onboarding" variant="secondary">View training</LinkButton></div>
          </Card>
        </div>
      </div>
    </>
  );
}
