import Link from 'next/link';
import type { Ctx } from '../server/services/context';
import { candidateOnRole } from '../server/views/client';
import { roleCharges } from '../server/services/roles';
import { PageHeader, Card, Badge, Notice, LinkButton } from './ui';
import { LevelBadge } from './role';
import { RequestIntro, RequestScreening, RecordHire } from './role-actions';

/** Full role-specific anonymous evidence view. Identity appears only under an active grant for this role. */
export async function CandidateDetail({ ctx, roleId, ref, base }: { ctx: Ctx; roleId: string; ref: string; base: string }) {
  const { role, dto, introId, introState, counters } = await candidateOnRole(ctx, roleId, ref);
  const ch = await roleCharges(ctx, roleId);
  const name = dto.identity ? dto.identity.fullName : `Candidate ${dto.roleScopedReference.slice(0, 9)}`;
  return (
    <>
      <PageHeader back={{ href: `${base}/roles/${roleId}`, label: role.title }} title={name} subtitle={<span className="flex flex-wrap gap-2">{dto.safeHeadline} {dto.confidence && <Badge tone={dto.confidence === 'low' ? 'warning' : 'success'}>{dto.confidence} evidence coverage</Badge>}{dto.needsClarification && <Badge tone="warning">{dto.needsClarification}</Badge>}</span>} />
      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        <div className="space-y-4">
          <Card title="Approved summary"><p className="text-[15px]">{dto.safeSummary || 'Not enough evidence yet.'}</p><p className="mt-2 text-[14px] text-muted">{dto.experienceBand} · {dto.broadRegion} · {dto.workModes.join(', ')}</p></Card>
          <Card title="Evidence against this role">
            <ul className="space-y-4">
              {dto.criteria.map((c) => (
                <li key={c.key}>
                  <div className="flex flex-wrap items-center gap-2"><span className="font-semibold">{c.label}</span><LevelBadge level={c.level} />{c.humanLevel && <Badge tone="primary">Screened</Badge>}</div>
                  <p className="text-[14px] text-muted">{c.reasonSafe}</p>
                  {dto.safeEvidence.filter((e) => c.evidenceIds.includes(e.id)).map((e) => (
                    <blockquote key={e.id} className="mt-2 border-l-4 border-line pl-3 text-[15px]">{e.claim}{e.uncertainty && <span className="mt-1 block text-[13px] text-warning">Uncertainty: {e.uncertainty}</span>}<span className="mt-1 block text-[12px] text-muted">From the candidate&apos;s own answer, reviewed for anonymity. Not externally verified.</span></blockquote>
                  ))}
                </li>
              ))}
            </ul>
          </Card>
          {dto.unknowns.length > 0 && <Card title="Missing information"><p className="text-[15px]">Not enough evidence yet for {dto.unknowns.join(', ').toLowerCase()}. Unknown is not weak. A screening or conversation can fill this in.</p></Card>}
        </div>
        <aside className="space-y-4">
          <Card title="Next steps">
            <div className="flex flex-col gap-2">
              {!introState && <RequestIntro roleId={roleId} candidateRef={ref} depositPaid={ch.depositPaid} holdExists={!!ch.holdUnits} depositUnits={ch.depositUnits} depositPence={ch.depositPence} disabledReason={dto.permittedActionFlags.canRequestIntro ? null : counters.accepted >= 10 ? 'This role has used all 10 accepted introductions.' : 'Not available'} />}
              {introState === 'pending' && <Notice>Introduction requested. Awaiting the candidate&apos;s response.</Notice>}
              {(!dto.screeningStatus || dto.screeningStatus === 'cancelled') && <RequestScreening roleId={roleId} candidateRef={ref} disabledReason={dto.permittedActionFlags.canRequestScreening ? null : 'All five included screenings are used or booked.'} />}
              {dto.screeningStatus && dto.screeningStatus !== 'cancelled' && <p className="text-[15px]">Screening: {dto.screeningStatus}. {dto.screeningSummary ?? 'Your consultant has this request.'}</p>}
            </div>
          </Card>
          {dto.identity ? (
            <Card title="Identity for this role">
              <p className="font-semibold">{dto.identity.fullName}</p>
              <p className="text-[15px]">{dto.identity.email}</p>
              <p className="mt-2 text-[13px] text-muted">Shared by the candidate for {role.title} only. No CV, phone number or conversation is shared.</p>
              {introId && <div className="mt-3 flex flex-wrap gap-2"><LinkButton href={`${base}/introductions/${introId}/prep`} variant="secondary">Interview prep</LinkButton><RecordHire introId={introId} label={dto.identity.fullName} /></div>}
            </Card>
          ) : introState === 'withdrawn' ? <Notice tone="warning">This profile is no longer available for this role.</Notice> : <Card title="Identity"><p className="text-[15px]">Hidden until the candidate accepts an introduction for this role.</p></Card>}
          <p className="text-[13px] text-muted"><Link href={`${base}/roles/${roleId}`}>Back to all matches</Link></p>
        </aside>
      </div>
    </>
  );
}
