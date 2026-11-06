import Link from 'next/link';
import { pageViewer } from '@/server/page-auth';
import { workQueue } from '@/server/views/consultant';
import { PageHeader, Stat, Card, Empty } from '@/components/ui';
import { creditsLabel, date, label } from '@/lib/format';

export default async function ConsultantHome() {
  const { ctx } = await pageViewer('consultant');
  const q = await workQueue(ctx);
  const section = (title: string, items: React.ReactNode[], empty: string) => <Card title={`${title} (${items.length})`}>{items.length ? <ul className="divide-y divide-line">{items}</ul> : <p className="text-[15px] text-muted">{empty}</p>}</Card>;
  return (
    <>
      <PageHeader title="Work queue" subtitle="Everything waiting for BondMoran across all clients." />
      <div className="grid gap-3 sm:grid-cols-3">
        <Stat label="Work logged" value={`${(q.minutes / 60).toFixed(1)} h`} hint={`${q.minutes} minutes, including roles that do not hire`} />
        <Stat label="Active roles" value={q.activeRoles} />
        <Stat label="Demo credits consumed" value={creditsLabel(q.consumedUnits)} hint="Simulated entitlements. Not accounting revenue." />
      </div>
      <div className="mt-6 grid gap-4 lg:grid-cols-2">
        {section('Screening requests', q.scr.map((s) => <li key={s.s.id} className="py-2 text-[15px]"><Link href={`/consultant/screenings/${s.s.id}`}>{s.name ?? 'Candidate'} · {s.title}</Link> <span className="text-muted">· {label(s.s.status)}</span></li>), 'No screenings waiting.')}
        {section('Anonymity review', q.review.map((r) => <li key={r.e.id} className="py-2 text-[15px]"><Link href={`/consultant/candidates/${r.e.candidateId}`}>{r.name} · {r.ref}</Link> <span className="text-muted">· {r.e.safeClaim?.slice(0, 60)}</span></li>), 'No evidence waiting for review.')}
        {section('Employer to confirm', q.unresolved.map((u) => <li key={u.id} className="py-2 text-[15px]"><Link href={`/consultant/candidates/${u.id}`}>{u.name} · {u.ref}</Link> <span className="text-muted">typed &ldquo;{u.label}&rdquo;</span></li>), 'No unresolved employers.')}
        {section('Contract setup', q.drafts.map((d) => <li key={d.id} className="py-2 text-[15px]"><Link href={`/consultant/clients/${d.clientId}/contract`}>{d.name}: draft contract</Link></li>), 'No draft contracts.')}
        {section('Introductions expiring soon', q.expiring.map((e) => <li key={e.i.id} className="py-2 text-[15px]">{e.title} · expires {date(e.i.expiresAt)}</li>), 'No requests expiring in the next two days.')}
        {section('Replacement requests', q.repl.map((r) => <li key={r.id} className="py-2 text-[15px]"><Link href={`/consultant/replacements/${r.id}`}>Replacement request · {label(r.eligibility)}</Link></li>), 'No replacement requests.')}
        {section('Failed jobs', q.failed.map((j) => <li key={j.id} className="py-2 text-[15px]"><Link href="/consultant/operations">{label(j.kind)} · {j.errorCode}</Link></li>), 'No failed jobs.')}
      </div>
      {false && <Empty>.</Empty>}
    </>
  );
}
