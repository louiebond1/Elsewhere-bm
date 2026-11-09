import Link from 'next/link';
import { pageViewer } from '@/server/page-auth';
import { onboardingView } from '@/server/services/onboarding';
import { connectedAi } from '@/server/connectors/drafts';
import { issuer } from '@/server/connectors/oauth';
import { cx } from '@/components/ui';
import { ChecklistAi, ApproveAll, Extras, QuestionDeck } from '@/components/onboarding-doc';

export const dynamic = 'force-dynamic';

/** Your mini-me: section tiles at a glance, then one question at a time. */
export default async function Onboarding({ searchParams }: { searchParams: Promise<{ ai?: string; s?: string }> }) {
  const { ctx } = await pageViewer('candidate');
  const [v, connected, sp] = await Promise.all([onboardingView(ctx), connectedAi(ctx), searchParams]);
  const pct = Math.round((v.answered / v.total) * 100);
  const tiles = [
    ...v.sections.map((s) => ({ key: s.key, title: s.title, total: s.questions.length, answered: s.questions.filter((q) => q.answer).length, checked: s.questions.filter((q) => q.approved).length })),
    { key: 'extras', title: 'Extras', total: 0, answered: v.extras.length, checked: v.extras.filter((e) => e.approved).length },
  ];
  // Open the section they asked for, otherwise the first one with something to do.
  const current = tiles.find((t) => t.key === sp.s)?.key ?? v.sections.find((s) => s.questions.some((q) => !q.approved))?.key ?? (v.extrasToCheck ? 'extras' : v.sections[0].key);
  const idx = v.sections.findIndex((s) => s.key === current);
  const section = idx >= 0 ? v.sections[idx] : null;
  const nextHref = idx >= 0 ? (idx < v.sections.length - 1 ? `/candidate/onboarding?s=${v.sections[idx + 1].key}` : '/candidate/onboarding?s=extras') : null;
  return (
    <div className="mx-auto max-w-[1080px]">
      <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h1>Your mini-me</h1>
          <p className="mt-2 max-w-[48ch] text-[17px] text-muted">The more it knows, the better your interviews go. Your name stays hidden until you say yes.</p>
        </div>
        <div className="flex items-center gap-4">
          <div className="relative h-20 w-20 shrink-0" aria-hidden>
            <svg viewBox="0 0 36 36" className="h-20 w-20 -rotate-90"><circle cx="18" cy="18" r="15.5" fill="none" stroke="#DCE2DA" strokeWidth="3.5" /><circle cx="18" cy="18" r="15.5" fill="none" stroke="#16543D" strokeWidth="3.5" strokeLinecap="round" strokeDasharray={`${pct * 0.974} 100`} /></svg>
            <span className="tnum absolute inset-0 flex items-center justify-center font-display text-[18px] font-semibold">{pct}%</span>
          </div>
          <p className="text-[15px] leading-snug"><span className="block font-semibold">Knows you {pct}%</span><span className="text-muted">{v.approved} answer{v.approved === 1 ? '' : 's'} checked by you</span></p>
        </div>
      </div>

      <div className="mt-6"><ChecklistAi connected={connected} connectorUrl={`${issuer()}/mcp`} autoOpen={sp.ai === '1'} waiting={v.answered < v.total || v.toCheck > 0} /></div>
      {v.toCheck > 0 && (
        <div className="mt-4 flex flex-col gap-3 rounded-3xl bg-warning-tint px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-[17px]"><span className="font-semibold">Your AI wrote {v.toCheck} answer{v.toCheck > 1 ? 's' : ''}.</span> Have a look, or if you trust it:</p>
          <ApproveAll count={v.toCheck} />
        </div>
      )}

      <nav aria-label="Sections" className="mt-6 grid grid-cols-3 gap-2 sm:grid-cols-5 lg:grid-cols-9">
        {tiles.map((t) => {
          const on = t.key === current;
          const full = t.total ? t.checked === t.total : t.answered > 0 && t.checked === t.answered;
          return (
            <Link key={t.key} href={`/candidate/onboarding?s=${t.key}`} aria-current={on ? 'true' : undefined} className={cx('press flex min-h-[84px] flex-col justify-between rounded-2xl p-3 no-underline', on ? 'bg-primary text-white' : 'bg-surface text-ink shadow-[0_2px_8px_rgb(18_37_29/0.05)] hover:bg-white')}>
              <span className="text-[14px] font-semibold leading-tight">{t.title}</span>
              <span className={cx('tnum text-[13px]', on ? 'text-white/80' : full ? 'font-semibold text-primary' : 'text-muted')}>{t.total ? (full ? '✓ Done' : `${t.answered}/${t.total}`) : t.answered ? `${t.answered} shared` : 'Add more'}</span>
            </Link>
          );
        })}
      </nav>

      <div className="mt-5">
        {section
          ? <QuestionDeck key={section.key} title={section.title} questions={section.questions} nextHref={nextHref} />
          : <Extras extras={v.extras} />}
      </div>
    </div>
  );
}
