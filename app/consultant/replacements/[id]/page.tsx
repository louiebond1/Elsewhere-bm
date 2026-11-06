import Link from 'next/link';
import { notFound } from 'next/navigation';
import { and, eq } from 'drizzle-orm';
import { pageViewer } from '@/server/page-auth';
import * as S from '@/server/db/schema';
import { PageHeader, Card, KV, Badge, Notice } from '@/components/ui';
import { ActionButton } from '@/components/client';
import { isUuid } from '@/server/lib/ids';
import { date, label, gbp } from '@/lib/format';
import { daysBetween } from '@/server/lib/dates';

export default async function Replacement({ params }: { params: Promise<{ id: string }> }) {
  const { ctx } = await pageViewer('consultant');
  const { id } = await params;
  if (!isUuid(id)) notFound();
  const [rc] = await ctx.tx.select().from(S.replacementCases).where(and(eq(S.replacementCases.id, id), eq(S.replacementCases.datasetId, ctx.datasetId)));
  if (!rc) notFound();
  const [h] = await ctx.tx.select().from(S.hires).where(eq(S.hires.id, rc.originalHireId));
  const [role] = await ctx.tx.select().from(S.roles).where(eq(S.roles.id, h.roleId));
  const [order] = await ctx.tx.select().from(S.hireOrders).where(eq(S.hireOrders.id, h.orderId));
  const days = daysBetween(h.startDate, rc.leftDate);
  return (
    <>
      <PageHeader title="Replacement request" back={{ href: '/consultant/home', label: 'Work queue' }} subtitle={<span className="flex gap-2">{role.title} · {role.vacancyKey} <Badge>{label(rc.status)}</Badge><Badge tone={rc.eligibility === 'eligible' ? 'success' : 'warning'}>{label(rc.eligibility)}</Badge></span>} />
      <div className="grid gap-6 lg:grid-cols-2">
        <Card title="Original hire"><KV rows={[['Start date', date(h.startDate)], ['Departure', date(rc.leftDate)], ['Days from start', `${days} (window is 90, inclusive)`], ['Original order', `${label(order.kind)} · ${label(order.status)} · ${gbp(order.totalPence)}`], ['Hire source', label(h.source)], ['Reason given', rc.reason]]} /></Card>
        <Card title="Decision">
          {rc.status === 'requested' && rc.eligibility === 'eligible' ? (
            <div className="flex flex-wrap gap-2">
              <ActionButton path={`replacements/${id}/approve`} label="Approve free replacement" redirect="/consultant/roles/{replacementRoleId}" confirm={{ title: 'Approve replacement', confirmLabel: 'Approve', body: <><p>This creates a linked replacement role ({role.vacancyKey}/REP1) at zero price, with its own 10 introductions and 5 screenings. It does not use an open-role slot and no deposit is charged.</p><p>A replacement hire cannot create another free replacement.</p></> }} />
              <ActionButton path={`replacements/${id}/decline`} label="Decline" variant="secondary" confirm={{ title: 'Decline replacement', body: <p>The client keeps the paid hire. No role is created and nothing is charged.</p> }} />
            </div>
          ) : rc.eligibility !== 'eligible' ? <Notice tone="warning">Not eligible for a free replacement ({label(rc.eligibility)}). This screen cannot approve it as free. A new paid role needs the client&apos;s explicit agreement through the normal role flow.</Notice>
          : rc.replacementRoleId ? <p className="text-[15px]">Approved. <Link href={`/consultant/roles/${rc.replacementRoleId}`}>Open the replacement role</Link>.</p> : <p>{label(rc.status)}</p>}
        </Card>
      </div>
    </>
  );
}
