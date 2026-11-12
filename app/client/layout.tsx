import Link from 'next/link';
import { pageViewer } from '@/server/page-auth';
import { AppShell } from '@/components/shell';
import { clientSummary, walletView } from '@/server/views/client';
import { creditsLabel } from '@/lib/format';

export const dynamic = 'force-dynamic';

export default async function ClientLayout({ children }: { children: React.ReactNode }) {
  const { viewer, ctx, csrf } = await pageViewer('client');
  const id = viewer.actor.clientId!;
  const [c, w] = await Promise.all([clientSummary(ctx, id), walletView(ctx, id)]);
  const nav = [
    { href: '/client/home', label: 'Home', icon: 'home' },
    { href: '/client/roles', label: 'Hiring', icon: 'roles' },
    { href: '/client/credits', label: 'Credits', icon: 'credits' },
    { href: '/client/settings', label: 'Settings', icon: 'checklist' },
    { href: '/client/support', label: 'Help', icon: 'support' },
  ];
  const pill = <Link href="/client/credits" className="inline-flex h-11 items-center whitespace-nowrap rounded-full bg-[#DDE5C9] px-4 text-[15px] font-semibold text-ink no-underline sm:px-5 sm:text-[16px]">{creditsLabel(w.spendable)}</Link>;
  return <AppShell nav={nav} base="/client" csrf={csrf} who={`${viewer.displayName} · ${c.name}`} brandSub="Elsewhere" pill={pill}>{children}</AppShell>;
}
