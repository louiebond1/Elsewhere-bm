import Link from 'next/link';
import { pageViewer } from '@/server/page-auth';
import { clientsList, outsideHireOptions } from '@/server/views/consultant';
import { PageHeader, Card, Empty, Badge, Notice } from '@/components/ui';
import { RecordHire } from '@/components/role-actions';
import { date, label } from '@/lib/format';
import { addMonths, londonDateOf } from '@/server/lib/dates';

export default async function OutsideHires({ searchParams }: { searchParams: Promise<{ client?: string }> }) {
  const { ctx } = await pageViewer('consultant');
  const clientId = (await searchParams).client ?? null;
  const clients = await clientsList(ctx);
  const opts = await outsideHireOptions(ctx, clientId);
  return (
    <>
      <PageHeader title="Outside-system hires" subtitle="Recover the remaining quoted price when a client hires an introduced candidate outside the app. No penalty is added." />
      <form className="mb-4 flex flex-wrap gap-2"><select name="client" defaultValue={clientId ?? ''} className="h-11 rounded-lg border border-line bg-surface px-3" aria-label="Client"><option value="">Choose a client</option>{clients.map((c) => <option key={c.c.id} value={c.c.id}>{c.name}</option>)}</select><button className="h-11 rounded-lg border border-line bg-surface px-4">Show accepted introductions</button></form>
      <Notice>The window is 12 calendar months from the accepted introduction to the offer acceptance date, inclusive. A later discovery date does not extend it. Outside the window, a different salary, no accepted introduction or a disputed relationship needs manual review outside this prototype.</Notice>
      <div className="mt-4 space-y-3">
        {!clientId ? <Empty>Choose a client to see its accepted introductions.</Empty> : opts.length === 0 ? <Empty>No accepted introductions for this client.</Empty> : opts.map((o) => {
          const acc = londonDateOf(new Date(o.acceptedAt));
          return (
            <Card key={o.introId} title={`${o.name} · ${o.role}`} action={<span className="flex gap-1"><Badge>{label(o.state)}</Badge>{o.hired && <Badge tone="success">Hire recorded</Badge>}</span>}>
              <p className="text-[15px]">Accepted {date(acc)} · Window ends {date(addMonths(acc, 12))}</p>
              {o.hired ? <p className="mt-2 text-[15px]">Hire recorded{o.hireStart ? ` with start date ${date(o.hireStart)}` : ''}. Nothing more is due on this introduction. <Link href={`/consultant/clients/${clientId}?tab=credits`}>View the client ledger</Link></p> : o.deleted ? <p className="mt-2 text-[14px] text-warning">Profile deleted. Needs manual review outside the prototype.</p> : <div className="mt-3"><RecordHire introId={o.introId} label={o.name} outside clientId={clientId} defaultOffer="2026-10-15" defaultStart="2026-11-01" /></div>}
            </Card>
          );
        })}
      </div>
    </>
  );
}
