import Link from 'next/link';
import type { ReactNode } from 'react';
import { CsrfProvider } from './client';
import { NotificationBell, SignOut, SwitchPersona, NavLinks, MobileNav, type NavItem } from './shell-client';
import { providerLabel } from '../server/ai';
import { cx } from './ui';
import { HandHelping, ArrowRight } from 'lucide-react';

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

export function AppShell({ children, nav, base, csrf, who, brandSub, aiBar }: { children: ReactNode; nav: NavItem[]; base: string; csrf: string; who: string; brandSub?: string; aiBar?: { drafts: number; connected: string | null; href: string } }) {
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
              <NotificationBell base={base} />
              <SwitchPersona />
              <span className="hidden md:inline-flex"><SignOut /></span>
            </div>
          </header>
          <main className={cx('mx-auto max-w-[1240px] px-5 pt-4 md:px-8 md:pt-8', aiBar ? 'pb-48 md:pb-32' : 'pb-28 md:pb-12')}>{children}</main>
          <footer className="px-4 pb-24 text-center text-[12px] text-muted md:pb-6">Powered by Elsewhere</footer>
        </div>
      </div>
      {aiBar && <AiBar {...aiBar} />}
      <MobileNav items={nav} />
    </CsrfProvider>
  );
}

/** The "Your AI" bar that follows the person around, like a now-playing bar. */
function AiBar({ drafts, connected, href }: { drafts: number; connected: string | null; href: string }) {
  const status = drafts ? `${drafts} draft${drafts > 1 ? 's' : ''} ready` : connected ? `Using your ${connected}` : 'Not connected';
  const action = drafts ? 'Check drafts' : connected ? 'Open' : 'Set up';
  return (
    <Link href={href} aria-label={`Your AI: ${status}. ${action}`} className="fixed inset-x-3 bottom-[calc(72px+env(safe-area-inset-bottom))] z-30 flex items-center gap-3 rounded-[22px] bg-primary px-5 py-4 text-white no-underline shadow-[0_12px_32px_-12px_rgba(20,60,40,.55)] md:bottom-6 md:left-[260px] md:right-8 md:mx-auto md:max-w-[720px]">
      <HandHelping aria-hidden size={26} strokeWidth={1.7} />
      <span className="font-display text-[19px] font-extrabold">Your AI</span>
      <span aria-hidden className="h-6 w-px bg-white/30" />
      <span className="min-w-0 flex-1 truncate text-[15px] text-white/90">{status}</span>
      <span className="flex items-center gap-1.5 whitespace-nowrap text-[15px] font-bold">{action} <ArrowRight aria-hidden size={18} /></span>
    </Link>
  );
}
