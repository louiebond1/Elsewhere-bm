import Link from 'next/link';
import { notFound } from 'next/navigation';
import { pageViewer } from '@/server/page-auth';
import { checkoutView } from '@/server/services/checkout';
import { PageHeader, Card, KV, Notice, LinkButton, Badge } from '@/components/ui';
import { CheckoutOutcomes, DemoOnlyBanner } from '@/components/checkout';
import { credits, gbp, date } from '@/lib/format';

export default async function Checkout({ params }: { params: Promise<{ id: string }> }) {
  const { viewer, ctx } = await pageViewer('client');
  const { id } = await params;
  const v = await checkoutView(ctx, viewer.actor.clientId!, id).catch(() => null);
  if (!v) notFound();
  const c = v.checkout;
  const wholeCredits = BigInt(c.units) / 10000n;
  const tone = c.status === 'succeeded' ? 'success' : c.status === 'declined' ? 'warning' : 'neutral';
  return (
    <>
      <PageHeader title="Demo checkout" back={{ href: '/client/credits', label: 'Credits' }} subtitle="Simulated checkout. No money is charged." />
      <DemoOnlyBanner />
      <Card title="Simulated purchase" action={<Badge tone={tone}>{c.status === 'open' ? 'Awaiting a demo outcome' : c.status === 'succeeded' ? 'Simulated success' : c.status === 'declined' ? 'Simulated decline' : 'Cancelled'}</Badge>}>
        <KV rows={[
          ['Action', `Buy ${credits(c.units)} credits`],
          ['Price per credit', gbp(c.ratePence)],
          ['Total shown', `${gbp(c.totalPence)} (demo only, not charged)`],
          ['Balance now', credits(v.balances.posted)],
          ['Reserved for pending introductions', credits(v.balances.held)],
          ['Spendable now', credits(v.balances.spendable)],
          ['Opened', date(c.createdAt)],
        ]} />
        <div className="mt-4">
          {c.status === 'open' && <><p className="mb-3 text-[14px]">Choose a demo outcome. Simulate success adds the credits once. Simulate decline or Cancel adds nothing and changes no balance.</p><CheckoutOutcomes id={c.id} /></>}
          {c.status === 'succeeded' && <Notice tone="success">Simulated success. {credits(c.units)} credits were added to your balance once. No money was charged. {c.transactionId && <Link href={`/client/credits/${c.transactionId}`}>View the ledger entry</Link>}</Notice>}
          {c.status === 'declined' && <Notice tone="warning">Simulated decline. Nothing was added or charged and your balance is unchanged.</Notice>}
          {c.status === 'cancelled' && <Notice>Checkout cancelled. Nothing was added or charged and your balance is unchanged.</Notice>}
          {(c.status === 'declined' || c.status === 'cancelled') && <div className="mt-3"><LinkButton href={`/client/credits/buy?credits=${wholeCredits.toString()}`}>Try again</LinkButton></div>}
          {c.status === 'succeeded' && <div className="mt-3"><LinkButton href="/client/credits" variant="secondary">Back to credits</LinkButton></div>}
        </div>
      </Card>
    </>
  );
}
