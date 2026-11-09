import { pageViewer } from '@/server/page-auth';
import { onboardingView } from '@/server/services/onboarding';
import { connectedAi } from '@/server/connectors/drafts';
import { issuer } from '@/server/connectors/oauth';
import { PageHeader } from '@/components/ui';
import { ChecklistAi, ChecklistSections, ApproveAll } from '@/components/onboarding-doc';

export const dynamic = 'force-dynamic';

/** "Your profile document": every onboarding answer in one place, to check and approve. */
export default async function Onboarding({ searchParams }: { searchParams: Promise<{ ai?: string }> }) {
  const { ctx } = await pageViewer('candidate');
  const [v, connected, sp] = await Promise.all([onboardingView(ctx), connectedAi(ctx), searchParams]);
  return (
    <div className="mx-auto max-w-[820px]">
      <PageHeader title="" back={{ href: '/candidate/home', label: 'Home' }} />
      <h1>Your profile document</h1>
      <p className="mt-3 text-[17px] text-muted">Everything employers will learn about you, in your own words. Your name stays hidden until you accept an introduction.</p>
      <div className="mt-6 flex flex-wrap items-end gap-x-10 gap-y-3">
        <p><span className="tnum block font-display text-[44px] font-semibold leading-none tracking-tight">{v.answered}<span className="text-muted">/{v.total}</span></span><span className="text-[15px] text-muted">answered</span></p>
        <p><span className="tnum block font-display text-[44px] font-semibold leading-none tracking-tight">{v.approved}</span><span className="text-[15px] text-muted">checked by you</span></p>
      </div>
      <div className="mt-4 h-2 overflow-hidden rounded-full bg-line" aria-hidden><div className="h-full rounded-full bg-primary" style={{ width: `${Math.round((v.approved / v.total) * 100)}%` }} /></div>
      <div className="mt-8"><ChecklistAi connected={connected} connectorUrl={`${issuer()}/mcp`} autoOpen={sp.ai === '1'} waiting={v.answered < v.total || v.toCheck > 0} /></div>
      {v.toCheck > 0 && (
        <div className="mt-8 flex flex-col gap-3 rounded-3xl bg-warning-tint p-5 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-[17px]"><span className="font-semibold">{v.toCheck} answer{v.toCheck > 1 ? 's' : ''} from your AI to check.</span> Read them below, change anything that isn’t right.</p>
          <ApproveAll count={v.toCheck} />
        </div>
      )}
      <div className="mt-8"><ChecklistSections sections={v.sections} /></div>
    </div>
  );
}
