import Link from 'next/link';
import { and, eq, desc } from 'drizzle-orm';
import * as S from '../server/db/schema';
import type { Ctx } from '../server/services/context';
import { roleForActor } from '../server/services/roles';
import { validEvidenceForProfile, latestAdjustment } from '../server/services/matching';
import { Card, Badge, Empty } from './ui';
import { AdjustmentForm, AiReviewButton } from './consultant-forms';
import { criteriaFor } from '../server/services/roles';
import { label } from '../lib/format';

/** Consultant-only: private identity, AI assessment versus human adjustment, and incompatible candidates. */
export async function ConsultantRoleReview({ ctx, roleId }: { ctx: Ctx; roleId: string }) {
  await roleForActor(ctx, roleId);
  const crit = await criteriaFor(ctx, roleId);
  const ms = await ctx.tx.select({ m: S.matches, name: S.candidateIdentity.fullName, ref: S.candidates.publicRef, cid: S.candidates.id, pv: S.candidates.latestProfileVersionId }).from(S.matches).innerJoin(S.candidates, eq(S.candidates.id, S.matches.candidateId)).leftJoin(S.candidateIdentity, eq(S.candidateIdentity.candidateId, S.candidates.id)).where(eq(S.matches.roleId, roleId)).orderBy(desc(S.matches.score));
  const ok = ms.filter((x) => x.m.eligibility !== 'incompatible');
  const bad = ms.filter((x) => x.m.eligibility === 'incompatible');
  const rows = [];
  for (const x of ok) {
    const ev = await validEvidenceForProfile(ctx, x.cid, x.pv);
    const adj = await latestAdjustment(ctx, roleId, x.cid);
    rows.push({ ...x, ev, adj });
  }
  return (
    <div className="space-y-4">
      <p className="text-[14px] text-muted">The evidence score and any human adjustment are shown separately. There is no role-independent best-candidate label. Adjustments cannot override a privacy block or create evidence.</p>
      {rows.length === 0 ? <Empty>No permitted candidates for this role.</Empty> : rows.map((r) => (
        <Card key={r.cid} title={<span>{r.name ?? 'Deleted'} <span className="text-[14px] font-normal text-muted">· {r.ref}</span></span>} action={<span className="flex gap-1"><Badge>Evidence {r.m.aiScore}{r.m.provider === 'anthropic' ? ' (AI)' : ''}</Badge>{r.m.humanScore !== null && <Badge tone="primary">Screening {r.m.humanScore}</Badge>}{r.adj && <Badge tone="warning">Adjustment {r.adj.adjustment > 0 ? '+' : ''}{r.adj.adjustment}</Badge>}<Badge tone="success">Ranking {r.m.score}</Badge></span>}>
          <p className="text-[14px]">{label(r.m.eligibility)} · {r.m.confidence} coverage · {r.m.rationaleSafe}</p>
          <ul className="mt-2 list-disc pl-5 text-[14px]">{r.ev.map((e) => <li key={e.id}>{e.safeClaim} <span className="text-muted">({e.strength}; {e.tags.join(', ')})</span></li>)}</ul>
          {r.adj && <p className="mt-2 text-[13px] text-muted">Latest adjustment reason (private): {r.adj.reasonPrivate}</p>}
          <div className="mt-3 flex flex-wrap items-start gap-3"><AdjustmentForm roleId={roleId} candidateId={r.cid} evidence={r.ev.map((e) => ({ id: e.id, claim: e.safeClaim! }))} /><AiReviewButton roleId={roleId} candidateId={r.cid} criteria={crit.map((c) => ({ id: c.id, label: c.label }))} current={Object.fromEntries(((r.m.criterionResults as { criterionId: string; aiLevel: string }[]) ?? []).map((x) => [x.criterionId, x.aiLevel]))} /><Link href={`/consultant/candidates/${r.cid}`} className="text-[14px]">Candidate record</Link></div>
        </Card>
      ))}
      {bad.length > 0 && <details className="rounded-xl border border-line bg-surface p-4"><summary className="cursor-pointer font-medium">Explicitly incompatible ({bad.length}) · not shown to the client</summary><ul className="mt-2 text-[14px]">{bad.map((b) => <li key={b.cid}>{b.ref} · {b.name} · {label(b.m.incompatibilityReason ?? '')}</li>)}</ul></details>}
    </div>
  );
}

export { and };
