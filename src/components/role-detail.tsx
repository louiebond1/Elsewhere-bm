import Link from 'next/link';
import { eq, and } from 'drizzle-orm';
import type { Ctx } from '../server/services/context';
import * as S from '../server/db/schema';
import { roleForActor, roleCharges, criteriaFor, openOrdinaryRoleCount } from '../server/services/roles';
import { roleMatches, pipelineForRole, screeningsForRole, activityForRole } from '../server/views/client';
import { activeContractForClient } from '../server/services/contracts';
import { PageHeader, Tabs, Badge, Card, Empty, Notice, LinkButton } from './ui';
import { ChargesPanel, CompactPrice, MatchCard } from './role';
import { ActivateRole, CloseRole, ReopenRole, UpgradeRole, RequestIntro, RequestScreening, AutoPicks, StageMenu, RecordHire, CancelIntro } from './role-actions';
import { gbp, label, date, relative } from '../lib/format';
import { prototype } from '../config/prototype';

export async function RoleDetail({ ctx, roleId, tab, base, consultant }: { ctx: Ctx; roleId: string; tab: string; base: string; consultant?: boolean }) {
  const role = await roleForActor(ctx, roleId);
  const crit = await criteriaFor(ctx, roleId);
  const isDraft = role.status === 'draft';
  const ch = isDraft ? null : await roleCharges(ctx, roleId);
  let replacementOf: string | null = null;
  if (role.isReplacementRole && role.replacementCaseId) {
    const [rc] = await ctx.tx.select().from(S.replacementCases).where(eq(S.replacementCases.id, role.replacementCaseId));
    const [h] = rc ? await ctx.tx.select({ roleId: S.hires.roleId }).from(S.hires).where(eq(S.hires.id, rc.originalHireId)) : [];
    const [orig] = h ? await ctx.tx.select({ key: S.roles.vacancyKey }).from(S.roles).where(eq(S.roles.id, h.roleId)) : [];
    replacementOf = orig?.key ?? null;
  }
  const header = (
    <PageHeader back={{ href: consultant ? '/consultant/home' : '/client/roles', label: consultant ? 'Work queue' : 'Roles' }} title={role.title}
      subtitle={<span className="flex flex-wrap items-center gap-2">{role.vacancyKey} · {gbp(role.salaryPence)} · {label(role.workMode)}, {label(role.locationRegion)} <Badge tone={role.status === 'open' ? 'success' : 'neutral'}>{label(role.status)}</Badge>{role.isExtraRole && <Badge>Extra role</Badge>}{role.isReplacementRole && <Badge tone="success">Replacement</Badge>}{role.defaultServiceMode === 'full_search' && <Badge tone="primary">Full search</Badge>}</span>}
      actions={<>
        {isDraft && <LinkButton href={`${base}/roles/${roleId}/edit`} variant="secondary">Edit draft</LinkButton>}
        {!isDraft && role.status === 'open' && <LinkButton href={`${base}/roles/${roleId}/edit`} variant="secondary">Edit brief</LinkButton>}
        {ch && role.status === 'open' && role.defaultServiceMode === 'standard' && !role.isReplacementRole && <UpgradeRole roleId={roleId} ch={ch} />}
        {role.status === 'open' && <CloseRole roleId={roleId} />}
        {role.status === 'closed' && <ReopenRole roleId={roleId} />}
      </>} />
  );

  if (isDraft) {
    const contract = await activeContractForClient(ctx, role.clientId);
    const { quoteForRole } = await import('../server/services/roles');
    const q = contract?.creditRatePence ? quoteForRole(role, role.defaultServiceMode, contract) : null;
    const extra = contract ? (await openOrdinaryRoleCount(ctx, role.clientId)) >= contract.includedOpenRoles : false;
    return (
      <>
        {header}
        <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
          <Card title="Draft brief">
            <p className="text-[15px]">{role.briefText || 'No brief yet.'}</p>
            <h4 className="mt-3 font-semibold">Outcomes</h4><ul className="list-disc pl-5 text-[15px]">{role.outcomes.map((o) => <li key={o}>{o}</li>)}</ul>
            <h4 className="mt-3 font-semibold">Criteria</h4><ul className="text-[15px]">{crit.map((c) => <li key={c.id}>{c.label} · {c.importance} · weight {c.weight}</li>)}</ul>
            {crit.length < 3 && <Notice tone="warning">Approve 3 to 6 criteria before activating.</Notice>}
          </Card>
          <Card title="Your hire price">
            {q ? <><p className="text-[15px]">Total {Number(q.total) / 10000} credits / {gbp(q.totalPence)}. Deposit {Number(q.deposit) / 10000} credits / {gbp(q.depositPence)}.</p>
              <p className="mt-2 text-[14px] text-muted">{extra ? `This would be an extra role: ${gbp(q.depositPence)} is charged at activation.` : 'Inside your included open roles: no deposit yet.'}</p>
              <div className="mt-3"><ActivateRole roleId={roleId} willBeExtra={extra} depositUnits={q.deposit.toString()} depositPence={q.depositPence.toString()} base={base} /></div></>
              : <Notice tone="warning">No active contract.</Notice>}
          </Card>
        </div>
      </>
    );
  }

  const tabs = [
    { key: 'matches', label: 'Matches', href: `${base}/roles/${roleId}?tab=matches` },
    { key: 'pipeline', label: 'Pipeline', href: `${base}/roles/${roleId}?tab=pipeline` },
    { key: 'screenings', label: 'Screenings', href: `${base}/roles/${roleId}?tab=screenings` },
    { key: 'activity', label: 'Activity', href: `${base}/roles/${roleId}?tab=activity` },
    ...(consultant ? [{ key: 'review', label: 'Consultant review', href: `${base}/roles/${roleId}?tab=review` }] : []),
  ];
  let body: React.ReactNode = null;
  if (tab === 'matches') {
    const { strong, worth } = await roleMatches(ctx, roleId);
    const intoLimit = ch!.accepted >= ch!.maxIntros ? `This role has used all ${ch!.maxIntros} accepted introductions.` : ch!.accepted + ch!.pending >= ch!.maxIntros ? 'Pending requests reserve the remaining introductions.' : role.status !== 'open' ? 'This role is closed.' : null;
    const scrLimit = ch!.screeningsUsed >= ch!.includedScreenings ? 'All five included screenings are used or booked.' : null;
    const card = (m: (typeof strong)[number]) => (
      <MatchCard key={m.roleScopedReference} m={m} href={`${base}/roles/${roleId}/candidates/${m.roleScopedReference}`} actions={<>
        <LinkButton href={`${base}/roles/${roleId}/candidates/${m.roleScopedReference}`} variant="secondary">View evidence</LinkButton>
        {!m.introState && <RequestIntro roleId={roleId} candidateRef={m.roleScopedReference} depositPaid={ch!.depositPaid} holdExists={!!ch!.holdUnits} depositUnits={ch!.depositUnits} depositPence={ch!.depositPence} disabledReason={m.permittedActionFlags.canRequestIntro ? null : intoLimit ?? 'Not available'} />}
        {(!m.screeningStatus || m.screeningStatus === 'cancelled') && <RequestScreening roleId={roleId} candidateRef={m.roleScopedReference} disabledReason={m.permittedActionFlags.canRequestScreening ? null : scrLimit ?? 'Not available'} />}
      </>} />
    );
    body = (
      <div className="space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-2"><p className="text-[14px] text-muted">Evidence is shown against each criterion. Unknown means not enough evidence yet, never a weak candidate.</p>{role.status === 'open' && <AutoPicks roleId={roleId} slotsLeft={prototype.includedScreenings - ch!.screeningsUsed} />}</div>
        <section><h3 className="mb-3">Evidence-backed matches</h3>{strong.length ? <div className="space-y-3">{strong.map(card)}</div> : <Empty>No suitable profiles to show yet. Your consultant can review the brief.</Empty>}</section>
        <section><h3 className="mb-1">Worth a conversation</h3><p className="mb-3 text-[14px] text-muted">Little evidence so far, but relevant to this role. A conversation could show more.</p>{worth.length ? <div className="space-y-3">{worth.map(card)}</div> : <Empty>No low-information profiles for this role.</Empty>}</section>
      </div>
    );
  } else if (tab === 'pipeline') {
    const rows = await pipelineForRole(ctx, roleId);
    const stages = ['introduced', 'interview', 'offer', 'hired'];
    const active = rows.filter((r) => r.state === 'accepted' || r.hired);
    const pending = rows.filter((r) => r.state === 'pending');
    const past = rows.filter((r) => !['accepted', 'pending'].includes(r.state) && !r.hired);
    body = (
      <div className="space-y-6">
        {pending.length > 0 && <Card title="Awaiting candidate response">{pending.map((r) => <div key={r.introId} className="flex flex-wrap items-center justify-between gap-2 border-b border-line py-2 last:border-0"><span>{r.label} · requested {relative(r.requestedAt, ctx.now)} · expires {date(r.expiresAt)}</span><CancelIntro introId={r.introId} /></div>)}</Card>}
        <div className="grid gap-3 md:grid-cols-4">
          {stages.map((st) => (
            <div key={st} className="rounded-xl border border-line bg-surface p-3">
              <h4 className="mb-2 text-[15px] font-semibold">{label(st)} <span className="text-muted">{active.filter((r) => (r.hired ? 'hired' : r.stage) === st).length}</span></h4>
              <div className="space-y-2">
                {active.filter((r) => (r.hired ? 'hired' : r.stage) === st).map((r) => (
                  <div key={r.introId} className="rounded-lg border border-line p-3 text-[14px]">
                    <div className="font-semibold">{r.label}</div>
                    {r.ref && <Link href={`${base}/roles/${roleId}/candidates/${r.ref}`} className="text-[13px]">Profile</Link>}
                    {r.identified && <> · <Link href={`${base}/introductions/${r.introId}/prep`} className="text-[13px]">Interview prep</Link></>}
                    {!r.hired && r.identified && <div className="mt-2 space-y-2"><StageMenu introId={r.introId} stage={r.stage ?? 'introduced'} />{r.stage !== 'rejected' && <RecordHire introId={r.introId} label={r.label} />}</div>}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
        {past.length > 0 && <details className="rounded-xl border border-line bg-surface p-4"><summary className="cursor-pointer font-medium">Rejected, withdrawn, declined and expired ({past.length})</summary><ul className="mt-2 text-[14px]">{past.map((r) => <li key={r.introId} className="py-1">{r.label} · {label(r.state)}{r.stage === 'rejected' ? ' · rejected' : ''}</li>)}</ul></details>}
      </div>
    );
  } else if (tab === 'screenings') {
    const rows = await screeningsForRole(ctx, roleId);
    body = rows.length === 0 ? <Empty>No screenings yet. Five human screenings are included for this role.</Empty> : (
      <div className="space-y-3">{rows.map((s) => (
        <Card key={s.id} title={`Candidate ${s.ref.slice(0, 9)}`} action={<Badge tone={s.status === 'completed' ? 'success' : 'neutral'}>{label(s.status)}</Badge>}>
          <p className="text-[15px]">{s.status === 'completed' ? s.summarySafe : s.status === 'cancelled' ? 'Cancelled before completion. The slot was released.' : 'Your consultant has this request.'}</p>
          {consultant && <Link href={`/consultant/screenings/${s.id}`} className="text-[14px]">Open screening</Link>}
        </Card>
      ))}</div>
    );
  } else if (tab === 'activity') {
    const rows = await activityForRole(ctx, roleId);
    body = rows.length === 0 ? <Empty>No activity yet.</Empty> : <ul className="divide-y divide-line rounded-xl border border-line bg-surface">{rows.map((r) => <li key={r.id} className="flex justify-between gap-3 px-4 py-3 text-[15px]"><span>{r.label}</span><span className="text-muted">{date(r.at)}</span></li>)}</ul>;
  } else if (tab === 'review' && consultant) {
    const { ConsultantRoleReview } = await import('./consultant-review');
    body = <ConsultantRoleReview ctx={ctx} roleId={roleId} />;
  }
  return (
    <>
      {header}
      <div className="mb-4 lg:hidden">{ch && <CompactPrice ch={ch} />}<details className="mt-2"><summary className="cursor-pointer text-[15px] text-link">Full charges</summary><div className="mt-2"><ChargesPanel ch={ch!} replacementOf={replacementOf} /></div></details></div>
      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        <div className="min-w-0"><Tabs current={tab} tabs={tabs} />{body}</div>
        <aside className="hidden lg:block"><div className="sticky top-4"><ChargesPanel ch={ch!} replacementOf={replacementOf} /></div></aside>
      </div>
    </>
  );
}

export { and };
