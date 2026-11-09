import { pageViewer } from '@/server/page-auth';
import { AppShell, candidateAiBar } from '@/components/shell';
import { candidateSelf } from '@/server/services/candidates';
import { draftsWaiting, connectedAi } from '@/server/connectors/drafts';
import { onboardingToCheck } from '@/server/services/onboarding';

export const dynamic = 'force-dynamic';

export default async function CandidateLayout({ children }: { children: React.ReactNode }) {
  const { ctx, csrf } = await pageViewer('candidate');
  const self = await candidateSelf(ctx);
  const aiBar = candidateAiBar(await draftsWaiting(ctx), await connectedAi(ctx), await onboardingToCheck(ctx));
  const nav = [
    { href: '/candidate/home', label: 'Home', icon: 'home' },
    { href: '/candidate/onboarding', label: 'Mini-me', icon: 'checklist' },
    { href: '/candidate/profile', label: 'Profile', icon: 'profile' },
    { href: '/candidate/introductions', label: 'Requests', icon: 'intros' },
    { href: '/candidate/check-ins', label: 'Check-ins', icon: 'checkins' },
    { href: '/candidate/cv', label: 'CV', icon: 'cv' },
    { href: '/candidate/privacy', label: 'Privacy', icon: 'privacy' },
  ];
  return <AppShell nav={nav} base="/candidate" csrf={csrf} who={`${self.identity?.fullName ?? ''} · ${self.candidate.publicRef}`} brandSub="Elsewhere" aiBar={aiBar}>{children}</AppShell>;
}
