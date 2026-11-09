import Link from 'next/link';
import type { Ctx } from '../server/services/context';
import { candidateOnRole, simulationForCandidate } from '../server/views/client';
import { roleCharges } from '../server/services/roles';
import { PageHeader, Card, Badge, Notice, LinkButton, Tabs } from './ui';
import { LevelBadge, fitLabel } from './role';
import { RequestIntro, RequestScreening, RecordHire } from './role-actions';

/** Full role-specific anonymous evidence view. Identity appears only under an active grant for this role. */
export async function CandidateDetail({ ctx, roleId, candidateRef, base, view }: { ctx: Ctx; roleId: string; candidateRef: string; base: string; view?: string }) {
  const { candidateId, role, dto, introId, introState, counters, hiredStart } = await candidateOnRole(ctx, roleId, candidateRef);
  const sim = await simulationForCandidate(ctx, roleId, candidateId);
  const here = `${base}/roles/${roleId}/candidates/${candidateRef}`;
  const section = view === 'interview' && sim ? 'interview' : view === 'evidence' ? 'evidence' : 'overview';
  const ch = await roleCharges(ctx, roleId);
  const name = dto.identity ? dto.identity.fullName : dto.safeHeadline;
  return (
    <>
      <PageHeader back={{ href: `${base}/roles/${roleId}`, label: role.title }} title={name} subtitle={<span className="flex flex-wrap gap-2">{dto.identity ? dto.safeHeadline : 'Name hidden until they agree to meet you'} {dto.confidence && <Badge tone={dto.confidence === 'low' ? 'warning' : 'success'}>{dto.confidence === 'low' ? 'Little evidence so far' : 'Good evidence'}</Badge>}{dto.needsClarification && <Badge tone="warning">{dto.needsClarification}</Badge>}</span>} />
      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        <div className="min-w-0 space-y-4">
          <Tabs current={section} tabs={[{ key: 'overview', label: 'Overview', href: `${here}?view=overview` }, ...(sim ? [{ key: 'interview', label: 'Interview', href: `${here}?view=interview` }] : []), { key: 'evidence', label: 'Evidence', href: `${here}?view=evidence` }]} />
          {section === 'overview' && (
            <Card>
              {sim && <div className="mb-3 flex items-start gap-2"><span className="shrink-0 whitespace-nowrap"><Badge tone={fitLabel(sim.fitScore).tone}>{fitLabel(sim.fitScore).text}</Badge></span><span className="text-[15px]">{sim.summary}</span></div>}
              <p className="text-[16px]">{dto.safeSummary || 'We don’t know much yet.'}</p>
              <p className="mt-2 text-[14px] text-muted">{dto.experienceBand} · {dto.broadRegion} · {dto.workModes.join(', ')}</p>
              {dto.unknowns.length > 0 && <p className="mt-3 text-[14px]"><span className="font-medium">Not known yet:</span> {dto.unknowns.join(', ').toLowerCase()}. A phone screening can find out.</p>}
            </Card>
          )}
          {section === 'interview' && sim && (
            <Card title="Their simulated interview" action={<Badge tone={fitLabel(sim.fitScore).tone}>{fitLabel(sim.fitScore).text}</Badge>}>
              <p className="text-[15px]">{sim.summary}</p>
              <p className="mt-2 text-[13px] text-muted">A prediction built only from their real examples, to help you decide who to meet. It isn’t something they said.</p>
              <ol className="mt-3 space-y-3">
                {sim.answers.map((a, i) => (
                  <li key={i} className="text-[15px]">
                    <p className="font-medium">{a.question}</p>
                    <p className={a.grounded ? 'mt-1' : 'mt-1 text-muted'}>{a.grounded ? `“${a.answer}”` : a.answer}</p>
                  </li>
                ))}
              </ol>
              {sim.concerns.length > 0 && <p className="mt-3 text-[14px]"><span className="font-medium">Worth asking about:</span> {sim.concerns.join('; ').toLowerCase()}</p>}
            </Card>
          )}
          {section === 'evidence' && (
          <Card title="How they fit this role">
            <ul className="space-y-4">
              {dto.criteria.map((c) => (
                <li key={c.key}>
                  <div className="flex flex-wrap items-center gap-2"><span className="font-semibold">{c.label}</span><LevelBadge level={c.level} />{c.humanLevel && <Badge tone="primary">Checked on a phone screening</Badge>}</div>
                  <p className="text-[14px] text-muted">{c.reasonSafe}</p>
                  {dto.safeEvidence.filter((e) => c.evidenceIds.includes(e.id)).map((e) => (
                    <blockquote key={e.id} className="mt-2 border-l-4 border-line pl-3 text-[15px]">{e.claim}{e.uncertainty && <span className="mt-1 block text-[13px] text-warning">Worth asking about: {e.uncertainty}</span>}<span className="mt-1 block text-[12px] text-muted">In their own words, with names removed. Not checked with an employer.</span></blockquote>
                  ))}
                </li>
              ))}
            </ul>
          </Card>
          )}
        </div>
        <aside className="space-y-4">
          <Card title="What would you like to do?">
            <div className="flex flex-col gap-2">
              {!introState && <RequestIntro roleId={roleId} candidateRef={candidateRef} depositPaid={ch.depositPaid} holdExists={!!ch.holdUnits} depositUnits={ch.depositUnits} depositPence={ch.depositPence} disabledReason={dto.permittedActionFlags.canRequestIntro ? null : counters.accepted >= 10 ? 'You’ve met the 10 people included with this role.' : 'Not available'} />}
              {introState === 'pending' && <Notice>You’ve asked to meet. Waiting for their answer (they have 7 days).</Notice>}
              {(!dto.screeningStatus || dto.screeningStatus === 'cancelled') && <RequestScreening roleId={roleId} candidateRef={candidateRef} disabledReason={dto.permittedActionFlags.canRequestScreening ? null : 'All 5 included phone screenings are used.'} />}
              {dto.screeningStatus && dto.screeningStatus !== 'cancelled' && <p className="text-[15px]">Phone screening: {dto.screeningStatus}. {dto.screeningSummary ?? 'Your consultant will call them and let you know.'}</p>}
            </div>
          </Card>
          {dto.identity ? (
            <Card title="Contact details">
              <p className="font-semibold">{dto.identity.fullName}</p>
              <p className="text-[15px]">{dto.identity.email}</p>
              <p className="mt-2 text-[13px] text-muted">They shared this with you for {role.title} only.</p>
              {introId && <div className="mt-3 flex flex-wrap gap-2"><LinkButton href={`${base}/introductions/${introId}/prep`} variant="secondary">Interview prep</LinkButton>{hiredStart ? <span className="self-center text-[14px]">Hire recorded, start date {hiredStart}.</span> : <RecordHire introId={introId} label={dto.identity.fullName} />}</div>}
            </Card>
          ) : introState === 'withdrawn' ? <Notice tone="warning">This profile is no longer available for this role.</Notice> : <Card title="Name and contact details"><p className="text-[15px]">Hidden until they agree to meet you. Press “Ask to meet” and they decide.</p></Card>}
          <p className="text-[13px] text-muted"><Link href={`${base}/roles/${roleId}`}>Back to all candidates</Link></p>
        </aside>
      </div>
    </>
  );
}
