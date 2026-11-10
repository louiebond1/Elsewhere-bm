import { pageViewer } from '@/server/page-auth';
import { AppShell } from '@/components/shell';
import { candidateSelf } from '@/server/services/candidates';
import { draftsWaiting } from '@/server/connectors/drafts';
import { onboardingToCheck } from '@/server/services/onboarding';
import { candidateOverview } from '@/server/views/candidate';

export const dynamic = 'force-dynamic';

export default async function CandidateLayout({ children }: { children: React.ReactNode }) {
  const { ctx, csrf } = await pageViewer('candidate');
  const self = await candidateSelf(ctx);
  // Anything their AI wrote that they haven't checked yet shows as a count on Mini-me.
  const toCheck = (await draftsWaiting(ctx)) + (await onboardingToCheck(ctx));
  const nav = [
    { href: '/candidate/home', label: 'Home', icon: 'home' },
    { href: '/candidate/onboarding', label: 'Mini-me', icon: 'checklist', count: toCheck },
    { href: '/candidate/profile', label: 'Profile', icon: 'profile' },
    { href: '/candidate/interviews', label: 'Interviews', icon: 'checkins' },
    { href: '/candidate/introductions', label: 'Requests', icon: 'intros', count: (await candidateOverview(ctx)).pendingIntros },
    { href: '/candidate/check-ins', label: 'Check-ins', icon: 'checkins' },
    { href: '/candidate/cv', label: 'CV', icon: 'cv' },
    { href: '/candidate/privacy', label: 'Privacy', icon: 'privacy' },
  ];
  return <AppShell nav={nav} base="/candidate" csrf={csrf} who={`${self.identity?.fullName ?? ''} · ${self.candidate.publicRef}`} brandSub="Elsewhere" person={self.identity?.fullName ?? ''}>{children}</AppShell>;
}
