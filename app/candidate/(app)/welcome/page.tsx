import Link from 'next/link';
import { Check, Mail } from 'lucide-react';
import { pageViewer } from '@/server/page-auth';
import { candidateSelf } from '@/server/services/candidates';
import { buttonClass, cx } from '@/components/ui';
import { FoldArt } from '@/components/fold-art';

/** The first thing a new candidate sees: what Elsewhere is, the welcome email, and three steps. */
export default async function Welcome() {
  const { ctx } = await pageViewer('candidate');
  const self = await candidateSelf(ctx);
  const first = (self.identity?.fullName ?? '').split(' ')[0] || 'there';
  const steps = [
    { title: 'Your basic details', body: 'Name, email, where you are and what you’re looking for.', done: true },
    { title: 'Let your AI fill in your profile', body: 'Connect ChatGPT or Claude. It answers about 50 questions from what it knows about you and asks you the rest.', done: false },
    { title: 'Check every answer', body: 'Read your profile document, change anything, approve it. Then you can be matched to jobs.', done: false },
  ];
  return (
    <div className="mx-auto max-w-[920px]">
      <FoldArt id="welcome" palette="sand" variant={1} className="h-40 w-full rounded-3xl lg:h-56" />
      <h1 className="mt-8 text-[40px] leading-[1.05] lg:text-[60px]">Welcome, {first}.</h1>
      <p className="mt-4 max-w-[38ch] text-[19px] text-muted lg:text-[21px]">BondMoran Elsewhere finds you jobs that fit, using what you’ve really done. Employers see your experience, never your name, until you say yes.</p>

      <ol className="mt-10 space-y-4">
        {steps.map((s, i) => (
          <li key={s.title} className="flex gap-4 rounded-3xl bg-surface p-5 shadow-[0_8px_24px_rgb(18_37_29/0.06)]">
            <span aria-hidden className={cx('flex h-10 w-10 shrink-0 items-center justify-center rounded-full font-display text-[17px] font-semibold', s.done ? 'bg-success-tint text-primary' : 'bg-page text-ink')}>{s.done ? <Check size={20} /> : i + 1}</span>
            <span><span className="block font-display text-[20px] font-semibold">{s.title}{s.done ? <span className="sr-only"> (done)</span> : null}</span><span className="text-[16px] text-muted">{s.body}</span></span>
          </li>
        ))}
      </ol>
      <div className="mt-8 flex flex-col gap-3 sm:flex-row">
        <Link href="/candidate/onboarding?ai=1" className={cx(buttonClass('primary'), 'rounded-full! px-8 text-[18px] no-underline')}>Start my profile</Link>
        <Link href="/candidate/onboarding" className={cx(buttonClass('secondary'), 'rounded-full! px-8 text-[18px] no-underline')}>I’ll type it myself</Link>
      </div>

      <details className="mt-12 rounded-3xl bg-surface p-5 shadow-[0_8px_24px_rgb(18_37_29/0.06)]">
        <summary className="flex cursor-pointer list-none items-center gap-3 font-semibold"><Mail size={20} aria-hidden /> Your welcome email</summary>
        <div className="mt-4 border-t border-line pt-4 text-[16px]">
          <p className="text-[14px] text-muted">From BondMoran · Subject: Welcome to BondMoran Elsewhere</p>
          <div className="mt-3 space-y-3">
            <p>Hi {first},</p>
            <p>Welcome to BondMoran Elsewhere. We help you find a job that fits, based on what you’ve actually done, not just your CV.</p>
            <p>Here’s how it works: you build a profile once, your own ChatGPT or Claude can fill most of it in for you, and you check every word. Employers see your experience and skills, never your name or current employer, until you accept an introduction.</p>
            <p>To get started, sign in and press “Start my profile”.</p>
            <p>The BondMoran team</p>
          </div>
          <p className="mt-4 text-[13px] text-muted">This is a demo: the email is recorded, not actually sent.</p>
        </div>
      </details>
    </div>
  );
}
