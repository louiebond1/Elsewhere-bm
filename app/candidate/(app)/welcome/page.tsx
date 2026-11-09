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
    { title: 'The basics', body: 'Name, email, where you are and what you’re after. Done.', done: true },
    { title: 'Let your ChatGPT spill the beans', body: 'No one knows you better than your ChatGPT (not even your mum). Connect it and it gives you a quick, friendly mock interview (voice works too) and builds your mini-me as you chat.', done: false },
    { title: 'Give it a once-over', body: 'Read what it wrote, tweak anything that’s not quite you, and approve it. Nothing goes anywhere until you do.', done: false },
  ];
  return (
    <div className="mx-auto max-w-[920px]">
      <FoldArt id="welcome" palette="sand" variant={1} className="h-40 w-full rounded-3xl lg:h-56" />
      <h1 className="mt-8 text-[40px] leading-[1.05] lg:text-[60px]">Welcome, {first}.</h1>
      <p className="mt-4 max-w-[38ch] text-[19px] text-muted lg:text-[21px]">Let’s build your mini-me: a version of you that knows your work inside out and speaks up for you with employers. They see what you can do, never your name, until you say yes.</p>

      <ol className="mt-10 space-y-4">
        {steps.map((s, i) => (
          <li key={s.title} className="flex gap-4 rounded-3xl bg-surface p-5 shadow-[0_8px_24px_rgb(18_37_29/0.06)]">
            <span aria-hidden className={cx('flex h-10 w-10 shrink-0 items-center justify-center rounded-full font-display text-[17px] font-semibold', s.done ? 'bg-success-tint text-primary' : 'bg-page text-ink')}>{s.done ? <Check size={20} /> : i + 1}</span>
            <span><span className="block font-display text-[20px] font-semibold">{s.title}{s.done ? <span className="sr-only"> (done)</span> : null}</span><span className="text-[16px] text-muted">{s.body}</span></span>
          </li>
        ))}
      </ol>
      <div className="mt-8 flex flex-col gap-3 sm:flex-row">
        <Link href="/candidate/onboarding?ai=1" className={cx(buttonClass('primary'), 'rounded-full! px-8 text-[18px] no-underline')}>Build my mini-me</Link>
        <Link href="/candidate/onboarding" className={cx(buttonClass('secondary'), 'rounded-full! px-8 text-[18px] no-underline')}>I’d rather type it myself</Link>
      </div>

      <details className="mt-12 rounded-3xl bg-surface p-5 shadow-[0_8px_24px_rgb(18_37_29/0.06)]">
        <summary className="flex cursor-pointer list-none items-center gap-3 font-semibold"><Mail size={20} aria-hidden /> Your welcome email</summary>
        <div className="mt-4 border-t border-line pt-4 text-[16px]">
          <p className="text-[14px] text-muted">From BondMoran · Subject: Welcome to BondMoran Elsewhere</p>
          <div className="mt-3 space-y-3">
            <p>Hi {first},</p>
            <p>Welcome to BondMoran Elsewhere. We find you jobs that fit what you’ve actually done, not just what’s on your CV.</p>
            <p>First, we’ll build your mini-me. No one knows you better than your ChatGPT (not even your family), so you can let it do most of the typing. You check every word, and employers never see your name or current employer until you say yes.</p>
            <p>Sign in and press “Build my mini-me”. It takes a few minutes.</p>
            <p>The BondMoran team</p>
          </div>
          <p className="mt-4 text-[13px] text-muted">This is a demo: the email is recorded, not actually sent.</p>
        </div>
      </details>
    </div>
  );
}
