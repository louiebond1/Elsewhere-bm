import Link from 'next/link';
import { eq, and } from 'drizzle-orm';
import type { Ctx } from '../server/services/context';
import * as S from '../server/db/schema';
import { roleForActor, roleCharges, criteriaFor, openOrdinaryRoleCount } from '../server/services/roles';
import { bestPeople, pipelineForRole, screeningsForRole, activityForRole } from '../server/views/client';
import { activeContractForClient } from '../server/services/contracts';
import { PageHeader, Tabs, Badge, Card, Empty, Notice, LinkButton, cx } from './ui';
import { SimplePrice, CompactPrice, PersonRow, PersonCover } from './role';
import { FindingBest } from './finding-best';
import { ActivateRole, CloseRole, ReopenRole, UpgradeRole, AutoPicks, StageMenu, RecordHire, CancelIntro, AddMustHave } from './role-actions';
import { gbp, label, date, relative, creditsLabel } from '../lib/format';
import { prototype } from '../config/prototype';

export async function RoleDetail({ ctx, roleId, tab: requestedTab, base, consultant, show }: { ctx: Ctx; roleId: string; tab: string; base: string; consultant?: boolean; show?: number }) {
  let tab = requestedTab;
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
      subtitle={<span className="flex flex-wrap items-center gap-2">{gbp(role.salaryPence)} · {label(role.workMode)}, {label(role.locationRegion)} <Badge tone={role.status === 'open' ? 'success' : 'neutral'}>{role.status === 'open' ? 'Live' : role.status === 'draft' ? 'Draft' : label(role.status)}</Badge>{role.isExtraRole && <Badge>Extra role</Badge>}{role.isReplacementRole && <Badge tone="success">Replacement</Badge>}{role.defaultServiceMode === 'full_search' && <Badge tone="primary">Full search</Badge>}</span>}
      actions={<>
        {isDraft && <LinkButton href={`${base}/roles/${roleId}/edit`} variant="secondary">Edit draft</LinkButton>}
        {!isDraft && role.status === 'open' && <LinkButton href={`${base}/roles/${roleId}/edit`} variant="secondary">Edit role</LinkButton>}
        {ch && role.status === 'open' && role.defaultServiceMode === 'standard' && !role.isReplacementRole && <UpgradeRole roleId={roleId} ch={ch} />}
        {role.status === 'open' && !role.requires18 && <AddMustHave roleId={roleId} />}
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
            <h4 className="mt-3 font-semibold">What they should achieve</h4><ul className="list-disc pl-5 text-[15px]">{role.outcomes.map((o) => <li key={o}>{o}</li>)}</ul>
            <h4 className="mt-3 font-semibold">What matters</h4><ul className="text-[15px]">{crit.map((c) => <li key={c.id}>{c.label} · {c.importance === 'essential' ? 'Must have' : 'Nice to have'}</li>)}</ul>
            {crit.length < 3 && <Notice tone="warning">Add 3 to 6 things that matter before making this role live.</Notice>}
          </Card>
          <Card title="What it costs">
            {q ? <><p className="text-[15px]">{creditsLabel(q.total.toString())} if you hire someone. {creditsLabel(q.deposit.toString())} of that when someone agrees to meet you.</p>
              <p className="mt-2 text-[14px] text-muted">{extra ? `This is an extra job, so ${creditsLabel(q.deposit.toString())} would be used when you start.` : 'Nothing is used when you start.'}</p>
              <div className="mt-3"><ActivateRole roleId={roleId} willBeExtra={extra} depositUnits={q.deposit.toString()} depositPence={q.depositPence.toString()} base={base} /></div></>
              : <Notice tone="warning">No active contract.</Notice>}
          </Card>
        </div>
      </>
    );
  }

  const tabs = [
    { key: 'matches', label: 'Candidates', href: `${base}/roles/${roleId}?tab=matches` },
    { key: 'pipeline', label: 'Interviews and hiring', href: `${base}/roles/${roleId}?tab=pipeline` },
    { key: 'screenings', label: 'BondMoran screenings', href: `${base}/roles/${roleId}?tab=screenings` },
    { key: 'activity', label: 'History', href: `${base}/roles/${roleId}?tab=activity` },
    ...(consultant ? [{ key: 'review', label: 'Consultant review', href: `${base}/roles/${roleId}?tab=review` }] : []),
  ];
  // Unknown or old tab names show the candidates instead of a blank page.
  if (!tabs.some((t) => t.key === tab)) tab = 'matches';
  let body: React.ReactNode = null;
  if (tab === 'matches') {
    const howMany = show === 5 || show === 20 ? show : 10;
    const { best, rest } = await bestPeople(ctx, roleId, howMany);
    const href = (ref: string) => `${base}/roles/${roleId}/candidates/${ref}`;
    const top = best.slice(0, 3);
    const couponsLeft = ch ? Math.max(0, prototype.includedScreenings - ch.screeningsUsed) : 0;
    body = (
      <div>
        <div className="flex flex-wrap items-center justify-between gap-4">
          <h2 className="text-[34px] leading-[38px] lg:text-[44px] lg:leading-[48px]">Your best people.</h2>
          <nav aria-label="How many to show" className="flex rounded-2xl bg-surface p-1 shadow-[0_2px_8px_rgb(18_37_29/0.06)]">
            {[5, 10, 20].map((n) => <Link key={n} href={`${base}/roles/${roleId}?tab=matches&show=${n}`} aria-current={n === howMany ? 'true' : undefined} className={cx('press tnum flex h-11 min-w-16 items-center justify-center rounded-xl px-4 font-display text-[17px] font-semibold no-underline', n === howMany ? 'bg-primary text-white' : 'text-ink hover:bg-page')}>{n}</Link>)}
          </nav>
        </div>
        {role.status === 'open' && <div className="mt-4"><FindingBest roleId={roleId} hasResults={best.length > 0} /></div>}
        {top.length > 0 && (
          <section aria-labelledby="top-picks" className="mt-8">
            <h3 id="top-picks">Top picks</h3>
            <div className="shelf -mx-5 mt-4 flex gap-4 overflow-x-auto px-5 pb-2 lg:mx-0 lg:px-0">
              {top.map((b, i) => <PersonCover key={b.dto.roleScopedReference} m={b.dto} sim={b.sim} href={href(b.dto.roleScopedReference)} index={i} />)}
            </div>
          </section>
        )}
        {best.length > 0 && (
          <section aria-labelledby="ranked" className="mt-10">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h3 id="ranked">All {best.length}, ranked</h3>
              <p className="text-[15px] text-muted">Ranked by each person’s interview for this job.</p>
            </div>
            <ul className="-mx-3 mt-3">{best.map((b, i) => <li key={b.dto.roleScopedReference}><PersonRow rank={i + 1} m={b.dto} sim={b.sim} href={href(b.dto.roleScopedReference)} index={i} /></li>)}</ul>
          </section>
        )}
        {role.status === 'open' && ch && (
          <p className="mt-8 flex flex-wrap items-center justify-between gap-2 border-t border-line pt-5 text-[16px]">
            <span><span className="tnum font-semibold">{couponsLeft}</span> BondMoran screening coupon{couponsLeft === 1 ? '' : 's'} available</span>
            <Link href={`${base}/roles/${roleId}?tab=screenings`}>How it works</Link>
          </p>
        )}
        {rest.length > 0 && (
          <details className="mt-6 rounded-3xl bg-surface p-2">
            <summary className="cursor-pointer px-3 py-3 font-display text-[18px] font-semibold">Everyone else who fits ({rest.length})</summary>
            <ul className="pb-2">{rest.map((m, i) => <li key={m.roleScopedReference}><PersonRow m={m} href={href(m.roleScopedReference)} index={i} /></li>)}</ul>
          </details>
        )}
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
        {pending.length > 0 && <Card title="Waiting for them to answer">{pending.map((r) => <div key={r.introId} className="flex flex-wrap items-center justify-between gap-2 border-b border-line py-2 last:border-0"><span>{r.label} · requested {relative(r.requestedAt, ctx.now)} · expires {date(r.expiresAt)}</span><CancelIntro introId={r.introId} /></div>)}</Card>}
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
        {past.length > 0 && <details className="rounded-xl border border-line bg-surface p-4"><summary className="cursor-pointer font-medium">No longer in the running ({past.length})</summary><ul className="mt-2 text-[14px]">{past.map((r) => <li key={r.introId} className="py-1">{r.label} · {label(r.state)}{r.stage === 'rejected' ? ' · rejected' : ''}</li>)}</ul></details>}
      </div>
    );
  } else if (tab === 'screenings') {
    const rows = await screeningsForRole(ctx, roleId);
    const picker = role.status === 'open' && ch ? <div className="mb-4"><AutoPicks roleId={roleId} slotsLeft={prototype.includedScreenings - ch.screeningsUsed} /></div> : null;
    body = rows.length === 0 ? <>{picker}<Empty>No screenings yet. You have 5 screening coupons for this job: send someone and a BondMoran consultant calls them and tells you what they found. If BondMoran thinks they aren’t right, you get the coupon back.</Empty></> : (<>{picker}
      <div className="space-y-3">{rows.map((s) => (
        <Card key={s.id} title={`Candidate ${s.ref.slice(0, 9)}`} action={<Badge tone={s.status === 'completed' ? 'success' : 'neutral'}>{label(s.status)}</Badge>}>
          <p className="text-[15px]">{s.status === 'completed' ? s.summarySafe : s.status === 'returned' ? 'BondMoran didn’t think this person was right. Your coupon is back.' : s.status === 'cancelled' ? 'Cancelled. Your coupon is back.' : 'Your consultant has this request.'}</p>
          {consultant && <Link href={`/consultant/screenings/${s.id}`} className="text-[14px]">Open screening</Link>}
        </Card>
      ))}</div></>
    );
  } else if (tab === 'activity') {
    const rows = await activityForRole(ctx, roleId);
    body = rows.length === 0 ? <Empty>Nothing has happened on this role yet.</Empty> : <ul className="divide-y divide-line rounded-xl border border-line bg-surface">{rows.map((r) => <li key={r.id} className="flex justify-between gap-3 px-4 py-3 text-[15px]"><span>{r.label}</span><span className="text-muted">{date(r.at)}</span></li>)}</ul>;
  } else if (tab === 'review' && consultant) {
    const { ConsultantRoleReview } = await import('./consultant-review');
    body = <ConsultantRoleReview ctx={ctx} roleId={roleId} />;
  }
  return (
    <>
      {header}
      <div className="mb-4 lg:hidden">{ch && <CompactPrice ch={ch} />}<details className="mt-2"><summary className="cursor-pointer text-[15px] text-link">What it costs</summary><div className="mt-2"><SimplePrice ch={ch!} replacementOf={replacementOf} /></div></details></div>
      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        <div className="min-w-0"><Tabs current={tab} tabs={tabs} />{body}</div>
        <aside className="hidden lg:block"><div className="sticky top-24"><SimplePrice ch={ch!} replacementOf={replacementOf} /></div></aside>
      </div>
    </>
  );
}

export { and };
