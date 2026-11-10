import Link from 'next/link';
import { and, asc, eq } from 'drizzle-orm';
import { Briefcase, FileText, SlidersHorizontal, CalendarDays, ChevronRight, Inbox } from 'lucide-react';
import { pageViewer } from '@/server/page-auth';
import { candidateOverview } from '@/server/views/candidate';
import { checkInQuestions } from '@/server/db/schema';
import { LinkButton, buttonClass, cx } from '@/components/ui';
import { ActionButton, JobPoller } from '@/components/client';
import { FoldArt } from '@/components/fold-art';
import { HomeAiButton } from '@/components/home-ai';
import { onboardingView } from '@/server/services/onboarding';
import { HandHelping } from 'lucide-react';

const REASON: Record<string, string> = {
  discovery_off: 'Discovery is off, so employers can’t find you for new roles.',
  employer_unresolved: 'You’re visible, but we haven’t matched your employer yet, so we can’t hide you from them. Add or check it in Privacy.',
  employer_not_supplied: 'You’re visible. Tell us your current employer in Privacy and we’ll hide you from them.',
  no_approved_profile: 'Approve one example so employers can see your anonymous profile.',
  status_onboarding: 'Finish setting up your profile.',
  status_paused: 'Your profile is paused.',
  terms_missing: 'Accept the prototype terms.',
  ai_consent_missing: 'Accept AI processing.',
};

export default async function CandidateHome() {
  const { ctx } = await pageViewer('candidate');
  const o = await candidateOverview(ctx);
  const ob = await onboardingView(ctx);
  const checklistDone = ob.approved >= ob.total;
  const initial = o.conversations.find((c) => c.kind === 'initial_screening');
  const active = o.conversations.find((c) => c.status === 'active');
  const [nextQ] = active ? await ctx.tx.select({ text: checkInQuestions.questionText }).from(checkInQuestions).where(and(eq(checkInQuestions.conversationId, active.id), eq(checkInQuestions.state, 'unanswered'))).orderBy(asc(checkInQuestions.ordinal)).limit(1) : [];
  const fb = (o.profile?.feedbackLive ?? o.profile?.feedback ?? null) as { nextQuestion?: string } | null;
  const approved = o.evidence.filter((e) => e.reviewState === 'candidate_approved' || e.reviewState === 'consultant_verified').length;

  // The one next thing to do, in plain words.
  const needsCv = !o.cv && !initial;
  const startKind = initial?.status === 'completed' ? 'check_in' : 'initial_screening';
  const question = nextQ?.text ?? fb?.nextQuestion ?? 'Tell us about a task you took responsibility for.';

  const sections = [
    { label: 'Experience', hint: o.cv ? 'CV added' : 'Add your CV', done: !!o.cv, href: '/candidate/cv', Icon: Briefcase },
    { label: 'Examples', hint: approved ? `${approved} approved` : o.drafts.length ? `${o.drafts.length} to review` : 'Answer a question', done: approved > 0, href: '/candidate/profile?tab=evidence', Icon: FileText },
    { label: 'Preferences', hint: o.candidate.preferencesConfirmed ? 'Set' : 'Not asked yet: roles, pay, where', done: o.candidate.preferencesConfirmed, href: '/candidate/privacy#preferences', Icon: SlidersHorizontal },
    { label: 'Availability', hint: o.candidate.noticeWeeks != null ? `${o.candidate.noticeWeeks} weeks’ notice` : 'Your notice period', done: o.candidate.noticeWeeks != null, href: '/candidate/privacy#preferences', Icon: CalendarDays },
  ];
  const ready = sections.filter((s) => s.done).length;

  return (
    <div className="relative mx-auto max-w-[1080px]">
      <div aria-hidden className="pointer-events-none absolute -right-24 -top-24 h-[420px] w-[420px] rounded-full bg-[radial-gradient(closest-side,rgba(29,91,63,.12),rgba(29,91,63,0))]" />
      <header className="relative">
        <h1 className="text-[34px] leading-[1.08] lg:text-[44px]">Let your experience speak.</h1>
        <p className="mt-2 text-[17px] text-muted">Anonymous until you accept an introduction.</p>
      </header>

      {o.pendingIntros > 0 && (
        <Link href="/candidate/introductions" className="relative mt-6 flex items-center gap-4 rounded-[24px] bg-ink px-5 py-4 text-white no-underline">
          <Inbox aria-hidden size={26} strokeWidth={1.7} />
          <span className="flex-1"><span className="block font-display text-[19px] font-extrabold">{o.pendingIntros} employer{o.pendingIntros > 1 ? 's want' : ' wants'} to meet you</span><span className="text-[15px] text-white/80">You decide. Your name stays hidden until you accept.</span></span>
          <ChevronRight aria-hidden />
        </Link>
      )}

      <div className="relative mt-6 grid gap-8 lg:grid-cols-[1.1fr_1fr] lg:items-start">
        <section aria-label="Your next step" className="overflow-hidden rounded-[32px] bg-surface p-3 shadow-[0_24px_60px_-28px_rgba(30,40,30,.35)]">
          <FoldArt className="h-28 w-full rounded-[24px] lg:h-32" />
          <div className="px-3 pb-3 pt-1">
            {!checklistDone ? (<>
              <h2 className="text-[26px] leading-tight">Build your mini-me.</h2>
              <p className="mt-1 text-[17px] text-muted">{ob.answered ? `It knows you ${Math.round((ob.answered / ob.total) * 100)}% so far. ${ob.approved} answer${ob.approved === 1 ? '' : 's'} checked by you.` : 'No one knows you better than your ChatGPT (not even your family). Let it do the typing.'}</p>
              <div className="mt-5 space-y-3">
                <Link href="/candidate/onboarding?ai=1" className={cx(buttonClass('primary', true), 'gap-3 text-[17px] no-underline')}><HandHelping aria-hidden size={22} strokeWidth={1.8} /> Let my AI do this</Link>
                <Link href="/candidate/onboarding" className={cx(buttonClass('secondary', true), 'text-[17px] no-underline')}>{ob.toCheck ? `Check ${ob.toCheck} answer${ob.toCheck > 1 ? 's' : ''}` : 'See my mini-me'}</Link>
              </div>
            </>) : (<>
            <h2 className="text-[30px] leading-tight">{needsCv ? 'Start with your CV.' : 'One good example.'}</h2>
            <p className="mt-1 text-[17px] text-muted">{needsCv ? 'We use it to ask you the right questions.' : question}</p>
            <div className="mt-5 space-y-3">
              {needsCv ? <LinkButton href="/candidate/cv" className="w-full text-[17px]">Add your CV</LinkButton>
                : active ? <LinkButton href={`/candidate/conversation/${active.id}`} className="w-full text-[17px]">Answer next question</LinkButton>
                : <ActionButton path="conversations/start" body={{ kind: startKind }} label="Answer next question" redirect="/candidate/conversation/{id}" full />}
              {!needsCv && <HomeAiButton conversationId={active?.id ?? null} startKind={startKind} />}
            </div>
            </>)}
          </div>
        </section>

        <section aria-label="Your profile">
          <h2 className="text-[26px]">Your profile</h2>
          <p className="mt-1 text-[17px] text-muted">{ready} of {sections.length} sections ready</p>
          <div className="mt-4 grid grid-cols-4 gap-2" aria-hidden>{sections.map((s) => <span key={s.label} className={cx('h-2 rounded-full', s.done ? 'bg-primary' : 'bg-line')} />)}</div>
          <ul className="mt-4">
            {sections.map(({ label, hint, done, href, Icon }) => (
              <li key={label}>
                <Link href={href} className="-mx-2 flex items-center gap-4 rounded-2xl px-2 py-2.5 text-ink no-underline hover:bg-surface">
                  <Icon aria-hidden size={24} strokeWidth={1.6} />
                  <span className="flex-1"><span className="block text-[18px] font-medium">{label}</span><span className={cx('text-[14px]', done ? 'text-primary' : 'text-muted')}>{done ? `✓ ${hint}` : hint}</span></span>
                  <ChevronRight aria-hidden className="text-muted" />
                </Link>
              </li>
            ))}
          </ul>
          {!o.discovery.discoverable && o.discovery.reasons[0] && <p className="mt-3 rounded-2xl bg-warning-tint px-4 py-3 text-[15px] text-warning">{REASON[o.discovery.reasons[0]] ?? o.discovery.reasons[0]}</p>}
          {o.discovery.discoverable && o.discovery.warnings[0] && <Link href="/candidate/privacy" className="mt-3 block rounded-2xl bg-warning-tint px-4 py-3 text-[15px] text-warning no-underline">{REASON[o.discovery.warnings[0]] ?? o.discovery.warnings[0]}</Link>}
          {o.profileJob && (o.profileJob.status === 'queued' || o.profileJob.status === 'running') && <div className="mt-3"><JobPoller jobId={o.profileJob.id} /></div>}
          {o.profileJob?.status === 'failed' && <div className="mt-3 flex flex-wrap items-center gap-3 text-[15px]"><span>We couldn’t update your profile just now.</span><ActionButton path="conversations/retry-profile" body={{ jobId: o.profileJob.id }} label="Try again" variant="secondary" /></div>}
          <p className="mt-4 text-[14px]"><Link href="/candidate/profile" className={cx(buttonClass('ghost'), 'min-h-0 px-0 text-[15px]')}>See your profile as employers do</Link></p>
        </section>
      </div>
    </div>
  );
}
