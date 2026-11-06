import Link from 'next/link';
import { notFound } from 'next/navigation';
import { and, eq, desc } from 'drizzle-orm';
import { pageViewer } from '@/server/page-auth';
import { clientSummary, rolesForClient, creditsView } from '@/server/views/client';
import { workLogs, clients } from '@/server/db/schema';
import { PageHeader, Tabs, Card, KV, Badge, ResponsiveTable, LinkButton, Empty } from '@/components/ui';
import { SimpleForm } from '@/components/consultant-forms';
import { OnboardingForm, ReverseButton } from '@/components/consultant-client-forms';
import { creditsLabel, gbp, date, label, credits } from '@/lib/format';
import { isUuid } from '@/server/lib/ids';

export default async function ClientDetail({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ tab?: string }> }) {
  const { ctx } = await pageViewer('consultant');
  const { id } = await params;
  const tab = (await searchParams).tab ?? 'overview';
  if (!isUuid(id)) notFound();
  const [exists] = await ctx.tx.select({ id: clients.id }).from(clients).where(and(eq(clients.id, id), eq(clients.datasetId, ctx.datasetId)));
  if (!exists) notFound();
  const c = await clientSummary(ctx, id);
  const tabs = ['overview', 'contract', 'roles', 'training', 'credits', 'work'].map((k) => ({ key: k, label: k === 'work' ? 'Work logs' : label(k), href: k === 'contract' ? `/consultant/clients/${id}/contract` : `/consultant/clients/${id}?tab=${k}` }));
  let body: React.ReactNode = null;
  if (tab === 'overview' || tab === 'credits') {
    const v = await creditsView(ctx, id, {});
    body = (
      <div className="grid gap-4 lg:grid-cols-[1fr_340px]">
        <div>
          <h3 className="mb-2">Ledger</h3>
          <ResponsiveTable rowKey={(r) => r.id} rows={v.ledger} empty="No credits have been added or used." columns={[
            { label: 'Date', cell: (r) => date(r.at) }, { label: 'Entry', cell: (r) => label(r.type) }, { label: 'Role', cell: (r) => r.role ?? '' },
            { label: 'Credits', align: 'right', cell: (r) => credits(r.units) }, { label: 'GBP', align: 'right', cell: (r) => gbp(r.pence) },
            { label: '', cell: (r) => r.type !== 'reversal' && !v.ledger.some((x) => x.reversalOf === r.id) ? <ReverseButton txId={r.id} /> : r.reversalOf ? 'Correction' : 'Reversed' },
          ]} />
        </div>
        <div className="space-y-4">
          <Card title="Balance"><KV rows={[['Posted', creditsLabel(v.wallet.posted)], ['Reserved', creditsLabel(v.wallet.held)], ['Spendable', creditsLabel(v.wallet.spendable)]]} /></Card>
          <Card title="Simulated grant">
            <SimpleForm path="consultant/grants" submitLabel="Add demo credits" extra={{ clientId: id }} numberFields={["credits"]} fields={[{ name: 'credits', label: 'Credits', defaultValue: '1' }, { name: 'reason', label: 'Reason', defaultValue: 'Demo top-up at the existing contract rate' }]} />
            <p className="mt-2 text-[13px] text-muted">A grant is a simulated entitlement at the existing contract rate, not a payment confirmation.</p>
          </Card>
          <Card title="Client"><KV rows={[['Contact', c.contactName], ['Consultant', c.consultant.name]]} /></Card>
        </div>
      </div>
    );
  } else if (tab === 'roles') {
    const rs = await rolesForClient(ctx, id);
    body = <div className="space-y-2"><LinkButton href={`/consultant/roles/new?client=${id}`}>Add role for this client</LinkButton>{rs.map((r) => <Link key={r.id} href={`/consultant/roles/${r.id}`} className="block rounded-xl border border-line bg-surface p-4 no-underline"><span className="font-semibold text-ink">{r.title}</span> <span className="text-muted">· {r.vacancyKey}</span> <Badge>{label(r.status)}</Badge></Link>)}</div>;
  } else if (tab === 'training') {
    body = <Card title="Onboarding and training">{c.onboarding ? <OnboardingForm clientId={id} o={{ introStatus: c.onboarding.introStatus, trainingStatus: c.onboarding.trainingStatus, trainingMode: c.onboarding.trainingMode, interviewTrainingDone: c.onboarding.interviewTrainingDone, processDesignDone: c.onboarding.processDesignDone, jobSpecsDone: c.onboarding.jobSpecsDone, assessmentTrainingDone: c.onboarding.assessmentTrainingDone, hiringBrief: c.onboarding.hiringBrief }} /> : <Empty>No onboarding record.</Empty>}</Card>;
  } else if (tab === 'work') {
    const logs = await ctx.tx.select().from(workLogs).where(eq(workLogs.clientId, id)).orderBy(desc(workLogs.workDate));
    body = (
      <div className="grid gap-4 lg:grid-cols-[1fr_340px]">
        <ResponsiveTable rowKey={(r) => r.id} rows={logs} empty="No work logged." columns={[{ label: 'Date', cell: (r) => date(r.workDate) }, { label: 'Category', cell: (r) => label(r.category) }, { label: 'Minutes', align: 'right', cell: (r) => r.minutes }, { label: 'Note', cell: (r) => r.note ?? '' }]} />
        <Card title="Log work"><SimpleForm path="consultant/work-logs" submitLabel="Save" extra={{ clientId: id }} numberFields={["minutes"]} fields={[{ name: 'category', label: 'Category', options: ['training', 'screening', 'support', 'shortlisting', 'search', 'offer', 'admin'].map((x) => [x, label(x)]), defaultValue: 'support' }, { name: 'minutes', label: 'Minutes', defaultValue: '30' }, { name: 'workDate', label: 'Date', type: 'date', defaultValue: '2026-11-06' }, { name: 'note', label: 'Note' }]} /><p className="mt-2 text-[13px] text-muted">Minutes and hours only. No hourly cost is assumed.</p></Card>
      </div>
    );
  }
  return (
    <>
      <PageHeader title={c.name} back={{ href: '/consultant/clients', label: 'Clients' }} />
      <Tabs current={tab === 'credits' ? 'credits' : tab} tabs={tabs} />
      {body}
    </>
  );
}
