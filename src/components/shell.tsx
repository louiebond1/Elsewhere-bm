import Link from 'next/link';
import type { ReactNode } from 'react';
import { CsrfProvider } from './client';
import { NotificationBell, SignOut, SwitchPersona, TopNav, MobileNav, type NavItem } from './shell-client';
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

export type AiBarInfo = { status: string; action: string; href: string };

export function AppShell({ children, nav, base, csrf, who, brandSub, aiBar, pill }: { children: ReactNode; nav: NavItem[]; base: string; csrf: string; who: string; brandSub?: string; aiBar?: AiBarInfo; pill?: ReactNode }) {
  return (
    <CsrfProvider token={csrf}>
      <div className="min-h-screen bg-page">
        <DemoStrip who={who} />
        <header className="sticky top-0 z-30 bg-page/85 backdrop-blur-md">
          <div className="mx-auto flex min-h-[72px] max-w-[1320px] items-center justify-between gap-4 px-5 lg:px-10">
            <Link href={`${base}/home`} className="no-underline"><Brand sub={brandSub} /></Link>
            <nav aria-label="Main" className="hidden lg:block"><TopNav items={nav} /></nav>
            <div className="flex items-center gap-2">
              <NotificationBell base={base} />
              <SwitchPersona />
              {pill}
              <span className="hidden lg:inline-flex"><SignOut /></span>
            </div>
          </div>
        </header>
        <main className={cx('mx-auto max-w-[1320px] px-5 pt-4 lg:px-10 lg:pt-6', aiBar ? 'pb-40 lg:pb-28' : 'pb-28 lg:pb-14')}>{children}</main>
        <footer className={cx('px-4 text-center text-[12px] text-muted', aiBar ? 'pb-36 lg:pb-24' : 'pb-24 lg:pb-6')}>Powered by Elsewhere</footer>
      </div>
      {aiBar && <AiBar {...aiBar} />}
      <MobileNav items={nav} />
    </CsrfProvider>
  );
}

/** The "Your AI" bar that follows the person around, like a now-playing bar. */
function AiBar({ status, action, href }: AiBarInfo) {
  return (
    <Link href={href} aria-label={`Your AI: ${status}. ${action}`} className="group fixed inset-x-0 bottom-[calc(64px+env(safe-area-inset-bottom))] z-30 block bg-primary text-white no-underline lg:bottom-0 lg:pb-[env(safe-area-inset-bottom)]">
      <span className="mx-auto flex h-14 max-w-[1320px] items-center gap-3 px-5 lg:h-16 lg:px-10">
        <HandHelping aria-hidden size={24} strokeWidth={1.7} />
        <span className="font-display text-[18px] font-semibold">Your AI</span>
        <span aria-hidden className="h-6 w-px bg-white/30" />
        <span className="min-w-0 flex-1 truncate text-[15px] text-white/90 lg:text-[16px]">{status}</span>
        <span className="flex items-center gap-1.5 whitespace-nowrap text-[15px] font-semibold lg:rounded-full lg:bg-surface lg:px-5 lg:py-2 lg:text-primary">{action} <ArrowRight aria-hidden size={18} className="transition-transform group-hover:translate-x-0.5" /></span>
      </span>
    </Link>
  );
}

/** What the candidate's AI bar says. */
export function candidateAiBar(drafts: number, connected: string | null): AiBarInfo {
  return {
    status: drafts ? `${drafts} draft${drafts > 1 ? 's' : ''} ready` : connected ? `Using your ${connected}` : 'Not connected',
    action: drafts ? 'Check drafts' : connected ? 'Open' : 'Set up',
    href: '/candidate/ai',
  };
}
