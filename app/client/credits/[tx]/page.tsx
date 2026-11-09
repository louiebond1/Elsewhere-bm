import { notFound } from 'next/navigation';
import { pageViewer } from '@/server/page-auth';
import { receipt } from '@/server/views/client';
import { PageHeader, Card, KV } from '@/components/ui';
import { credits, gbp, date, label, txLabel } from '@/lib/format';
import { isUuid } from '@/server/lib/ids';

export default async function Receipt({ params }: { params: Promise<{ tx: string }> }) {
  const { viewer, ctx } = await pageViewer('client');
  const { tx } = await params;
  if (!isUuid(tx)) notFound();
  const r = await receipt(ctx, viewer.actor.clientId!, tx).catch(() => null);
  if (!r) notFound();
  return (
    <>
      <PageHeader title="Receipt" back={{ href: '/client/credits', label: 'Credits' }} subtitle="A permanent record. If something was wrong, a separate correction is added instead of changing this." />
      <Card>
        <KV rows={[['What', txLabel(r.t.type)], ['Date', date(r.t.businessEventAt)], ['Operation', r.t.operationId.slice(0, 8)], ['Credits', credits(r.t.deltaUnits)], ['GBP equivalent', gbp(r.t.deltaPence)], ['Rate', `${gbp(r.t.valuationRatePence)} per credit`], ['Balance after', credits(r.t.balanceAfterUnits)], ['Reason', r.t.reason]]} />
        {r.order && <div className="mt-4 border-t border-line pt-3"><h3 className="mb-2 text-[16px]">Order {r.order.orderNumber} ({label(r.order.kind)})</h3><KV rows={[['Service', label(r.order.serviceMode)], ['Total', `${credits(r.order.totalUnits)} credits / ${gbp(r.order.totalPence)}`], ['Previous payments', r.previous.length ? r.previous.map((p) => `${label(p.type)} ${gbp(p.deltaPence)}`).join(', ') : 'None']]} /></div>}
      </Card>
    </>
  );
}
