import Link from 'next/link';
import { pageViewer } from '@/server/page-auth';
import { onboardingView } from '@/server/services/onboarding';
import { connectedAi } from '@/server/connectors/drafts';
import { issuer } from '@/server/connectors/oauth';
import { cx } from '@/components/ui';
import { ChecklistAi, ApproveAll, Extras, QuestionDeck, AlwaysOn, Question, AddSomething } from '@/components/onboarding-doc';

export const dynamic = 'force-dynamic';
const PAGE = 12;

/**
 * Your mini-me. By default: what it knows, as a feed of short topics, built up over relaxed chats with
 * their own AI. The question list is only a guide for the AI; "Answer some yourself" opens it for typing.
 */
export default async function Onboarding({ searchParams }: { searchParams: Promise<{ ai?: string; s?: string; mode?: string; a?: string; n?: string }> }) {
  const { ctx } = await pageViewer('candidate');
  const [v, connected, sp] = await Promise.all([onboardingView(ctx), connectedAi(ctx), searchParams]);
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
  const ai = (
    <>
      <div className="mt-6"><ChecklistAi connected={connected} connectorUrl={`${issuer()}/mcp`} autoOpen={sp.ai === '1'} waiting={v.answered < v.total || v.toCheck > 0} /></div>
      {connected && <div className="mt-3"><AlwaysOn provider={connected} /></div>}
      {v.toCheck > 0 && (
        <div className="mt-4 flex flex-col gap-3 rounded-3xl bg-warning-tint px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-[17px]"><span className="font-semibold">Your AI wrote {v.toCheck} new thing{v.toCheck > 1 ? 's' : ''}.</span> Have a look, or if you trust it:</p>
          <ApproveAll count={v.toCheck} />
        </div>
      )}
    </>
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

  // Default: what it knows. Area chips show coverage and filter the feed.
  const areas = [...v.sections.map((s) => ({ key: s.key, title: s.title, have: s.questions.filter((q) => q.answer).length, of: s.questions.length })), { key: 'extras', title: 'Extras', have: v.extras.length, of: 0 }];
  const area = areas.find((a) => a.key === sp.a)?.key ?? null;
  const shown = v.feed.filter((f) => !area || f.areaKey === area);
  const n = Math.max(PAGE, Number(sp.n) || PAGE);
  const href = (q: Record<string, string | null>) => `/candidate/onboarding?${new URLSearchParams(Object.entries(q).filter(([, x]) => x) as [string, string][]).toString()}`;
  return (
    <div className="mx-auto max-w-[1080px]">
      {header}
      {ai}
      <section aria-labelledby="knows" className="mt-8">
        <div className="flex flex-wrap items-baseline justify-between gap-3">
          <h2 id="knows">What your mini-me knows</h2>
          <Link href="/candidate/onboarding?mode=type" className="text-[16px]">Prefer to type? Answer some yourself</Link>
        </div>
        <nav aria-label="Areas" className="shelf -mx-5 mt-4 flex gap-2 overflow-x-auto px-5 pb-1 lg:mx-0 lg:flex-wrap lg:px-0">
          <Link href={href({})} aria-current={!area ? 'true' : undefined} className={cx('shrink-0 rounded-full px-4 py-2 text-[15px] font-semibold no-underline', !area ? 'bg-primary text-white' : 'bg-surface text-ink')}>Everything</Link>
          {areas.map((a) => {
            const dots = a.of ? Math.round((a.have / a.of) * 4) : Math.min(4, a.have);
            return (
              <Link key={a.key} href={href({ a: a.key })} aria-current={area === a.key ? 'true' : undefined} className={cx('flex shrink-0 items-center gap-2 rounded-full px-4 py-2 text-[15px] no-underline', area === a.key ? 'bg-primary text-white' : 'bg-surface text-ink')}>
                {a.title}<span aria-label={a.of ? `${a.have} of ${a.of} covered` : `${a.have} shared`} className="flex gap-0.5">{[0, 1, 2, 3].map((i) => <span key={i} className={cx('h-1.5 w-1.5 rounded-full', i < dots ? (area === a.key ? 'bg-white' : 'bg-primary') : (area === a.key ? 'bg-white/35' : 'bg-line'))} />)}</span>
              </Link>
            );
          })}
        </nav>
        {shown.length === 0 ? (
          <div className="mt-5 rounded-3xl bg-surface p-8 text-center shadow-[0_8px_24px_rgb(18_37_29/0.06)]">
            <p className="font-display text-[22px] font-semibold">Nothing here yet</p>
            <p className="mt-2 text-[16px] text-muted">{connected ? `Say “Let’s build up my Elsewhere profile” to your ${connected} and chat. What it learns appears here.` : 'Connect your ChatGPT or Claude above, or add something yourself.'}</p>
          </div>
        ) : (
          <ul className="mt-5 grid gap-4 lg:grid-cols-2">
            {shown.slice(0, n).map((f, i) => (
              <li key={f.key} style={{ animationDelay: `${Math.min(i, 6) * 30}ms` }} className="rise-in rounded-3xl bg-surface px-6 shadow-[0_8px_24px_rgb(18_37_29/0.06)]">
                <p className="pt-5 text-[13px] font-semibold uppercase tracking-wide text-muted">{f.area}</p>
                <ul className="-mt-4"><Question q={f} /></ul>
              </li>
            ))}
          </ul>
        )}
        <div className="mt-5 flex flex-wrap items-center gap-3">
          {shown.length > n && <Link href={href({ a: area, n: String(n + PAGE) })} className="text-[16px] font-semibold">Show more ({shown.length - n})</Link>}
          <AddSomething />
        </div>
      </section>
    </div>
  );
}
