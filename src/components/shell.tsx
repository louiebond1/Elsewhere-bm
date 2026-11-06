import type { ReactNode } from 'react';
import { CsrfProvider } from './client';
import { NotificationBell, SignOut, SwitchPersona, NavLinks, MobileNav, type NavItem } from './shell-client';
import { providerLabel } from '../server/ai';

export function Brand({ sub }: { sub?: string }) {
  return (
    <div>
      <div className="text-[18px] font-bold tracking-tight text-primary">BondMoran</div>
      <div className="text-[13px] text-muted">{sub ?? 'Hiring partnership'}</div>
    </div>
  );
}

export function DemoStrip({ who }: { who?: string | null }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 bg-primary px-4 py-1.5 text-[13px] text-white">
      <span>Demo using fictional data · {providerLabel()}{who ? ` · Signed in as ${who}` : ''}</span>
      <SwitchPersona />
    </div>
  );
}

export function AppShell({ children, nav, base, csrf, who, brandSub }: { children: ReactNode; nav: NavItem[]; base: string; csrf: string; who: string; brandSub?: string }) {
  return (
    <CsrfProvider token={csrf}>
      <DemoStrip who={who} />
      <div className="md:flex">
        <aside className="hidden w-56 shrink-0 border-r border-line bg-surface p-4 md:block md:min-h-[calc(100vh-32px)]">
          <div className="mb-6"><Brand sub={brandSub} /></div>
          <nav aria-label="Main"><NavLinks items={nav} /></nav>
        </aside>
        <div className="min-w-0 flex-1">
          <header className="flex h-16 items-center justify-between border-b border-line bg-surface px-4 md:px-8">
            <div className="md:hidden"><Brand sub={brandSub} /></div>
            <div className="hidden text-[15px] text-muted md:block">{who}</div>
            <div className="flex items-center gap-1"><NotificationBell base={base} /><SignOut /></div>
          </header>
          <main className="mx-auto max-w-[1240px] px-4 pb-24 pt-6 md:px-8 md:pb-12">{children}</main>
          <footer className="px-4 pb-24 text-center text-[12px] text-muted md:pb-6">Powered by Elsewhere</footer>
        </div>
      </div>
      <MobileNav items={nav} />
    </CsrfProvider>
  );
}
