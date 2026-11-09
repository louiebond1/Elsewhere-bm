import Link from 'next/link';
import type { ReactNode } from 'react';
import { CsrfProvider } from './client';
import { NotificationBell, SignOut, SwitchPersona, TopNav, MobileNav, type NavItem } from './shell-client';
import { providerLabel } from '../server/ai';
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
        <main className="mx-auto max-w-[1320px] px-5 pb-28 pt-4 lg:px-10 lg:pb-14 lg:pt-6">{aiBar && <AiBar {...aiBar} />}{children}</main>
        <footer className="px-4 pb-24 text-center text-[12px] text-muted lg:pb-6">Powered by Elsewhere</footer>
      </div>
      <MobileNav items={nav} />
    </CsrfProvider>
  );
}

/** The "Your AI" bar that follows the person around, like a now-playing bar. */
function AiBar({ status, action, href }: AiBarInfo) {
  return (
    <Link href={href} aria-label={`Your AI: ${status}. ${action}`} className="group mb-6 flex items-center gap-3 rounded-2xl bg-primary px-5 py-3 text-white no-underline lg:mb-8">
      <HandHelping aria-hidden size={22} strokeWidth={1.7} />
      <span className="font-display text-[17px] font-semibold">Your AI</span>
      <span aria-hidden className="h-5 w-px bg-white/30" />
      <span className="min-w-0 flex-1 truncate text-[15px] text-white/90">{status}</span>
      <span className="flex items-center gap-1.5 whitespace-nowrap rounded-full bg-surface px-4 py-1.5 text-[15px] font-semibold text-primary">{action} <ArrowRight aria-hidden size={16} className="transition-transform group-hover:translate-x-0.5" /></span>
    </Link>
  );
}

/** The candidate's AI strip: only when there is something to do (connect, or drafts to check). */
export function candidateAiBar(drafts: number, connected: string | null, checklistToCheck = 0): AiBarInfo | undefined {
  if (checklistToCheck) return { status: `${checklistToCheck} answer${checklistToCheck > 1 ? 's' : ''} from your AI to check`, action: 'Check them', href: '/candidate/onboarding' };
  if (drafts) return { status: `${drafts} draft${drafts > 1 ? 's' : ''} ready to check`, action: 'Check drafts', href: '/candidate/ai' };
  if (!connected) return { status: 'Not connected yet', action: 'Set up', href: '/candidate/onboarding?ai=1' };
  return undefined;
}
