import Link from 'next/link';
import { pageViewer } from '@/server/page-auth';
import { creditsView } from '@/server/views/client';
import { PageHeader, Stat, Card, KV, ResponsiveTable, Badge } from '@/components/ui';
import { ActionButton } from '@/components/client';
import { creditsLabel, gbp, date, label, credits } from '@/lib/format';

export default async function Credits({ searchParams }: { searchParams: Promise<{ type?: string; role?: string }> }) {
  const { viewer, ctx } = await pageViewer('client');
  const sp = await searchParams;
  const v = await creditsView(ctx, viewer.actor.clientId!, { type: sp.type, roleId: sp.role });
  const current = v.contracts.find((c) => c.status === 'active');
  return (
    <>
      <PageHeader title="Credits" subtitle="Simulated demo entitlements. No real payments are taken." actions={<ActionButton path="notifications/request-credits" label="Request credits" variant="secondary" successText="Your consultant has been notified." />} />
      <div className="grid gap-3 sm:grid-cols-3">
        <Stat label="Balance" value={creditsLabel(v.wallet.posted)} />
        <Stat label="Reserved for pending introductions" value={creditsLabel(v.wallet.held)} hint="Reserved, not charged" />
        <Stat label="Spendable" value={creditsLabel(v.wallet.spendable)} />
      </div>
      <div className="mt-6 grid gap-6 lg:grid-cols-[1fr_340px]">
        <section>
          <h2 className="mb-3 text-[20px]">Ledger</h2>
          <form className="mb-3 flex flex-wrap gap-2">
            <select name="type" defaultValue={sp.type ?? ''} className="h-11 rounded-lg border border-line bg-surface px-2" aria-label="Transaction type"><option value="">All types</option>{['grant', 'deposit_debit', 'hire_balance_debit', 'second_hire_debit', 'outside_hire_debit', 'reversal'].map((t) => <option key={t} value={t}>{label(t)}</option>)}</select>
            <select name="role" defaultValue={sp.role ?? ''} className="h-11 rounded-lg border border-line bg-surface px-2" aria-label="Role"><option value="">All roles</option>{v.roles.map((r) => <option key={r.id} value={r.id}>{r.title} ({r.key})</option>)}</select>
            <button className="h-11 rounded-lg border border-line bg-surface px-4">Filter</button>
          </form>
          <ResponsiveTable rowKey={(r) => r.id} rows={v.ledger} empty="No credits have been added or used." columns={[
            { label: 'Date', cell: (r) => date(r.at) },
            { label: 'Entry', cell: (r) => <Link href={`/client/credits/${r.id}`}>{label(r.type)}</Link> },
            { label: 'Role', cell: (r) => r.role ?? '' },
            { label: 'Credits', align: 'right', cell: (r) => <span className={r.units.startsWith('-') ? '' : 'text-success'}>{credits(r.units)}</span> },
            { label: 'GBP equivalent', align: 'right', cell: (r) => gbp(r.pence) },
            { label: 'Balance after', align: 'right', cell: (r) => credits(r.balanceAfter) },
          ]} />
        </section>
        <aside className="space-y-4">
          {current ? (
            <Card title="Contract">
              <KV rows={[['Plan', `${label(current.planType)}${current.label ? ` · ${current.label}` : ''}`], ['Term', `${date(current.startDate)} to ${date(current.endDate)}`], ['Credit price', current.rate ? gbp(current.rate) : 'Not set'], ['Included open roles', current.roles], ['Committed credits', credits(current.committed)], ['Rollover', current.rollover], ['Exclusivity', current.exclusivity]]} />
              {current.schedule && current.schedule.instalments.length > 1 && (
                <details className="mt-3"><summary className="cursor-pointer text-[14px] text-link">Indicative instalment schedule</summary><ul className="mt-2 text-[14px]">{current.schedule.instalments.map((i) => <li key={i.index} className="flex justify-between py-0.5"><span>{date(i.date)}</span><span>{gbp(i.pence)}</span></li>)}</ul><p className="mt-1 text-[13px] text-muted">Recorded as a schedule only. No payment is collected.</p></details>
              )}
              <p className="mt-2 text-[13px] text-muted">VAT treatment to be agreed.</p>
            </Card>
          ) : <Card title="Contract"><p>No active contract.</p></Card>}
          {v.contracts.filter((c) => c.status !== 'active').map((c) => <Card key={c.id} title={c.label ?? 'Contract'} action={<Badge>{label(c.status)}</Badge>}><p className="text-[14px]">{date(c.startDate)} to {date(c.endDate)} · {c.rate ? gbp(c.rate) : ''} per credit</p></Card>)}
        </aside>
      </div>
    </>
  );
}
