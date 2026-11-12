import Link from 'next/link';
import type { RoleCharges } from '../server/services/roles';
import type { AcceptedCandidateDTO } from '../server/dto/candidate';
import { ChevronRight } from 'lucide-react';
import { Badge, Card, KV, Avatar, cx } from './ui';
import { FoldArt } from './fold-art';
import { codename, paletteFor, variantFor } from '../lib/codename';
import { credits, creditsLabel, gbp } from '../lib/format';

const LEVEL: Record<string, { label: string; tone: 'success' | 'neutral' | 'warning' | 'danger' }> = {
  specific: { label: 'Strong example', tone: 'success' },
  partial: { label: 'Some evidence', tone: 'neutral' },
  unknown: { label: 'Not known yet', tone: 'warning' },
  contradictory: { label: 'Mixed signals', tone: 'danger' },
};

export function LevelBadge({ level }: { level: string }) {
  const l = LEVEL[level] ?? LEVEL.unknown;
  return <Badge tone={l.tone}>{l.label}</Badge>;
}

/** "Your hire price" panel. Every amount comes from the authoritative quote DTO. */
export function ChargesPanel({ ch, replacementOf }: { ch: RoleCharges; replacementOf?: string | null }) {
  if (ch.isReplacementRole) {
    return (
      <Card title="Your hire price">
        <p className="text-[15px]">Covered by replacement{replacementOf ? ` for ${replacementOf}` : ''}.</p>
        <KV rows={[['Total', '0 credits / £0'], ['Accepted introductions', `${ch.accepted} of ${ch.maxIntros}`], ['Pending requests', `${ch.pending} awaiting a response`], ['Screenings', `${ch.screeningsUsed} of ${ch.includedScreenings} used or booked`]]} />
      </Card>
    );
  }
  const depositPaid = ch.depositPaid;
  const cmp = ch.comparison;
  const pctLine = cmp.isAbove ? `${gbp(cmp.differencePence)} above this comparison` : `This ${ch.serviceMode === 'full_search' ? 'full-search' : 'standard'} service costs about ${cmp.percentOfFee}% of that fee`;
  return (
    <Card title="Your hire price">
      <KV rows={[
        ['Quoted annual salary', gbp(ch.salaryPence)],
        ['Service', ch.serviceMode === 'full_search' ? 'Full search' : 'Standard'],
        ['Total', `${creditsLabel(ch.totalUnits)} / ${gbp(ch.totalPence)}`],
        ['Deposit', `${creditsLabel(ch.depositUnits)} / ${gbp(ch.depositPence)}`],
        ['Deposit paid', depositPaid ? gbp(ch.depositPence) : '£0'],
        ['Remaining for first hire', ch.firstHirePaid ? '£0' : `${creditsLabel(ch.remainingUnits)} / ${gbp(ch.remainingPence)}`],
      ]} />
      <div className="mt-2 space-y-1 text-[14px] text-muted">
        {!depositPaid && !ch.holdUnits && <p>{gbp(ch.depositPence)} charged when the first introduction is accepted.</p>}
        {ch.holdUnits && !depositPaid && <p className="rounded-md bg-info-tint px-2 py-1 text-ink">Reserved, not charged: {creditsLabel(ch.holdUnits)}</p>}
        {depositPaid && ch.isExtraRole && !ch.firstHirePaid && ch.accepted === 0 && <p>Paid when this extra role opened.</p>}
        {ch.firstHirePaid && <p>Another hire is a new full price.</p>}
        {ch.serviceMode === 'full_search' && <p>Full search is 1.5 times the standard credit price. The deposit stays at 25% of the standard credits.</p>}
      </div>
      <div className="mt-3 border-t border-line pt-3">
        <KV rows={[['Accepted introductions', `${ch.accepted} of ${ch.maxIntros}`], ['Pending requests', `${ch.pending} awaiting a response`], ['Screenings', `${ch.screeningsUsed} of ${ch.includedScreenings} used or booked`]]} />
      </div>
      {ch.roleDefaultMode === 'standard' && !ch.firstHirePaid && (
        <p className="mt-3 rounded-lg bg-page px-3 py-2 text-[14px]">Full search total: {creditsLabel(ch.fullSearchPreview.totalUnits)} / {gbp(ch.fullSearchPreview.totalPence)}. Already paid: {gbp(ch.paidPence)}. Remaining on hire: {gbp(ch.fullSearchPreview.remainingPence)}.</p>
      )}
      <div className="mt-3 border-t border-line pt-3 text-[14px]">
        <p>Illustrative fee at {cmp.feeBps / 100}% of {gbp(ch.salaryPence)}: {gbp(cmp.feePence)}</p>
        <p className={cx(cmp.isAbove ? 'text-warning' : 'text-ink')}>{pctLine}</p>
        {ch.existingComparison && <p className="mt-1">Your existing agreement at {ch.existingComparison.feeBps / 100}%: {gbp(ch.existingComparison.feePence)}. {ch.existingComparison.isAbove ? `${gbp(ch.existingComparison.differencePence)} above this comparison` : `About ${ch.existingComparison.percentOfFee}% of that fee`}.</p>}
        <p className="mt-1 text-muted">Actual agency agreements vary. VAT treatment to be agreed.</p>
      </div>
    </Card>
  );
}

/** The price in one sentence, with the full breakdown one tap away. */
export function SimplePrice({ ch, replacementOf }: { ch: RoleCharges; replacementOf?: string | null }) {
  const dep = creditsLabel(ch.depositUnits);
  const line = ch.isReplacementRole ? `Free: this replaces an earlier hire${replacementOf ? ` (${replacementOf})` : ''}.`
    : ch.firstHirePaid ? 'Your hire is done. Hiring another person for this role would cost the full amount again.'
    : ch.depositPaid ? `${dep} already used. ${creditsLabel(ch.remainingUnits)} more when you hire.`
    : ch.holdUnits ? `${dep} set aside (not used) while you wait for an answer.`
    : `${dep} of that is used when someone agrees to meet you. The rest when you hire.`;
  return (
    <Card title="What it costs">
      <p className="text-[28px] font-semibold leading-tight">{ch.isReplacementRole ? 'Free' : creditsLabel(ch.totalUnits)}</p>
      <p className="text-[14px] text-muted">{ch.isReplacementRole ? 'Replacement role' : 'if you hire someone for this role'}</p>
      <p className="mt-3 text-[15px]">{line}</p>
      <dl className="mt-4 space-y-2 border-t border-line pt-3 text-[15px]">
        <div className="flex justify-between gap-2"><dt className="text-muted">People you can meet</dt><dd>{ch.accepted} of {ch.maxIntros}</dd></div>
        <div className="flex justify-between gap-2"><dt className="text-muted">Screening coupons left</dt><dd>{Math.max(0, ch.includedScreenings - ch.screeningsUsed)} of {ch.includedScreenings}</dd></div>
        {ch.pending > 0 && <div className="flex justify-between gap-2"><dt className="text-muted">Waiting for an answer</dt><dd>{ch.pending}</dd></div>}
      </dl>
      <details className="mt-4"><summary className="cursor-pointer text-[14px] text-link">See the full breakdown</summary><div className="mt-2"><ChargesPanel ch={ch} replacementOf={replacementOf} /></div></details>
    </Card>
  );
}

export function CompactPrice({ ch }: { ch: RoleCharges }) {
  if (ch.isReplacementRole) return <p className="text-[15px]">Free replacement role · {ch.accepted} of {ch.maxIntros} people met</p>;
  return <p className="text-[15px]"><span className="font-semibold">{creditsLabel(ch.totalUnits)}</span> if you hire · {ch.accepted} of {ch.maxIntros} people met · {Math.max(0, ch.includedScreenings - ch.screeningsUsed)} screening coupons left</p>;
}

export function MatchCard({ m, href, actions }: { m: AcceptedCandidateDTO; href: string; actions?: React.ReactNode }) {
  const known = m.criteria.filter((c) => c.level !== 'unknown' || c.humanLevel);
  return (
    <article className="rounded-xl border border-line bg-surface p-4 md:p-5">
      <div className="flex items-start gap-3">
        <Avatar label={m.identity?.fullName ?? null} />
        <div className="min-w-0 flex-1">
          <Link href={href} className="text-[17px] font-semibold leading-snug text-ink no-underline hover:underline">{m.identity ? m.identity.fullName : m.safeHeadline}</Link>
          <p className="mt-0.5 text-[14px] text-muted">{m.identity ? m.safeHeadline : 'Name hidden until they agree to meet you'} · {m.experienceBand} · {m.broadRegion}</p>
          <div className="mt-2 flex flex-wrap gap-2">
            {m.confidence && <Badge tone={m.confidence === 'low' ? 'warning' : 'success'}>{m.confidence === 'low' ? 'Little evidence so far' : 'Good evidence'}</Badge>}
            {m.needsClarification && <Badge tone="warning">{m.needsClarification}</Badge>}
            {m.introState && <Badge tone={m.introState === 'accepted' ? 'success' : 'neutral'}>{m.introState === 'accepted' ? 'Agreed to meet you' : m.introState === 'pending' ? 'Asked to meet' : `Meeting request ${m.introState}`}</Badge>}
            {m.screeningStatus && m.screeningStatus !== 'cancelled' && <Badge>{m.screeningStatus === 'returned' ? 'Screened: not right' : `BondMoran screening ${m.screeningStatus}`}</Badge>}
          </div>
        </div>
      </div>
      {known.length > 0 && (
        <ul className="mt-3 space-y-2">
          {known.map((c) => (
            <li key={c.key} className="text-[14px]">
              <div className="flex flex-wrap items-center gap-2"><span className="font-medium">{c.label}</span><LevelBadge level={c.level} />{c.humanLevel && <Badge tone="primary">Phone screening: {LEVEL[c.humanLevel]?.label ?? c.humanLevel}</Badge>}</div>
              <p className="text-muted">{c.reasonSafe}</p>
            </li>
          ))}
        </ul>
      )}
      <p className="mt-2 text-[14px] text-muted">{known.length === 0 ? 'Not much known yet. A BondMoran screening could tell you more.' : m.unknowns.length ? `Not known yet: ${m.unknowns.join(', ').toLowerCase()}.` : ''}</p>
      {actions && <div className="mt-4 flex flex-wrap gap-2">{actions}</div>}
    </article>
  );
}

export { credits };

export type SimCardView = { fitScore: number; summary: string; concerns: string[]; answers: { question: string; answer: string; grounded: boolean; score?: number | null; reason?: string | null }[]; provider: string };

export const fitLabel = (s: number) => (s >= 75 ? { text: 'Great fit', tone: 'success' as const } : s >= 50 ? { text: 'Good fit', tone: 'success' as const } : { text: 'Possible fit', tone: 'neutral' as const });

/** The name to show: their real name once they've accepted, otherwise a friendly made-up one. */
export const personName = (m: AcceptedCandidateDTO) => (m.identity ? m.identity.fullName : codename(m.roleScopedReference));

/** One row: rank, artwork, name, one line of evidence, fit. Tap to open. */
export function PersonRow({ rank, m, sim, href, index = 0 }: { rank?: number; m: AcceptedCandidateDTO; sim?: SimCardView | null; href: string; index?: number }) {
  const fit = sim ? fitLabel(sim.fitScore) : null;
  const status = m.introState === 'accepted' ? 'Agreed to meet you' : m.introState === 'pending' ? 'Asked to meet' : null;
  return (
    <Link href={href} style={{ animationDelay: `${Math.min(index, 8) * 30}ms` }} className="rise-in group flex min-h-[76px] items-center gap-4 rounded-3xl px-3 py-2.5 no-underline hover:bg-surface">
      {rank !== undefined && <span aria-label={`Number ${rank}`} className="tnum flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#E1E8C9] font-display text-[16px] font-semibold text-ink">{rank}</span>}
      <FoldArt id={`row-${m.roleScopedReference}`} palette={paletteFor(m.roleScopedReference)} variant={variantFor(m.roleScopedReference)} className="h-14 w-14 shrink-0 rounded-2xl" />
      <span className="min-w-0 flex-1">
        <span className="block truncate font-display text-[19px] font-semibold tracking-[-0.02em] text-ink">{personName(m)}</span>
        <span className="block truncate text-[15px] text-muted">{status ?? m.safeHeadline}</span>
      </span>
      {sim && sim.provider !== 'anthropic' && <span className="hidden whitespace-nowrap rounded-full bg-page px-2.5 py-0.5 text-[13px] text-muted sm:inline" title="Answers are the closest examples from their profile, without AI. Their AI interview replaces it when ready.">Basic interview</span>}
      {fit && <span className={cx('hidden whitespace-nowrap text-[14px] font-semibold sm:inline', fit.tone === 'success' ? 'text-primary' : 'text-muted')}>{fit.text}</span>}
      <ChevronRight aria-hidden className="shrink-0 text-muted transition-transform group-hover:translate-x-0.5" />
    </Link>
  );
}

/** A big cover in the "Top picks" shelf: artwork edge to edge, name and line on a dark scrim. */
export function PersonCover({ m, sim, href, index = 0 }: { m: AcceptedCandidateDTO; sim?: SimCardView | null; href: string; index?: number }) {
  const fit = sim ? fitLabel(sim.fitScore) : null;
  return (
    <Link href={href} style={{ animationDelay: `${Math.min(index, 3) * 30}ms` }} className="rise-in lift relative block h-[300px] w-[min(76vw,300px)] shrink-0 overflow-hidden rounded-3xl no-underline shadow-[0_8px_24px_rgb(18_37_29/0.08)] lg:h-[340px] lg:w-[320px]">
      <FoldArt id={`cover-${m.roleScopedReference}`} palette={paletteFor(m.roleScopedReference)} variant={variantFor(m.roleScopedReference)} className="absolute inset-0 h-full w-full" />
      <span aria-hidden className="absolute inset-0 bg-[linear-gradient(180deg,rgb(10_36_25/0)_40%,rgb(10_36_25/0.55)_62%,rgb(10_36_25/0.92)_100%)]" />
      <span className="absolute inset-x-0 bottom-0 p-5 text-white">
        {fit && <span className="mb-2 inline-block rounded-full bg-white/15 px-3 py-1 text-[13px] font-semibold backdrop-blur-sm">{fit.text}</span>}
        <span className="block font-display text-[26px] font-semibold leading-tight tracking-[-0.02em]">{personName(m)}</span>
        <span className="mt-1 line-clamp-2 block text-[15px] leading-snug text-white/90">{m.safeHeadline}</span>
      </span>
    </Link>
  );
}
