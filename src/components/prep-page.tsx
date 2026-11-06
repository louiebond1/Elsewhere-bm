import { notFound } from 'next/navigation';
import type { Ctx } from '../server/services/context';
import { prepFor } from '../server/services/prep';
import { PageHeader, Card, Badge } from './ui';
import { isUuid } from '../server/lib/ids';

export async function PrepPage({ ctx, introId, back, editor }: { ctx: Ctx; introId: string; back: { href: string; label: string }; editor?: React.ReactNode }) {
  if (!isUuid(introId)) notFound();
  const p = await prepFor(ctx, introId).catch(() => null);
  if (!p) notFound();
  return (
    <>
      <PageHeader title={`Interview preparation: ${p.roleTitle}`} back={back} subtitle={<Badge tone="success">Included in your service</Badge>} />
      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="Questions to discuss"><ol className="list-decimal space-y-2 pl-5 text-[15px]">{p.questions.map((q) => <li key={q}>{q}</li>)}</ol></Card>
        <Card title="Discussion points from approved evidence">{p.discussionPoints.length ? <ul className="space-y-2 text-[15px]">{p.discussionPoints.map((d) => <li key={d.text} className="border-l-4 border-line pl-3">{d.text}</li>)}</ul> : <p className="text-[15px] text-muted">No approved evidence linked yet.</p>}</Card>
      </div>
      <p className="mt-4 text-[13px] text-muted">The candidate and employer see the same preparation. It contains approved, anonymity-reviewed evidence only.</p>
      {editor}
    </>
  );
}
