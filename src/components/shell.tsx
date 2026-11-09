import Link from 'next/link';
import type { ReactNode } from 'react';
import { CsrfProvider } from './client';
import { NotificationBell, SignOut, SwitchPersona, NavLinks, MobileNav, type NavItem } from './shell-client';
import { providerLabel } from '../server/ai';

export function Brand({ sub, dark }: { sub?: string; dark?: boolean }) {
  return (
    <div>
      <div className={dark ? 'font-display text-[28px] font-extrabold leading-tight tracking-tight text-white' : 'font-display text-[21px] font-extrabold leading-tight tracking-tight text-ink'}>BondMoran</div>
      <div className={dark ? 'text-[15px] text-white/75' : 'text-[14px] font-medium text-muted'}>{sub ?? 'Hiring partnership'}</div>
    </div>
  );
}

/** A quiet line saying this is fictional demo data, with the switch-account control as a small "Demo" pill in the header. */
export function DemoStrip({ who }: { who?: string | null }) {
  return (
    <div className="bg-page px-4 py-1 text-center text-[12px] text-muted md:text-left md:px-8">
      Fictional demo data · {providerLabel()}
      {who ? <span className="sr-only"> Signed in as {who}</span> : null}
    </div>
  );
}

export function AppShell({ children, nav, base, csrf, who, brandSub, drafts }: { children: ReactNode; nav: NavItem[]; base: string; csrf: string; who: string; brandSub?: string; drafts?: { count: number; href: string } }) {
  return (
    <CsrfProvider token={csrf}>
      <div className="md:flex">
        <aside className="hidden w-[236px] shrink-0 bg-sidebar md:block md:min-h-screen">
          <div className="px-5 pb-6 pt-6"><Brand sub={brandSub} dark /></div>
          <nav aria-label="Main"><NavLinks items={nav} dark /></nav>
        </aside>
        <div className="min-w-0 flex-1 bg-surface md:bg-page">
          <DemoStrip who={who} />
          <header className="flex min-h-[68px] items-center justify-between gap-2 bg-surface px-4 md:border-b md:border-line md:px-8">
            <div className="md:hidden"><Brand sub={brandSub} /></div>
            <div className="hidden text-[16px] text-muted md:block">{who}</div>
            <div className="flex items-center gap-1">
              {drafts && drafts.count > 0 && <Link href={drafts.href} className="whitespace-nowrap rounded-full bg-success-tint px-3 py-1.5 text-[14px] font-bold text-primary no-underline">{drafts.count} draft{drafts.count > 1 ? 's' : ''} ready</Link>}
              <NotificationBell base={base} />
              <SwitchPersona />
              <span className="hidden md:inline-flex"><SignOut /></span>
            </div>
          </header>
          <main className="mx-auto max-w-[1240px] px-5 pb-28 pt-4 md:px-8 md:pb-12 md:pt-8">{children}</main>
          <footer className="px-4 pb-24 text-center text-[12px] text-muted md:pb-6">Powered by Elsewhere</footer>
        </div>
      </div>
      <MobileNav items={nav} />
    </CsrfProvider>
  );
}
