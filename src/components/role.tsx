import Link from 'next/link';
import type { RoleCharges } from '../server/services/roles';
import type { AcceptedCandidateDTO } from '../server/dto/candidate';
import { Badge, Card, KV, Avatar, cx } from './ui';
import { credits, creditsLabel, gbp } from '../lib/format';

const LEVEL: Record<string, { label: string; tone: 'success' | 'neutral' | 'warning' | 'danger' }> = {
  specific: { label: 'Specific evidence', tone: 'success' },
  partial: { label: 'Partial evidence', tone: 'neutral' },
  unknown: { label: 'Unknown', tone: 'warning' },
  contradictory: { label: 'Conflicting', tone: 'danger' },
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

export function CompactPrice({ ch }: { ch: RoleCharges }) {
  if (ch.isReplacementRole) return <p className="text-[14px] text-muted">Replacement role · £0 · {ch.accepted} of {ch.maxIntros} intros</p>;
  return <p className="text-[14px] text-muted">{creditsLabel(ch.totalUnits)} / {gbp(ch.totalPence)} · Deposit {ch.depositPaid ? 'paid' : gbp(ch.depositPence)} · {ch.accepted} of {ch.maxIntros} intros · {ch.screeningsUsed} of {ch.includedScreenings} screenings</p>;
}

export function MatchCard({ m, href, actions }: { m: AcceptedCandidateDTO; href: string; actions?: React.ReactNode }) {
  return (
    <article className="rounded-xl border border-line bg-surface p-4 md:p-5">
      <div className="flex items-start gap-3">
        <Avatar label={m.identity?.fullName ?? null} />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <Link href={href} className="font-semibold no-underline">{m.identity ? m.identity.fullName : `Candidate ${m.roleScopedReference.slice(0, 9)}`}</Link>
            {m.confidence && <Badge tone={m.confidence === 'low' ? 'warning' : 'success'}>{m.confidence === 'high' ? 'High' : m.confidence === 'medium' ? 'Medium' : 'Low'} evidence coverage</Badge>}
            {m.needsClarification && <Badge tone="warning">{m.needsClarification}</Badge>}
            {m.introState && <Badge tone={m.introState === 'accepted' ? 'success' : 'neutral'}>Intro {m.introState}</Badge>}
            {m.screeningStatus && m.screeningStatus !== 'cancelled' && <Badge>Screening {m.screeningStatus}</Badge>}
          </div>
          <p className="mt-1 text-[15px]">{m.safeHeadline}</p>
          <p className="text-[13px] text-muted">{m.experienceBand} · {m.broadRegion} · {m.workModes.join(', ')}</p>
        </div>
      </div>
      <ul className="mt-3 space-y-2">
        {m.criteria.map((c) => (
          <li key={c.key} className="text-[14px]">
            <div className="flex flex-wrap items-center gap-2"><span className="font-medium">{c.label}</span><LevelBadge level={c.level} />{c.humanLevel && <Badge tone="primary">Screened: {LEVEL[c.humanLevel]?.label ?? c.humanLevel}</Badge>}</div>
            <p className="text-muted">{c.reasonSafe}</p>
          </li>
        ))}
      </ul>
      {m.unknowns.length > 0 && <p className="mt-2 text-[14px]"><span className="font-medium">Not enough evidence yet:</span> {m.unknowns.join(', ')}</p>}
      {actions && <div className="mt-4 flex flex-wrap gap-2">{actions}</div>}
    </article>
  );
}

export { credits };
