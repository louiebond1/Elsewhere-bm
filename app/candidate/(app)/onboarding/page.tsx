import Link from 'next/link';
import { pageViewer } from '@/server/page-auth';
import { onboardingView, miniMeStory } from '@/server/services/onboarding';
import { connectedAi, draftsWaiting } from '@/server/connectors/drafts';
import { issuer } from '@/server/connectors/oauth';
import { cx } from '@/components/ui';
import { PhotoBackdrop } from '@/components/photo-backdrop';
import { MapPin, Briefcase, Trophy, Wrench, Users, Target, FileText, MoreHorizontal, LayoutGrid } from 'lucide-react';
import { ApproveAll, Extras, QuestionDeck, AddSomething, ConnectBanner, AlwaysOnRow, KnowsCard } from '@/components/onboarding-doc';

const AREA_ICONS: Record<string, typeof MapPin> = { all: LayoutGrid, now: MapPin, experience: Briefcase, examples: Trophy, skills: Wrench, style: Users, next: Target, practical: FileText, extras: MoreHorizontal };

export const dynamic = 'force-dynamic';
const PAGE = 12;

/**
 * Your mini-me. By default: what it knows, as a feed of short topics, built up over relaxed chats with
 * their own AI. The question list is only a guide for the AI; "Answer some yourself" opens it for typing.
 */
export default async function Onboarding({ searchParams }: { searchParams: Promise<{ ai?: string; s?: string; mode?: string; a?: string; n?: string }> }) {
  const { ctx } = await pageViewer('candidate');
  const [v, connected, sp, questionDrafts, story] = await Promise.all([onboardingView(ctx), connectedAi(ctx), searchParams, draftsWaiting(ctx), miniMeStory(ctx)]);
  const pct = Math.round((v.answered / v.total) * 100);
  const typing = sp.mode === 'type';

  const header = (
    <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
      <div>
        <h1>Your mini-me</h1>
        <p className="mt-2 max-w-[50ch] text-[17px] text-muted">Built up over relaxed chats with your own AI, whenever you like. The more it knows, the better your interviews go. Your name stays hidden until you say yes.</p>
      </div>
      <div className="flex items-center gap-4">
        <div className="relative h-20 w-20 shrink-0" aria-hidden>
          <svg viewBox="0 0 36 36" className="h-20 w-20 -rotate-90"><circle cx="18" cy="18" r="15.5" fill="none" stroke="#DCE2DA" strokeWidth="3.5" /><circle cx="18" cy="18" r="15.5" fill="none" stroke="#16543D" strokeWidth="3.5" strokeLinecap="round" strokeDasharray={`${pct * 0.974} 100`} /></svg>
          <span className="tnum absolute inset-0 flex items-center justify-center font-display text-[18px] font-semibold">{pct}%</span>
        </div>
        <p className="text-[15px] leading-snug"><span className="block font-semibold">Knows you {pct}%</span><span className="text-muted">{v.feed.length} thing{v.feed.length === 1 ? '' : 's'} learned</span></p>
      </div>
    </div>
  );
  if (typing) {
    // The question-by-question view, for people who'd rather type.
    const tiles = [...v.sections.map((s) => ({ key: s.key, title: s.title, total: s.questions.length, answered: s.questions.filter((q) => q.answer).length, checked: s.questions.filter((q) => q.approved).length })), { key: 'extras', title: 'Extras', total: 0, answered: v.extras.length, checked: v.extras.filter((e) => e.approved).length }];
    const current = tiles.find((t) => t.key === sp.s)?.key ?? v.sections.find((s) => s.questions.some((q) => !q.approved))?.key ?? v.sections[0].key;
    const idx = v.sections.findIndex((s) => s.key === current);
    const section = idx >= 0 ? v.sections[idx] : null;
    const nextHref = idx >= 0 ? (idx < v.sections.length - 1 ? `/candidate/onboarding?mode=type&s=${v.sections[idx + 1].key}` : '/candidate/onboarding?mode=type&s=extras') : null;
    return (
      <div className="mx-auto max-w-[1080px]">
        {header}
        <p className="mt-6"><Link href="/candidate/onboarding">← Back to what your mini-me knows</Link></p>
        <nav aria-label="Sections" className="mt-4 grid grid-cols-3 gap-2 sm:grid-cols-5 lg:grid-cols-9">
          {tiles.map((t) => {
            const on = t.key === current; const full = t.total ? t.checked === t.total : t.answered > 0 && t.checked === t.answered;
            return <Link key={t.key} href={`/candidate/onboarding?mode=type&s=${t.key}`} aria-current={on ? 'true' : undefined} className={cx('press flex min-h-[84px] flex-col justify-between rounded-2xl p-3 no-underline', on ? 'bg-primary text-white' : 'bg-surface text-ink shadow-[0_2px_8px_rgb(18_37_29/0.05)]')}><span className="text-[14px] font-semibold leading-tight">{t.title}</span><span className={cx('tnum text-[13px]', on ? 'text-white/80' : full ? 'font-semibold text-primary' : 'text-muted')}>{t.total ? (full ? '✓ Done' : `${t.answered}/${t.total}`) : t.answered ? `${t.answered} shared` : 'Add more'}</span></Link>;
          })}
        </nav>
        <div className="mt-5">{section ? <QuestionDeck key={section.key} title={section.title} questions={section.questions} nextHref={nextHref} /> : <Extras extras={v.extras} />}</div>
      </div>
    );
  }

  // Default: what it knows. "Anything else" sits with Extras.
  const areaKeyOf = (k: string) => (k === 'more' ? 'extras' : k);
  const areas = [
    { key: 'all', title: 'Everything', have: 1, of: 1 },
    ...v.sections.filter((s) => s.key !== 'more').map((s) => ({ key: s.key, title: s.title, have: s.questions.filter((q) => q.answer).length, of: s.questions.length })),
    { key: 'extras', title: 'Extras', have: v.extras.length + (v.sections.find((s) => s.key === 'more')?.questions.filter((q) => q.answer).length ?? 0), of: 0 },
  ];
  const area = areas.find((a) => a.key === sp.a && a.key !== 'all')?.key ?? null;
  const shown = v.feed.filter((f) => !area || areaKeyOf(f.areaKey) === area);
  const n = Math.max(PAGE, Number(sp.n) || PAGE);
  const href = (q: Record<string, string | null>) => `/candidate/onboarding?${new URLSearchParams(Object.entries(q).filter(([, x]) => x) as [string, string][]).toString()}`;
  return (
    <div>
      <section className="relative -mt-4 lg:-mt-6">
        <PhotoBackdrop height={600} />
        <div className="flex flex-col gap-6 pb-8 pt-10 text-white lg:flex-row lg:items-center lg:justify-between lg:pb-10 lg:pt-14">
          <div>
            <h1 className="text-[44px] leading-[1.05] text-white lg:text-[64px]">Your mini-me</h1>
            <p className="mt-3 max-w-[46ch] text-[17px] text-white/90 lg:text-[19px]">The more it knows, the better your interviews go. Your name stays hidden until you say yes.</p>
          </div>
          <div className="flex items-center gap-5">
            <div className="relative h-24 w-24 shrink-0" aria-hidden>
              <svg viewBox="0 0 36 36" className="h-24 w-24 -rotate-90"><circle cx="18" cy="18" r="15.5" fill="none" stroke="rgb(255 255 255 / 0.25)" strokeWidth="3" /><circle cx="18" cy="18" r="15.5" fill="none" stroke="#9FD3AE" strokeWidth="3" strokeLinecap="round" strokeDasharray={`${pct * 0.974} 100`} /></svg>
              <span className="tnum absolute inset-0 flex items-center justify-center font-display text-[22px] font-semibold">{pct}%</span>
            </div>
            <span aria-hidden className="h-14 w-px bg-white/30" />
            <p className="text-[16px] leading-snug"><span className="block font-display text-[22px] font-semibold">Profile complete</span><span className="text-white/85">{v.feed.length} thing{v.feed.length === 1 ? '' : 's'} learned</span></p>
          </div>
        </div>
      </section>

      <div className="relative mx-auto max-w-[1320px] space-y-4">
        <ConnectBanner connected={connected} connectorUrl={`${issuer()}/mcp`} autoOpen={sp.ai === '1'} waiting={v.answered < v.total || v.toCheck > 0} />
        <AlwaysOnRow provider={connected} />
        {questionDrafts > 0 && (
          <Link href="/candidate/ai" className="flex items-center justify-between gap-3 rounded-3xl bg-warning-tint px-5 py-4 text-ink no-underline">
            <span className="text-[17px]"><span className="font-semibold">Your AI also drafted {questionDrafts} answer{questionDrafts > 1 ? 's' : ''} to a check-in question.</span></span>
            <span className="whitespace-nowrap font-semibold text-primary">Check {questionDrafts > 1 ? 'them' : 'it'} →</span>
          </Link>
        )}
        {v.toCheck > 0 && (
          <div className="flex flex-col gap-3 rounded-3xl bg-warning-tint px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-[17px]"><span className="font-display text-[19px] font-semibold">Your AI wrote {v.toCheck} new thing{v.toCheck > 1 ? 's' : ''}.</span> Have a look, or if you trust it:</p>
            <ApproveAll count={v.toCheck} />
          </div>
        )}

        <nav aria-label="Areas" className="shelf -mx-5 flex gap-3 overflow-x-auto px-5 pb-2 pt-2 lg:mx-0 lg:grid lg:grid-cols-9 lg:overflow-visible lg:px-0">
          {areas.map((a) => {
            const on = (a.key === 'all' && !area) || a.key === area;
            const Icon = AREA_ICONS[a.key] ?? MoreHorizontal;
            const dots = a.key === 'all' ? 4 : a.of ? Math.round((a.have / a.of) * 4) : Math.min(4, a.have);
            return (
              <Link key={a.key} href={a.key === 'all' ? href({}) : href({ a: a.key })} aria-current={on ? 'true' : undefined} className={cx('press flex min-h-[92px] w-[132px] shrink-0 flex-col justify-between rounded-2xl p-3 no-underline lg:w-auto', on ? 'bg-primary text-white' : 'bg-surface text-ink shadow-[0_2px_10px_rgb(18_37_29/0.06)] hover:bg-white')}>
                <span className="flex items-start gap-2"><Icon aria-hidden size={20} strokeWidth={1.7} className="mt-0.5 shrink-0" /><span className="text-[14px] font-semibold leading-tight">{a.title}</span></span>
                <span aria-label={a.key === 'all' ? undefined : a.of ? `${a.have} of ${a.of} covered` : `${a.have} shared`} className="flex gap-1">{[0, 1, 2, 3].map((i) => <span key={i} className={cx('h-1.5 w-1.5 rounded-full', i < dots ? (on ? 'bg-white' : 'bg-primary') : (on ? 'bg-white/35' : 'bg-line'))} />)}</span>
              </Link>
            );
          })}
        </nav>

        <section aria-labelledby="knows" className="pt-4">
          <div className="flex flex-wrap items-baseline justify-between gap-3">
            <h2 id="knows" className="text-[30px] leading-9 lg:text-[36px] lg:leading-[44px]">What your mini-me knows</h2>
            <Link href="/candidate/onboarding?mode=type" className="text-[16px] font-semibold underline underline-offset-2">Prefer to type? Answer some yourself</Link>
          </div>
          {shown.length === 0 ? (
            <div className="mt-5 rounded-3xl bg-surface p-8 text-center shadow-[0_8px_24px_rgb(18_37_29/0.06)]">
              <p className="font-display text-[22px] font-semibold">Nothing here yet</p>
              <p className="mt-2 text-[16px] text-muted">{connected ? `Say “Let’s build up my Elsewhere profile” to your ${connected} and just chat. What it learns appears here.` : 'Connect your ChatGPT or Claude above, or add something yourself.'}</p>
            </div>
          ) : (
            <ul className="mt-5 grid gap-4 lg:grid-cols-2">
              {shown.slice(0, n).map((f) => <li key={f.key + (f.answer ?? '') + f.approved}><KnowsCard q={f} area={f.area === 'Anything else' ? 'Extras' : f.area} /></li>)}
            </ul>
          )}
          <div className="mt-6 flex flex-col items-center gap-3">
            {shown.length > n && <Link href={href({ a: area, n: String(n + PAGE) })} className="text-[16px] font-semibold">Show more ({shown.length - n})</Link>}
            <AddSomething />
          </div>
        </section>

        <section aria-labelledby="story" className="pt-8">
          <h2 id="story" className="text-[26px] leading-8">How your mini-me has grown</h2>
          {story.length === 0 ? <p className="mt-3 text-[16px] text-muted">Nothing yet. Every time your AI saves something, or you approve it, it shows up here.</p> : (
            <ol className="mt-4 space-y-0 border-l-2 border-line pl-6">
              {story.map((e, i) => (
                <li key={i} className="relative pb-5 last:pb-0">
                  <span aria-hidden className={cx('absolute -left-[33px] top-1.5 h-4 w-4 rounded-full border-4 border-page', e.kind === 'approved' ? 'bg-primary' : e.kind === 'ai' ? 'bg-[#E8C27A]' : 'bg-[#9CC3A6]')} />
                  <p className="text-[16px] font-semibold">{e.text}</p>
                  <p className="tnum text-[14px] text-muted">{new Date(e.at).toLocaleString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'Europe/London' })}</p>
                </li>
              ))}
            </ol>
          )}
        </section>
      </div>
    </div>
  );
}
