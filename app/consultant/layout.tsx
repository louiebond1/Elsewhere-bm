import { pageViewer } from '@/server/page-auth';
import { AppShell } from '@/components/shell';

export const dynamic = 'force-dynamic';

export default async function ConsultantLayout({ children }: { children: React.ReactNode }) {
  const { viewer, csrf } = await pageViewer('consultant');
  const nav = [
    { href: '/consultant/home', label: 'Work queue', icon: 'home' },
    { href: '/consultant/clients', label: 'Clients', icon: 'clients' },
    { href: '/consultant/candidates', label: 'Candidates', icon: 'candidates' },
    { href: '/consultant/hires/outside', label: 'Outside hires', icon: 'hires' },
    { href: '/consultant/operations', label: 'Operations', icon: 'ops' },
    { href: '/consultant/demo', label: 'Demo controls', icon: 'demo' },
  ];
  return <AppShell nav={nav} base="/consultant" csrf={csrf} who={`${viewer.displayName} · BondMoran consultant`}>{children}</AppShell>;
}
