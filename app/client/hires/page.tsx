import Link from 'next/link';
import { pageViewer } from '@/server/page-auth';
import { hiresForClient } from '@/server/views/client';
import { PageHeader, Card, Badge, Empty, LinkButton } from '@/components/ui';
import { DepartureButton, ReplacementButton } from '@/components/hire-actions';
import { creditsLabel, gbp, date, label } from '@/lib/format';
import { withinReplacementWindow } from '@/server/lib/dates';

export default async function Hires() {
  const { viewer, ctx } = await pageViewer('client');
  const rows = await hiresForClient(ctx, viewer.actor.clientId!);
  return (
    <>
      <PageHeader title="Hires" subtitle="Each hire has one price. Payments already made are deducted from it." />
      {rows.length === 0 ? <Empty>No hires recorded yet.</Empty> : (
        <div className="space-y-3">
          {rows.map((h) => {
            const inWindow = h.leftDate ? withinReplacementWindow(h.start, h.leftDate, 90) : null;
            return (
              <Card key={h.id} title={<span>{h.label} <span className="text-[14px] font-normal text-muted">· {h.role}</span></span>} action={<span className="flex gap-1">{h.orderKind === 'additional' && <Badge tone="warning">New hire, new full price</Badge>}{h.source === 'replacement' && <Badge tone="success">Replacement</Badge>}{h.source === 'outside_system' && <Badge>Outside-system hire</Badge>}<Badge tone={h.status === 'left' ? 'warning' : 'success'}>{label(h.status)}</Badge></span>}>
                <p className="text-[15px]">Offer accepted {date(h.offer)} · Start {date(h.start)}{h.leftDate ? ` · Left ${date(h.leftDate)}` : ''}</p>
                <p className="text-[15px]">Charged price: {h.source === 'replacement' ? 'Covered by replacement, £0' : `${creditsLabel(h.totalUnits)} / ${gbp(h.totalPence)}`}</p>
                <p className="mt-1 text-[14px] text-muted">{h.source === 'replacement' ? 'The free replacement entitlement has been used for this hire.' : h.leftDate ? (inWindow ? 'Left within the 90-day replacement window.' : 'Left outside the 90-day replacement window.') : `Replacement window: 90 calendar days from ${date(h.start)}, inclusive.`}</p>
                {h.replacement && <p className="mt-2 text-[15px]">Replacement request: {label(h.replacement.status)} ({label(h.replacement.eligibility)}){h.replacement.roleId && <> · <Link href={`/client/roles/${h.replacement.roleId}`}>Open replacement role</Link></>}</p>}
                <div className="mt-3 flex flex-wrap gap-2">
                  {h.status !== 'left' && <DepartureButton hireId={h.id} />}
                  {h.status === 'left' && !h.replacement && <ReplacementButton hireId={h.id} />}
                  <LinkButton href={`/client/roles/${h.roleId}`} variant="ghost">Open role</LinkButton>
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </>
  );
}
