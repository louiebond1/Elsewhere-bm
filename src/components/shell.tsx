import type { ReactNode } from 'react';
import { CsrfProvider } from './client';
import { NotificationBell, SignOut, SwitchPersona, NavLinks, MobileNav, type NavItem } from './shell-client';
import { providerLabel } from '../server/ai';

export function Brand({ sub, dark }: { sub?: string; dark?: boolean }) {
  return (
    <div>
      <div className={dark ? 'text-[30px] font-bold leading-tight tracking-tight text-white' : 'text-[18px] font-bold tracking-tight text-primary'}>BondMoran</div>
      <div className={dark ? 'text-[16px] text-white/80' : 'text-[13px] text-muted'}>{sub ?? 'Hiring partnership'}</div>
    </div>
  );
}

export function DemoStrip({ who }: { who?: string | null }) {
  return (
    <div className="relative flex flex-wrap items-center justify-center gap-x-4 gap-y-1 bg-banner px-4 py-2 text-[13px] text-white md:text-[14px]">
      <span>Demo using fictional data · {providerLabel()}</span>
      <span className="md:absolute md:right-4"><SwitchPersona /></span>
      {who ? <span className="sr-only">Signed in as {who}</span> : null}
    </div>
  );
}

export function AppShell({ children, nav, base, csrf, who, brandSub }: { children: ReactNode; nav: NavItem[]; base: string; csrf: string; who: string; brandSub?: string }) {
  return (
    <CsrfProvider token={csrf}>
      <div className="md:flex">
        <aside className="hidden w-[236px] shrink-0 bg-sidebar md:block md:min-h-screen">
          <div className="px-5 pb-6 pt-6"><Brand sub={brandSub} dark /></div>
          <nav aria-label="Main"><NavLinks items={nav} dark /></nav>
        </aside>
        <div className="min-w-0 flex-1 bg-surface">
          <DemoStrip who={who} />
          <header className="flex h-[60px] items-center justify-between border-b border-line bg-surface px-4 md:px-7">
            <div className="md:hidden"><Brand sub={brandSub} /></div>
            <div className="hidden text-[17px] text-ink md:block">{who}</div>
            <div className="flex items-center"><NotificationBell base={base} /><span aria-hidden className="mx-2 h-7 w-px bg-line" /><SignOut /></div>
          </header>
          <main className="mx-auto max-w-[1240px] px-4 pb-24 pt-6 md:px-8 md:pb-12">{children}</main>
          <footer className="px-4 pb-24 text-center text-[12px] text-muted md:pb-6">Powered by Elsewhere</footer>
        </div>
      </div>
      <MobileNav items={nav} />
    </CsrfProvider>
  );
}
