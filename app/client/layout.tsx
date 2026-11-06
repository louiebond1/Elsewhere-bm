import { pageViewer } from '@/server/page-auth';
import { AppShell } from '@/components/shell';
import { clientSummary } from '@/server/views/client';

export const dynamic = 'force-dynamic';

export default async function ClientLayout({ children }: { children: React.ReactNode }) {
  const { viewer, ctx, csrf } = await pageViewer('client');
  const c = await clientSummary(ctx, viewer.actor.clientId!);
  const nav = [
    { href: '/client/home', label: 'Home', icon: 'home' },
    { href: '/client/roles', label: 'Roles', icon: 'roles' },
    { href: '/client/credits', label: 'Credits', icon: 'credits' },
    { href: '/client/hires', label: 'Hires', icon: 'hires' },
    { href: '/client/onboarding', label: 'Training', icon: 'training' },
    { href: '/client/support', label: 'Support', icon: 'support' },
  ];
  return <AppShell nav={nav} base="/client" csrf={csrf} who={`${viewer.displayName} · ${c.name}`}>{children}</AppShell>;
}
