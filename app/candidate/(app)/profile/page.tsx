import { pageViewer } from '@/server/page-auth';
import { candidateOverview, anonymousPreview, evidenceSources } from '@/server/views/candidate';
import { PageHeader, Card, Tabs, Badge, Empty, Notice } from '@/components/ui';
import { ActionButton } from '@/components/client';
import { EvidenceEdit } from '@/components/candidate-forms';
import { MatchCard } from '@/components/role';
import { label } from '@/lib/format';

export default async function Profile({ searchParams }: { searchParams: Promise<{ tab?: string; preview?: string }> }) {
  const { ctx } = await pageViewer('candidate');
  const sp = await searchParams;
  const tab = sp.tab ?? 'overview';
  const o = await candidateOverview(ctx);
  const src = await evidenceSources(ctx, o.candidate.id, o.evidence.map((e) => e.id));
  const fb = (o.profile?.feedback ?? null) as { strengths: { text: string; evidenceIds: string[] }[]; gaps: { text: string; topic: string }[]; nextQuestion?: string } | null;
  const preview = sp.preview === '1' ? await anonymousPreview(ctx, o.candidate.id) : null;
  const tabs = [['overview', 'Overview'], ['evidence', 'Evidence'], ['feedback', 'Feedback']].map(([k, l]) => ({ key: k, label: l, href: `/candidate/profile?tab=${k}` }));
  return (
    <>
      <PageHeader title={o.identity?.fullName ?? 'Your profile'} subtitle={`${o.candidate.publicRef} · Private name, only you and BondMoran see it`} actions={<a className="inline-flex h-11 items-center rounded-lg border border-line bg-surface px-4 text-[15px] no-underline" href={sp.preview === '1' ? '/candidate/profile' : '/candidate/profile?preview=1'}>{sp.preview === '1' ? 'Hide anonymous preview' : 'Show anonymous preview'}</a>} />
      {sp.preview === '1' && (
        <div className="mb-6">
          <Notice>This is exactly what an employer sees before you accept, using the same view they use{preview ? `, shown against "${preview.roleTitle}"` : ''}.</Notice>
          <div className="mt-3">{preview ? <MatchCard m={{ ...preview.dto, identity: null }} href="#" /> : <Empty>No employer can see your profile right now.</Empty>}</div>
        </div>
      )}
      <Tabs current={tab} tabs={tabs} />
      {tab === 'overview' && (
        <div className="grid gap-4 lg:grid-cols-2">
          <Card title="Published profile">{o.profile ? <><p className="font-semibold">{o.profile.headlineSafe}</p><p className="mt-2 text-[15px]">{o.profile.summarySafe}</p><p className="mt-2 text-[13px] text-muted">Version {o.profile.versionNumber}</p></> : <p className="text-[15px] text-muted">Not published yet. Approve evidence and BondMoran reviews it for anonymity.</p>}</Card>
          <Card title="Preferences"><p className="text-[15px]">{label(o.candidate.region)} · {o.candidate.workModes.join(', ')} · {o.candidate.preferredRoleFamilies.join(', ')}</p><p className="text-[15px]">Experience: {label(o.candidate.experienceBand)} · Right to work: {label(o.candidate.workAuthorisation)}</p><p className="mt-2 text-[14px]"><a href="/candidate/privacy">Change preferences and privacy</a></p></Card>
        </div>
      )}
      {tab === 'evidence' && (
        <div className="space-y-3">
          {o.drafts.length > 0 && <div className="flex flex-wrap items-center gap-3"><ActionButton path="candidate/evidence/approve" body={{ evidenceIds: o.drafts.filter((d) => d.safeClaim && d.tags.length).map((d) => d.id) }} label="Approve for matching" disabledReason={o.drafts.some((d) => d.safeClaim && d.tags.length) ? null : 'Edit each draft to add a client-safe summary and tags first.'} confirm={{ title: 'Approve evidence for matching', body: <p>Approved items go to BondMoran for an anonymity review. Once reviewed they can appear in your anonymous profile. Your name is never shared until you accept a request.</p>, confirmLabel: 'Approve' }} /></div>}
          {o.evidence.length === 0 ? <Empty>No evidence yet. Finish a conversation to create draft evidence.</Empty> : o.evidence.filter((e) => e.reviewState !== 'rejected').map((e) => (
            <Card key={e.id} title={<span className="text-[16px]">{e.claimPrivate}</span>} action={<span className="flex flex-wrap gap-1"><Badge tone={e.reviewState === 'draft' ? 'warning' : 'success'}>{e.reviewState === 'draft' ? 'Draft' : 'Approved'}</Badge><Badge tone={e.anonymityReview === 'approved' ? 'success' : e.anonymityReview === 'rejected' ? 'danger' : 'neutral'}>Anonymity {e.anonymityReview}</Badge>{e.provider === 'fixture' && <Badge>Demo responses</Badge>}</span>}>
              <p className="text-[14px] text-muted">Source: {src.get(e.id)}</p>
              <p className="mt-2 text-[15px]"><span className="text-muted">Employers would see:</span> {e.safeClaim ?? 'No client-safe summary yet. Edit to add one.'}</p>
              {e.uncertainty && <p className="mt-1 text-[14px] text-warning">Uncertainty: {e.uncertainty}</p>}
              <p className="mt-1 text-[13px] text-muted">Tags: {e.tags.length ? e.tags.join(', ') : 'none'} · {label(e.strength)}</p>
              <div className="mt-3 flex flex-wrap gap-2">
                <EvidenceEdit e={{ id: e.id, claim: e.claimPrivate, safeClaim: e.safeClaim, tags: e.tags, uncertainty: e.uncertainty }} />
                {e.reviewState === 'draft' && e.safeClaim && e.tags.length > 0 && <ActionButton path="candidate/evidence/approve" body={{ evidenceIds: [e.id] }} label="Approve" variant="secondary" />}
                <ActionButton path="candidate/evidence/withdraw" body={{ evidenceId: e.id }} label="Remove" variant="ghost" confirm={{ title: 'Remove this evidence', body: <p>It stops appearing to employers immediately. Matches refresh without it.</p>, confirmLabel: 'Remove' }} />
              </div>
            </Card>
          ))}
        </div>
      )}
      {tab === 'feedback' && (
        <Card title="Feedback">
          {fb && (fb.strengths.length || fb.gaps.length) ? (
            <div className="space-y-4 text-[15px]">
              {fb.strengths.length > 0 && <div><h4 className="font-semibold">Supported strengths</h4><ul className="mt-1 list-disc pl-5">{fb.strengths.map((s) => <li key={s.text}>{s.text}</li>)}</ul></div>}
              {fb.gaps.length > 0 && <div><h4 className="font-semibold">Useful gaps to fill</h4><ul className="mt-1 list-disc pl-5">{fb.gaps.map((g) => <li key={g.text}>{g.text}</li>)}</ul></div>}
              <p className="text-[13px] text-muted">Feedback is developmental. It is not a hiring probability or a score. Unknown is not weak.</p>
            </div>
          ) : <p className="text-[15px] text-muted">Not enough approved evidence yet to say something specific. A useful next step: tell us about a task you took responsibility for.</p>}
        </Card>
      )}
    </>
  );
}
