import { notFound } from 'next/navigation';
import { and, eq } from 'drizzle-orm';
import { pageViewer } from '@/server/page-auth';
import * as S from '@/server/db/schema';
import { criteriaFor } from '@/server/services/roles';
import { screeningRecordings } from '@/server/services/screenings';
import { validEvidenceForProfile } from '@/server/services/matching';
import { PageHeader, Card, KV, Badge } from '@/components/ui';
import { CompleteScreening, ScheduleScreening, RecordingUpload } from '@/components/screening-forms';
import { ActionButton } from '@/components/client';
import { LevelBadge } from '@/components/role';
import { isUuid } from '@/server/lib/ids';
import { label, date } from '@/lib/format';

export default async function Screening({ params }: { params: Promise<{ id: string }> }) {
  const { ctx } = await pageViewer('consultant');
  const { id } = await params;
  if (!isUuid(id)) notFound();
  const [s] = await ctx.tx.select().from(S.screenings).where(and(eq(S.screenings.id, id), eq(S.screenings.datasetId, ctx.datasetId)));
  if (!s) notFound();
  const [role] = await ctx.tx.select().from(S.roles).where(eq(S.roles.id, s.roleId));
  const [idn] = await ctx.tx.select().from(S.candidateIdentity).where(eq(S.candidateIdentity.candidateId, s.candidateId));
  const [cand] = await ctx.tx.select().from(S.candidates).where(eq(S.candidates.id, s.candidateId));
  const crit = await criteriaFor(ctx, s.roleId);
  const ev = await validEvidenceForProfile(ctx, s.candidateId, cand?.latestProfileVersionId ?? null);
  const recs = await screeningRecordings(ctx, id);
  const done = s.status === 'completed';
  const assess = (s.criterionAssessments as { criterionId: string; level: string; observationPrivate: string }[]) ?? [];
  return (
    <>
      <PageHeader title={`Screening: ${idn?.fullName ?? 'Deleted profile'}`} back={{ href: `/consultant/roles/${s.roleId}?tab=screenings`, label: role.title }} subtitle={<span className="flex gap-2">{role.title} · {role.vacancyKey} <Badge tone={done ? 'success' : 'neutral'}>{label(s.status)}</Badge></span>} />
      <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
        <div className="space-y-4">
          {done ? (
            <Card title="Completed">
              <ul className="space-y-2">{crit.map((c) => { const x = assess.find((y) => y.criterionId === c.id); return <li key={c.id} className="text-[15px]"><span className="font-medium">{c.label}</span> <LevelBadge level={x?.level ?? 'unknown'} /><p className="text-[14px] text-muted">{x?.observationPrivate}</p></li>; })}</ul>
              <p className="mt-3 text-[15px]"><span className="text-muted">Client-safe summary:</span> {s.summarySafe}</p>
              {s.notesPrivate && <p className="mt-2 text-[14px]"><span className="text-muted">Private notes:</span> {s.notesPrivate}</p>}
            </Card>
          ) : s.status === 'cancelled' ? <Card><p>Cancelled before completion. The slot was released.</p></Card> : (
            <Card title="Record the screening">
              <ScheduleScreening screeningId={id} />
              <div className="mt-4"><CompleteScreening screeningId={id} criteria={crit.map((c) => ({ id: c.id, label: c.label }))} evidence={ev.map((e) => ({ id: e.id, claim: e.safeClaim! }))} /></div>
              <div className="mt-3"><ActionButton path={`screenings/${id}/cancel`} label="Cancel screening" variant="ghost" confirm={{ title: 'Cancel screening', body: <p>The included screening slot is released. History is kept.</p> }} /></div>
            </Card>
          )}
        </div>
        <div className="space-y-4">
          <Card title="Candidate (private)"><KV rows={[['Name', idn?.fullName ?? ''], ['Email', idn?.email ?? ''], ['Reference', cand?.publicRef ?? ''], ['Scheduled', s.scheduledAt ? date(s.scheduledAt) : 'Not yet']]} /></Card>
          <Card title="Recording (consultants only)">
            {recs.map((r) => <div key={r.id} className="mb-3"><audio controls preload="none" src={`/api/files/${r.id}/download`} className="w-full" /><p className="text-[13px] text-muted">{r.mimeType} · Demo recording placeholder</p></div>)}
            <RecordingUpload screeningId={id} consented={!!s.recordingConsentAt} />
            {s.recordingConsentAt && <p className="mt-2 text-[13px] text-muted">Recording consent recorded {date(s.recordingConsentAt)}.</p>}
          </Card>
        </div>
      </div>
    </>
  );
}
