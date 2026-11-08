import { pageViewer } from '@/server/page-auth';
import { creditsView } from '@/server/views/client';
import { businessDate, contractCurrentlyActive } from '@/server/services/contracts';
import { PageHeader, Card, Notice, LinkButton } from '@/components/ui';
import { BuyCreditsForm, DemoOnlyBanner } from '@/components/checkout';
import { prototype } from '@/config/prototype';
import { date } from '@/lib/format';

export default async function BuyCredits({ searchParams }: { searchParams: Promise<{ credits?: string }> }) {
  const { viewer, ctx } = await pageViewer('client');
  const sp = await searchParams;
  const v = await creditsView(ctx, viewer.actor.clientId!, {});
  const today = businessDate(ctx);
  const c = v.contract;
  const usable = !!c && contractCurrentlyActive(c, today) && !!c.creditRatePence;
  const n = Number(sp.credits);
  const initial = Number.isInteger(n) && n >= 1 && n <= prototype.maxSimulatedPurchaseCredits ? n : 1;
  return (
    <>
      <PageHeader title="Buy credits (demo)" back={{ href: '/client/credits', label: 'Credits' }} subtitle="Simulated checkout. No money is charged." />
      <DemoOnlyBanner />
      <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
        <Card>
          {usable
            ? <BuyCreditsForm ratePence={c!.creditRatePence!} postedUnits={v.wallet.posted} heldUnits={v.wallet.held} spendableUnits={v.wallet.spendable} max={prototype.maxSimulatedPurchaseCredits} initialCredits={initial} />
            : <><Notice tone="warning">{c && c.status === 'active' && c.startDate > today ? `Your contract starts on ${date(c.startDate)}. Credits can be bought once it is in effect.` : 'You need an active contract in effect before buying credits. Ask your consultant.'}</Notice><div className="mt-3"><LinkButton href="/client/credits" variant="secondary">Back to credits</LinkButton></div></>}
        </Card>
        <Card title="How credits are used">
          <ul className="list-disc space-y-1 pl-5 text-[14px]">
            <li>Requesting an introduction <strong>reserves</strong> the role deposit (25% of the standard salary credits, once per role). Reserved credits are not charged.</li>
            <li>The deposit is <strong>charged</strong> only when the candidate accepts the first introduction for the role.</li>
            <li>The remaining balance is charged when you record a hire.</li>
            <li>Buying credits only adds to your spendable balance. It never charges for an introduction or a hire.</li>
          </ul>
        </Card>
      </div>
    </>
  );
}
