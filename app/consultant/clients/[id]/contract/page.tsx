import { notFound } from 'next/navigation';
import { and, desc, eq } from 'drizzle-orm';
import { pageViewer } from '@/server/page-auth';
import { contracts, clients } from '@/server/db/schema';
import { clientSummary } from '@/server/views/client';
import { PageHeader, Card, KV, Badge, Tabs } from '@/components/ui';
import { ActionButton } from '@/components/client';
import { ContractForm } from '@/components/consultant-client-forms';
import { prototype } from '@/config/prototype';
import { credits, gbp, date, label } from '@/lib/format';
import { isUuid } from '@/server/lib/ids';
import { businessDate } from '@/server/services/contracts';
import { defaultContractTerm } from '@/server/lib/dates';

export default async function ContractPage({ params }: { params: Promise<{ id: string }> }) {
  const { ctx } = await pageViewer('consultant');
  const { id } = await params;
  if (!isUuid(id)) notFound();
  const [exists] = await ctx.tx.select({ id: clients.id }).from(clients).where(and(eq(clients.id, id), eq(clients.datasetId, ctx.datasetId)));
  if (!exists) notFound();
  const c = await clientSummary(ctx, id);
  const ks = await ctx.tx.select().from(contracts).where(eq(contracts.clientId, id)).orderBy(desc(contracts.startDate));
  const today = businessDate(ctx);
  const term = defaultContractTerm(today);
  const tabs = ['overview', 'contract', 'roles', 'training', 'credits', 'work'].map((k) => ({ key: k, label: k === 'work' ? 'Work logs' : label(k), href: k === 'contract' ? `/consultant/clients/${id}/contract` : `/consultant/clients/${id}?tab=${k}` }));
  return (
    <>
      <PageHeader title={c.name} back={{ href: '/consultant/clients', label: 'Clients' }} />
      <Tabs current="contract" tabs={tabs} />
      <div className="grid gap-6 lg:grid-cols-[1fr_380px]">
        <div className="space-y-3">
          {ks.map((k) => (
            <Card key={k.id} title={k.label ?? label(k.planType)} action={<span className="flex gap-1"><Badge tone={k.status === 'active' ? 'success' : 'neutral'}>{label(k.status)}</Badge>{k.startDate > today && k.status !== 'expired' && <Badge tone="warning">Starts {date(k.startDate)}</Badge>}</span>}>
              {k.startDate > today && k.status !== 'expired' && <p className="mb-2 text-[14px] text-warning">Not yet in effect: it starts after today&apos;s business date ({date(today)}). The client cannot open roles or request introductions until then.</p>}
              <KV rows={[['Term', `${date(k.startDate)} to ${date(k.endDate)}`], ['Rate', k.creditRatePence ? `${gbp(k.creditRatePence)} per credit` : 'Not set (cannot activate)'], ['Included open roles', k.includedOpenRoles], ['Committed credits', credits(k.committedCreditUnits)], ['Instalments', k.instalmentCount], ['Pricing version', k.pricingVersion], ['Rollover', k.rolloverNote], ['Exclusivity', k.exclusivityNote]]} />
              {k.status === 'draft' && <div className="mt-3"><ActionButton path={`consultant/contracts/${k.id}/activate`} label="Activate contract" confirm={{ title: 'Activate contract', confirmLabel: 'Activate', body: <><p>Activation snapshots the provisional terms and grants {credits(k.committedCreditUnits)} demo credits once at {k.creditRatePence ? gbp(k.creditRatePence) : '?'} per credit.</p>{k.startDate > today && <p className="font-semibold text-warning">This contract starts on {date(k.startDate)}, after today&apos;s business date ({date(today)}). Until then the client cannot open roles or request introductions.</p>}<p>After activation, changes need a future contract rather than editing history.</p></> }} /></div>}
            </Card>
          ))}
        </div>
        <div className="space-y-4">
          <Card title="New draft contract"><ContractForm clientId={id} businessDate={today} defaultEndDate={term.endDate} /></Card>
          <Card title="Provisional terms snapshotted at activation">
            <KV rows={[['Deposit', `${prototype.depositBps / 100}% of standard credits`], ['Full search', `${prototype.fullSearchBps / 10000} times standard`], ['Accepted intros per role', prototype.maxAcceptedIntros], ['Included screenings', prototype.includedScreenings], ['Replacement window', `${prototype.replacementWindowDays} days`], ['Outside-hire window', `${prototype.outsideHireMonths} months`], ['VAT', 'To be agreed']]} />
            <p className="mt-2 text-[13px] text-muted">All values are provisional prototype settings, not agreed BondMoran terms.</p>
          </Card>
        </div>
      </div>
    </>
  );
}
