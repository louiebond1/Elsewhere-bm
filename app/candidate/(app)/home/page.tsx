import Link from 'next/link';
import { pageViewer } from '@/server/page-auth';
import { candidateOverview } from '@/server/views/candidate';
import { PageHeader, Card, Notice, LinkButton, Badge } from '@/components/ui';
import { ActionButton, JobPoller } from '@/components/client';

const REASON: Record<string, string> = {
  discovery_off: 'Discovery is off. Employers cannot find you for new roles.',
  employer_unresolved: 'Needs confirmation: we are checking your current employer before you can be discovered.',
  no_approved_profile: 'Approve some evidence so we can publish your anonymous profile.',
  status_onboarding: 'Finish setting up your profile.',
  status_paused: 'Your profile is paused.',
  terms_missing: 'Accept the prototype terms.',
  ai_consent_missing: 'Accept AI processing.',
};

export default async function CandidateHome() {
  const { ctx } = await pageViewer('candidate');
  const o = await candidateOverview(ctx);
  const fb = (o.profile?.feedback ?? null) as { strengths: { text: string }[]; gaps: { text: string }[]; nextQuestion?: string } | null;
  const initial = o.conversations.find((c) => c.kind === 'initial_screening');
  const steps = [
    ['Basics', true],
    ['Current employer', o.candidate.employerResolutionStatus !== 'not_supplied'],
    ['CV', !!o.cv],
    ['Conversation', initial?.status === 'completed'],
    ['Review', !!o.profile],
  ] as const;
  return (
    <>
      <PageHeader title="Your Elsewhere profile" subtitle="You choose who sees your name. Candidates never pay." actions={<LinkButton href={initial?.status === 'completed' ? '/candidate/check-ins' : initial ? `/candidate/conversation/${initial.id}` : '/candidate/cv'}>Continue your profile</LinkButton>} />
      {o.candidate.status === 'onboarding' && (
        <ol className="mb-6 grid grid-cols-2 gap-2 sm:grid-cols-5">{steps.map(([l, d], i) => <li key={l} className="rounded-lg border border-line bg-surface p-3 text-[14px]"><span className="text-muted">Step {i + 1}</span><br /><span className="font-medium">{l}</span> {d ? <Badge tone="success">Done</Badge> : null}</li>)}</ol>
      )}
      <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
        <div className="space-y-4">
          <Card title="Profile status">
            {o.discovery.discoverable ? <Notice tone="success">Ready for matching. Employers see an anonymous summary, never your name, until you accept a request.</Notice> : (
              <ul className="space-y-2">{o.discovery.reasons.map((r) => <li key={r}><Notice tone="warning">{REASON[r] ?? r}</Notice></li>)}</ul>
            )}
            {o.awaitingReview.length > 0 && <p className="mt-3 text-[14px] text-muted">{o.awaitingReview.length} approved item{o.awaitingReview.length > 1 ? 's are' : ' is'} waiting for BondMoran&apos;s anonymity review.</p>}
            {o.drafts.length > 0 && <p className="mt-3 text-[15px]"><Link href="/candidate/profile?tab=evidence">Review {o.drafts.length} draft evidence item{o.drafts.length > 1 ? 's' : ''}</Link></p>}
            {o.profileJob && (o.profileJob.status === 'queued' || o.profileJob.status === 'running') && <div className="mt-3"><JobPoller jobId={o.profileJob.id} /></div>}
            {o.profileJob?.status === 'failed' && <div className="mt-3"><Notice tone="danger">Your answer is saved. We could not update your profile just now. Try again.</Notice><div className="mt-2"><ActionButton path="conversations/retry-profile" body={{ jobId: o.profileJob.id }} label="Try again" /></div></div>}
          </Card>
          <Card title="Latest feedback">
            {fb && (fb.strengths.length || fb.gaps.length) ? (
              <div className="space-y-3 text-[15px]">
                {fb.strengths.map((s) => <p key={s.text}>{s.text}</p>)}
                {fb.gaps.map((g) => <p key={g.text} className="text-muted">{g.text}</p>)}
              </div>
            ) : <p className="text-[15px] text-muted">We will share feedback once there is enough approved evidence to say something specific. Meanwhile, a useful next step is to describe one task you took responsibility for.</p>}
            {fb?.nextQuestion && <p className="mt-3 text-[14px]"><span className="text-muted">Suggested next question:</span> {fb.nextQuestion}</p>}
          </Card>
        </div>
        <div className="space-y-4">
          <Card title="Introduction requests">
            <p className="text-[15px]">{o.pendingIntros ? `${o.pendingIntros} request${o.pendingIntros > 1 ? 's' : ''} waiting for your decision.` : 'You control which employers see your name.'}</p>
            <div className="mt-3"><LinkButton href="/candidate/introductions" variant="secondary">View requests</LinkButton></div>
          </Card>
          <Card title="Your controls"><div className="flex flex-col gap-2"><LinkButton href="/candidate/profile" variant="secondary">Review profile</LinkButton><LinkButton href="/candidate/privacy" variant="secondary">Privacy</LinkButton></div></Card>
        </div>
      </div>
    </>
  );
}
