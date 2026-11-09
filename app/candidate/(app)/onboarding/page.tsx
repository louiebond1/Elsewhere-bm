import { pageViewer } from '@/server/page-auth';
import { onboardingView } from '@/server/services/onboarding';
import { connectedAi } from '@/server/connectors/drafts';
import { issuer } from '@/server/connectors/oauth';
import { PageHeader } from '@/components/ui';
import { ChecklistAi, ChecklistSections, ApproveAll, Extras } from '@/components/onboarding-doc';

export const dynamic = 'force-dynamic';

/** "Your profile document": every onboarding answer in one place, to check and approve. */
export default async function Onboarding({ searchParams }: { searchParams: Promise<{ ai?: string }> }) {
  const { ctx } = await pageViewer('candidate');
  const [v, connected, sp] = await Promise.all([onboardingView(ctx), connectedAi(ctx), searchParams]);
  return (
    <div className="mx-auto max-w-[820px]">
      <PageHeader title="" back={{ href: '/candidate/home', label: 'Home' }} />
      <h1>Your mini-me</h1>
      <p className="mt-3 text-[17px] text-muted">The more it knows about you, the better it speaks up for you with employers. Your name stays hidden until you say yes.</p>
      <div className="mt-6 flex flex-wrap items-end gap-x-10 gap-y-3">
        <p><span className="tnum block font-display text-[44px] font-semibold leading-none tracking-tight">{Math.round((v.answered / v.total) * 100)}%</span><span className="text-[15px] text-muted">how well it knows you</span></p>
        <p><span className="tnum block font-display text-[44px] font-semibold leading-none tracking-tight">{v.approved}</span><span className="text-[15px] text-muted">answers you’ve checked</span></p>
      </div>
      <div className="mt-4 h-2 overflow-hidden rounded-full bg-line" aria-hidden><div className="h-full rounded-full bg-primary" style={{ width: `${Math.round((v.approved / v.total) * 100)}%` }} /></div>
      <div className="mt-8"><ChecklistAi connected={connected} connectorUrl={`${issuer()}/mcp`} autoOpen={sp.ai === '1'} waiting={v.answered < v.total || v.toCheck > 0} /></div>
      {v.toCheck > 0 && (
        <div className="mt-8 flex flex-col gap-3 rounded-3xl bg-warning-tint p-5 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-[17px]"><span className="font-semibold">Your AI wrote {v.toCheck} answer{v.toCheck > 1 ? 's' : ''}.</span> Give {v.toCheck > 1 ? 'them' : 'it'} a once-over and tweak anything that’s not quite you.</p>
          <ApproveAll count={v.toCheck} />
        </div>
      )}
      <div className="mt-8"><ChecklistSections sections={v.sections} /></div>
      <div className="mt-5"><Extras extras={v.extras} /></div>
    </div>
  );
}
