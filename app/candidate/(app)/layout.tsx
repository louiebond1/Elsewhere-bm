import { pageViewer } from '@/server/page-auth';
import { AppShell } from '@/components/shell';
import { candidateSelf } from '@/server/services/candidates';

export const dynamic = 'force-dynamic';

export default async function CandidateLayout({ children }: { children: React.ReactNode }) {
  const { ctx, csrf } = await pageViewer('candidate');
  const self = await candidateSelf(ctx);
  const nav = [
    { href: '/candidate/home', label: 'Home', icon: 'home' },
    { href: '/candidate/profile', label: 'Profile', icon: 'profile' },
    { href: '/candidate/introductions', label: 'Requests', icon: 'intros' },
    { href: '/candidate/check-ins', label: 'Check-ins', icon: 'checkins' },
    { href: '/candidate/cv', label: 'CV', icon: 'cv' },
    { href: '/candidate/privacy', label: 'Privacy', icon: 'privacy' },
  ];
  return <AppShell nav={nav} base="/candidate" csrf={csrf} who={`${self.identity?.fullName ?? ''} · ${self.candidate.publicRef}`} brandSub="Your Elsewhere profile">{children}</AppShell>;
}
