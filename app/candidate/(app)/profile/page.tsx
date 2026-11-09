import { pageViewer } from '@/server/page-auth';
import { candidateOverview, anonymousPreview, evidenceSources } from '@/server/views/candidate';
import { PageHeader, Card, Tabs, Empty, Notice } from '@/components/ui';
import { ActionButton } from '@/components/client';
import { EvidenceEdit } from '@/components/candidate-forms';
import { MatchCard } from '@/components/role';
import { label } from '@/lib/format';
import { skillName } from '@/lib/skills';

export default async function Profile({ searchParams }: { searchParams: Promise<{ tab?: string; preview?: string }> }) {
  const { ctx } = await pageViewer('candidate');
  const sp = await searchParams;
  const tab = sp.tab ?? 'overview';
  const o = await candidateOverview(ctx);
  const src = await evidenceSources(ctx, o.candidate.id, o.evidence.map((e) => e.id));
  const fb = (o.profile?.feedbackLive ?? o.profile?.feedback ?? null) as { strengths: { text: string; evidenceIds: string[] }[]; gaps: { text: string; topic: string }[]; nextQuestion?: string } | null;
  const preview = sp.preview === '1' ? await anonymousPreview(ctx, o.candidate.id) : null;
  const tabs = [['overview', 'Overview'], ['evidence', 'Your examples'], ['feedback', 'Tips']].map(([k, l]) => ({ key: k, label: l, href: `/candidate/profile?tab=${k}` }));
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
        <div>
          <p className="max-w-[60ch] text-[17px] text-muted">Each of these is proof you can do the job. Employers see the big words, never your name.</p>
          {o.drafts.some((d) => d.safeClaim && d.tags.length) && (
            <div className="mt-5 flex flex-col gap-3 rounded-3xl bg-warning-tint p-5 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-[17px]"><span className="font-semibold">{o.drafts.length} new example{o.drafts.length > 1 ? 's' : ''}</span> {o.drafts.length > 1 ? 'are' : 'is'} waiting for your OK.</p>
              <ActionButton path="candidate/evidence/approve" body={{ evidenceIds: o.drafts.filter((d) => d.safeClaim && d.tags.length).map((d) => d.id) }} label="They all look good" confirm={{ title: 'Use these on your profile?', body: <p>BondMoran gives each one a quick check that it can’t identify you, then employers can see it. Your name stays hidden until you say yes.</p>, confirmLabel: 'Yes, use them' }} />
            </div>
          )}
          {o.evidence.length === 0 ? <div className="mt-6"><Empty>No examples yet. Answer a question or build your mini-me and they’ll appear here.</Empty></div> : (
            <ul className="mt-6 grid gap-4 lg:grid-cols-2">
              {o.evidence.filter((e) => e.reviewState !== 'rejected').map((e) => {
                const status = e.reviewState === 'draft' ? { text: 'Needs your OK', cls: 'bg-warning-tint text-warning' }
                  : e.anonymityReview === 'approved' ? { text: '✓ Live on your profile', cls: 'bg-success-tint text-primary' }
                  : e.anonymityReview === 'rejected' ? { text: 'Needs a tweak: it might give away who you are', cls: 'bg-danger-tint text-danger' }
                  : { text: 'BondMoran is giving it a quick check', cls: 'bg-page text-ink' };
                return (
                  <li key={e.id} className="flex flex-col rounded-3xl bg-surface p-6 shadow-[0_8px_24px_rgb(18_37_29/0.06)]">
                    <span className={`self-start rounded-full px-3 py-1 text-[14px] font-semibold ${status.cls}`}>{status.text}</span>
                    <p className="mt-4 font-display text-[21px] font-semibold leading-snug tracking-[-0.015em]">“{e.safeClaim ?? e.claimPrivate}”</p>
                    <div className="mt-4 flex flex-wrap gap-2">
                      {e.strength === 'specific' && <span className="rounded-full bg-[#E1E8C9] px-3 py-1 text-[14px] font-semibold text-ink">★ Strong example</span>}
                      {e.tags.map((t) => <span key={t} className="rounded-full bg-page px-3 py-1 text-[14px] text-ink">{skillName(t)}</span>)}
                    </div>
                    {e.uncertainty && <p className="mt-3 text-[15px] text-muted">Employers might ask: {e.uncertainty}</p>}
                    <details className="mt-3 text-[15px]">
                      <summary className="cursor-pointer text-muted">Your original words</summary>
                      <p className="mt-2">{e.claimPrivate}</p>
                      {src.get(e.id) && <p className="mt-1 text-[13px] text-muted">{src.get(e.id)}</p>}
                    </details>
                    <div className="mt-auto flex flex-wrap gap-2 pt-5">
                      {e.reviewState === 'draft' && e.safeClaim && e.tags.length > 0 && <ActionButton path="candidate/evidence/approve" body={{ evidenceIds: [e.id] }} label="Looks good" />}
                      <EvidenceEdit e={{ id: e.id, claim: e.claimPrivate, safeClaim: e.safeClaim, tags: e.tags, uncertainty: e.uncertainty }} />
                      <ActionButton path="candidate/evidence/withdraw" body={{ evidenceId: e.id }} label="Remove" variant="ghost" confirm={{ title: 'Remove this example?', body: <p>Employers stop seeing it straight away.</p>, confirmLabel: 'Remove' }} />
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
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
