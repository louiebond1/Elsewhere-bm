import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ChevronRight, Lock } from 'lucide-react';
import { pageViewer } from '@/server/page-auth';
import { candidateOverviewModel } from '@/server/views/consultant';
import { discoveryState } from '@/server/policies/privacy';
import { anonymousPreview } from '@/server/views/candidate';
import { Tabs } from '@/components/ui';
import { MatchCard } from '@/components/role';
import { AnonymityReview, ResolveEmployer } from '@/components/consultant-review-forms';
import { isUuid } from '@/server/lib/ids';
import { label, date } from '@/lib/format';

const REASONS: Record<string, string> = {
  discovery_off: 'the candidate has chosen not to be visible',
  employer_unresolved: 'current employer awaiting confirmation',
  no_approved_profile: 'no approved profile yet',
  status_onboarding: 'still onboarding',
  status_paused: 'paused',
  status_deleting: 'being deleted',
  status_deleted: 'deleted',
  terms_missing: 'terms not accepted',
  ai_consent_missing: 'AI processing not accepted',
};

const REGION: Record<string, string> = { london: 'London', hertfordshire: 'Hertfordshire', manchester: 'Manchester', remote_uk: 'Remote, UK' };
const RTW: Record<string, string> = { confirmed: 'Confirmed', needs_discussion: 'Needs discussion', unknown: 'Unknown' };

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return <section className="mb-7"><h2 className="mb-3 text-[20px] font-semibold">{title}</h2>{children}</section>;
}

export default async function CandidateRecord({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ tab?: string }> }) {
  const { ctx } = await pageViewer('consultant');
  const { id } = await params;
  const tab = (await searchParams).tab ?? 'overview';
  if (!isUuid(id)) notFound();
  const m = await candidateOverviewModel(ctx, id);
  if (!m) notFound();
  const { r } = m;
  const ds = await discoveryState(ctx, id);
  const base = `/consultant/candidates/${id}`;
  const facts = [r.idn?.currentTitle ?? 'Role unknown', REGION[r.c.region] ?? 'Region unknown', r.c.minSalaryPence ? `£${Math.round(Number(r.c.minSalaryPence) / 100000)}k minimum` : 'Minimum salary not given'];
  const visibleReason = ds.discoverable ? null : ds.reasons.map((x) => REASONS[x] ?? x.replace(/_/g, ' ')).join('; ');
  const tabs = [['overview', 'Overview'], ['evidence', 'Evidence'], ['conversations', 'Conversations'], ['cv', 'CV'], ['activity', 'Activity']].map(([k, l]) => ({ key: k, label: l, href: `${base}?tab=${k}` }));

  let body: React.ReactNode = null;
  if (tab === 'overview') {
    body = (
      <div className="grid gap-x-14 md:grid-cols-[minmax(0,1fr)_minmax(0,380px)]">
        <div className="min-w-0">
          <Section title="At a glance">
            {m.glance.length ? (
              <ul className="border-b border-line">{m.glance.map((g) => <li key={g.text} className="border-t border-line py-3 text-[16px] first:border-t-0 first:pt-0"><Link href={`${base}?tab=evidence#e-${g.evidenceId}`} className="text-ink no-underline hover:underline">{g.text}</Link></li>)}</ul>
            ) : <p className="text-[16px] text-muted">Unknown: no evidence has been recorded yet.</p>}
          </Section>
          <Section title="Next step">
            <p className="text-[16px]">{m.next.href ? <Link href={m.next.href} className="text-ink no-underline hover:underline">{m.next.text}</Link> : m.next.text}</p>
          </Section>
          <Section title="Recent activity">
            {m.activity.length ? (
              <ul className="border-b border-line">{m.activity.slice(0, 2).map((a, i) => (
                <li key={i} className="border-t border-line first:border-t-0">
                  <Link href={a.href} className="flex items-center gap-6 py-3.5 text-[16px] text-ink no-underline hover:bg-page">
                    <span className="w-14 shrink-0">{new Date(a.at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'Europe/London' })}</span>
                    <span className="min-w-0 flex-1">{a.label}</span>
                    <ChevronRight size={20} aria-hidden className="shrink-0" />
                  </Link>
                </li>
              ))}</ul>
            ) : <p className="text-[16px] text-muted">No activity recorded yet.</p>}
          </Section>
        </div>
        <div className="min-w-0">
          <Section title="Details">
            <dl className="grid grid-cols-[130px_minmax(0,1fr)] gap-x-4 gap-y-4 text-[16px]">
              <dt>Email:</dt><dd className="min-w-0 break-words">{r.idn?.email ? <a href={`mailto:${r.idn.email}`}>{r.idn.email}</a> : 'Unknown'}</dd>
              <dt>Current role:</dt><dd>{r.idn?.currentTitle ?? 'Unknown'}</dd>
              <dt>Right to work:</dt><dd>{RTW[r.c.workAuthorisation] ?? 'Unknown'}</dd>
              <dt>CV:</dt><dd className="min-w-0 break-words">{m.cv ? (m.cv.uploadState === 'ready' || m.cv.uploadState === 'uploaded' ? <a href={`/api/files/${m.cv.id}/download`}>{m.cv.originalFilename}</a> : `${m.cv.originalFilename} (${m.cv.uploadState})`) : 'None uploaded'}</dd>
              <dt>Introduction:</dt><dd>{m.introSummary}</dd>
            </dl>
          </Section>
        </div>
      </div>
    );
  } else if (tab === 'evidence') {
    const preview = await anonymousPreview(ctx, id);
    const items = r.ev.filter((e) => e.reviewState !== 'superseded');
    body = (
      <div className="max-w-[900px]">
        {items.length === 0 ? <p className="text-muted">No evidence yet.</p> : (
          <ul className="border-b border-line">{items.map((e) => (
            <li key={e.id} id={`e-${e.id}`} className="scroll-mt-4 border-t border-line py-4 first:border-t-0 first:pt-0">
              <p className="text-[14px] text-muted">{label(e.reviewState)} · anonymity {e.anonymityReview} · {label(e.strength)} · tags: {e.tags.join(', ') || 'none'}</p>
              <p className="mt-1 text-[16px]">{e.claimPrivate}</p>
              <p className="mt-1 text-[15px]"><span className="text-muted">Client-safe claim:</span> {e.safeClaim ?? 'None yet'}</p>
              {e.uncertainty && <p className="mt-1 text-[15px]"><span className="text-muted">Uncertainty:</span> {e.uncertainty}</p>}
              <p className="mt-1 text-[14px] text-muted">Source quote (private): {e.sourceQuotePrivate || 'none'}</p>
              {e.anonymityReview === 'pending' && (e.reviewState === 'candidate_approved' || e.reviewState === 'consultant_verified') && <div className="mt-3 max-w-[640px]"><AnonymityReview evidenceId={e.id} safeClaim={e.safeClaim ?? ''} /></div>}
              {e.reviewState === 'draft' && <p className="mt-2 text-[14px] text-muted">Waiting for the candidate to approve.</p>}
            </li>
          ))}</ul>
        )}
        <h2 className="mb-2 mt-8 text-[20px] font-semibold">What a client would see</h2>
        {preview && ds.discoverable ? <><p className="mb-2 text-[14px] text-muted">The anonymous view on “{preview.roleTitle}”, before any acceptance.</p><MatchCard m={{ ...preview.dto, identity: null }} href="#" /></> : <p className="text-[16px] text-muted">Nothing. This profile is not visible to clients.</p>}
      </div>
    );
  } else if (tab === 'conversations') {
    body = m.convs.length === 0 ? <p className="text-muted">No conversations yet.</p> : (
      <div className="max-w-[900px] space-y-8">{m.convs.map((c) => {
        const qs = r.answers.filter((a) => a.convId === c.id);
        return (
          <section key={c.id} id={`c-${c.id}`} className="scroll-mt-4">
            <h2 className="text-[20px] font-semibold">{c.kind === 'initial_screening' ? 'First check-in' : 'Check-in'}</h2>
            <p className="mb-3 text-[14px] text-muted">{label(c.status)}{c.completedAt ? ` · completed ${date(c.completedAt)}` : ''} · {c.provider === 'fixture' ? 'Demo responses' : 'Live AI'}</p>
            {qs.length ? <ul className="border-b border-line">{qs.map((a) => <li key={a.a.id} className="border-t border-line py-3 first:border-t-0 first:pt-0"><p className="font-medium">{a.q}</p><p className="mt-1">{a.a.body}</p></li>)}</ul> : <p className="text-muted">No submitted answers.</p>}
          </section>
        );
      })}</div>
    );
  } else if (tab === 'cv') {
    body = !m.cv ? <p className="text-muted">No CV uploaded. The candidate can continue without one.</p> : (
      <div className="max-w-[900px]">
        <p className="text-[16px]"><a href={`/api/files/${m.cv.id}/download`}>{m.cv.originalFilename}</a> · {m.cv.uploadState} · uploaded {date(m.cv.createdAt)}{m.cv.textConfirmedAt ? ' · text confirmed by candidate' : ''}</p>
        <p className="mt-1 text-[14px] text-muted">Private. Only the candidate and BondMoran can open it. Clients never receive the CV.</p>
        {m.cv.extractedTextPrivate ? <pre className="mt-4 whitespace-pre-wrap border-t border-line pt-4 font-sans text-[15px]">{m.cv.extractedTextPrivate}</pre> : <p className="mt-4 text-muted">No extracted text{m.cv.extractionErrorCode ? ` (${m.cv.extractionErrorCode.replace(/_/g, ' ')})` : ''}.</p>}
      </div>
    );
  } else if (tab === 'activity') {
    body = (
      <div className="grid gap-x-14 md:grid-cols-[minmax(0,1fr)_minmax(0,380px)]">
        <div className="min-w-0">
          <Section title="All activity">
            {m.activity.length ? <ul className="border-b border-line">{m.activity.map((a, i) => (
              <li key={i} className="border-t border-line first:border-t-0"><Link href={a.href} className="flex items-center gap-6 py-3 text-[16px] text-ink no-underline hover:bg-page"><span className="w-24 shrink-0">{date(a.at)}</span><span className="min-w-0 flex-1">{a.label}</span><ChevronRight size={18} aria-hidden /></Link></li>
            ))}</ul> : <p className="text-muted">No activity recorded yet.</p>}
          </Section>
          <Section title="Introductions">
            {r.intros.length ? <ul className="border-b border-line">{r.intros.map((i) => <li key={i.i.id} id={`i-${i.i.id}`} className="scroll-mt-4 border-t border-line py-3 first:border-t-0">{i.client} · {i.title} · {label(i.i.state)} · requested {date(i.i.requestedAt)}{i.i.acceptedAt ? ` · accepted ${date(i.i.acceptedAt)}` : ''}</li>)}</ul> : <p className="text-muted">Not started.</p>}
          </Section>
        </div>
        <div className="min-w-0">
          <Section title="Privacy">
            <p className="text-[16px]">Hidden from: {r.blocks.length ? r.blocks.map((b) => `${b.name} and its group${b.reason === 'current_employer' ? ' (current employer)' : ''}`).join('; ') : 'no organisations'}.</p>
            {r.c.employerResolutionStatus === 'unresolved' && <div className="mt-3"><p className="mb-2 text-[15px]">Typed employer “{r.idn?.currentEmployerLabel}” needs confirmation. Only the candidate controls hiding; you confirm which organisation it is.</p><ResolveEmployer candidateId={id} orgs={r.orgs} /></div>}
            <p className="mt-3 text-[14px] text-muted">Only the candidate can change visibility or accept introductions.</p>
          </Section>
        </div>
      </div>
    );
  }

  return (
    <div className="-mx-4 -mt-6 md:-mx-8">
      <div className="border-b border-line px-4 pt-6 md:px-8">
        <Link href="/consultant/candidates" className="text-[14px] no-underline">&larr; Candidates</Link>
        <h1 className="mt-2 text-[38px] font-bold leading-tight">{r.idn?.fullName ?? `Deleted profile ${r.c.publicRef}`}</h1>
        <p className="mt-1 text-[18px]">{facts.join(' · ')}</p>
        <p className="mt-1.5 flex flex-wrap items-center gap-x-2 text-[16px] text-muted">
          <span>Visible to clients: {ds.discoverable ? 'Yes' : 'No'}</span>
          {!ds.discoverable && <Lock size={16} aria-hidden />}
          {visibleReason && <span className="text-[14px]">({visibleReason})</span>}
        </p>
        <div className="mt-4 [&_nav]:mb-0 [&_nav]:border-b-0">
          <Tabs current={tab} tabs={tabs} />
        </div>
      </div>
      <div className="px-4 pt-7 md:px-8">{body}</div>
    </div>
  );
}

