import { notFound } from 'next/navigation';
import { pageViewer } from '@/server/page-auth';
import { candidateRecord } from '@/server/views/consultant';
import { discoveryState } from '@/server/policies/privacy';
import { anonymousPreview } from '@/server/views/candidate';
import { PageHeader, Card, KV, Badge, Notice } from '@/components/ui';
import { MatchCard } from '@/components/role';
import { AnonymityReview, ResolveEmployer } from '@/components/consultant-review-forms';
import { isUuid } from '@/server/lib/ids';
import { label, date, gbp } from '@/lib/format';

export default async function CandidateRecord({ params }: { params: Promise<{ id: string }> }) {
  const { ctx } = await pageViewer('consultant');
  const { id } = await params;
  if (!isUuid(id)) notFound();
  const r = await candidateRecord(ctx, id);
  if (!r) notFound();
  const ds = await discoveryState(ctx, id);
  const preview = await anonymousPreview(ctx, id);
  return (
    <>
      <PageHeader title={r.idn?.fullName ?? 'Deleted profile'} back={{ href: '/consultant/candidates', label: 'Candidates' }} subtitle={<span className="flex flex-wrap gap-2">{r.c.publicRef} <Badge>{label(r.c.status)}</Badge>{ds.discoverable ? <Badge tone="success">Discoverable</Badge> : <Badge tone="warning">Not discoverable: {ds.reasons.join(', ').replace(/_/g, ' ')}</Badge>}</span>} />
      <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
        <div className="space-y-4">
          <Card title="Evidence">
            {r.ev.length === 0 ? <p className="text-muted">No evidence.</p> : (
              <ul className="space-y-4">{r.ev.filter((e) => e.reviewState !== 'superseded').map((e) => (
                <li key={e.id} className="rounded-lg border border-line p-3">
                  <div className="flex flex-wrap gap-1"><Badge>{label(e.reviewState)}</Badge><Badge tone={e.anonymityReview === 'approved' ? 'success' : e.anonymityReview === 'rejected' ? 'danger' : 'warning'}>Anonymity {e.anonymityReview}</Badge><Badge>{label(e.strength)}</Badge></div>
                  <p className="mt-2 text-[14px]"><span className="text-muted">Source quote (private):</span> {e.sourceQuotePrivate}</p>
                  <p className="mt-1 text-[14px]"><span className="text-muted">Safe claim:</span> {e.safeClaim ?? 'None'}</p>
                  <p className="mt-1 text-[13px] text-muted">Tags: {e.tags.join(', ') || 'none'}{e.uncertainty ? ` · Uncertainty: ${e.uncertainty}` : ''}</p>
                  {e.anonymityReview === 'pending' && (e.reviewState === 'candidate_approved' || e.reviewState === 'consultant_verified') && <div className="mt-2"><AnonymityReview evidenceId={e.id} safeClaim={e.safeClaim ?? ''} /></div>}
                  {e.reviewState === 'draft' && <p className="mt-2 text-[13px] text-muted">Waiting for the candidate to approve.</p>}
                </li>
              ))}</ul>
            )}
          </Card>
          <Card title="Answers (private)"><ul className="space-y-3 text-[14px]">{r.answers.map((a) => <li key={a.a.id}><p className="font-medium">{a.q}</p><p>{a.a.body}</p></li>)}</ul></Card>
          <Card title="Client-safe preview">{preview ? <><p className="mb-2 text-[13px] text-muted">Exactly what a client sees on &ldquo;{preview.roleTitle}&rdquo; before acceptance.</p><MatchCard m={{ ...preview.dto, identity: null }} href="#" /></> : <p className="text-muted">Not visible to any client role right now.</p>}</Card>
        </div>
        <div className="space-y-4">
          <Card title="Identity (private)"><KV rows={[['Email', r.idn?.email ?? ''], ['Current title', r.idn?.currentTitle ?? ''], ['Employer', r.idn?.currentEmployerLabel ?? 'None'], ['Region', label(r.c.region)], ['Minimum salary', r.c.minSalaryPence ? gbp(r.c.minSalaryPence) : 'Not given'], ['Experience', label(r.c.experienceBand)], ['Right to work', label(r.c.workAuthorisation)]]} /></Card>
          <Card title="CV (private)">{r.files.filter((f) => f.purpose === 'cv').map((f) => <p key={f.id} className="text-[15px]"><a href={`/api/files/${f.id}/download`}>{f.originalFilename}</a> · {f.uploadState}</p>)}{!r.files.length && <p className="text-muted">No CV.</p>}</Card>
          <Card title="Privacy restrictions">
            <ul className="text-[15px]">{r.blocks.map((b) => <li key={b.name}>{b.name} ({b.reason === 'current_employer' ? 'current employer' : 'candidate choice'}), including group</li>)}{!r.blocks.length && <li className="text-muted">None</li>}</ul>
            {r.c.employerResolutionStatus === 'unresolved' && <div className="mt-3"><Notice tone="warning">Typed employer &ldquo;{r.idn?.currentEmployerLabel}&rdquo; needs confirmation. Only the candidate controls hiding; you confirm which organisation it is.</Notice><div className="mt-2"><ResolveEmployer candidateId={id} orgs={r.orgs} /></div></div>}
            <p className="mt-2 text-[13px] text-muted">Only the candidate can change discovery or accept introductions.</p>
          </Card>
          <Card title="Introductions">{r.intros.length ? <ul className="text-[14px]">{r.intros.map((i) => <li key={i.i.id} className="py-1">{i.client} · {i.title} · {label(i.i.state)} · {date(i.i.requestedAt)}</li>)}</ul> : <p className="text-muted">None.</p>}</Card>
        </div>
      </div>
    </>
  );
}
