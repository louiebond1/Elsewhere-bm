import Link from 'next/link';
import { eq } from 'drizzle-orm';
import { pageViewer } from '@/server/page-auth';
import { candidateOverview } from '@/server/views/candidate';
import { organisations } from '@/server/db/schema';
import { PageHeader, Card, Notice, Badge } from '@/components/ui';
import { ActionButton } from '@/components/client';
import { EmployerPicker, BlockPicker, PreferencesForm } from '@/components/candidate-forms';
import { myConnections, issuer } from '@/server/connectors/oauth';
import { date } from '@/lib/format';

export default async function Privacy({ searchParams }: { searchParams: Promise<{ onboarding?: string }> }) {
  const { ctx } = await pageViewer('candidate');
  const o = await candidateOverview(ctx);
  const onboarding = (await searchParams).onboarding === '1';
  const orgs = (await ctx.tx.select({ id: organisations.id, name: organisations.displayName }).from(organisations).where(eq(organisations.datasetId, ctx.datasetId))).sort((a, b) => a.name.localeCompare(b.name));
  const er = o.candidate.employerResolutionStatus;
  const apps = await myConnections(ctx);
  const connectorUrl = `${issuer()}/mcp`;
  return (
    <>
      <PageHeader title="Privacy" subtitle="You decide who can discover you and who sees your name." />
      {onboarding && <div className="mb-4"><Notice>Step 2: tell us your current employer so we can hide your profile from it. Then <Link href="/candidate/cv">add your CV</Link>.</Notice></div>}
      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="Discovery" action={<Badge tone={o.candidate.discoveryEnabled ? 'success' : 'neutral'}>{o.candidate.discoveryEnabled ? 'On' : 'Off'}</Badge>}>
          <p className="text-[15px]">When on, employers using BondMoran can see your anonymous profile for relevant roles. Turning it off removes you from new matches and cancels pending requests. Introductions you already accepted stay active unless you withdraw them.</p>
          <div className="mt-3"><ActionButton path="candidate/discovery" body={{ enabled: !o.candidate.discoveryEnabled }} label={o.candidate.discoveryEnabled ? 'Turn discovery off' : 'Turn discovery on'} variant="secondary" successText="Saved." /></div>
          {!o.discovery.discoverable && o.candidate.discoveryEnabled && <p className="mt-2 text-[14px] text-warning">Discovery is requested but not effective yet: {o.discovery.reasons.join(', ').replace(/_/g, ' ')}.</p>}
        </Card>
        <Card title="Current employer" action={er === 'unresolved' ? <Badge tone="warning">Needs confirmation</Badge> : er === 'resolved' ? <Badge tone="success">Hidden from employer</Badge> : null}>
          <p className="mb-3 text-[15px]">Your profile is hidden from your current employer and its group. An employer we cannot match exactly pauses discovery until BondMoran confirms it.</p>
          <EmployerPicker orgs={orgs} current={o.candidate.currentOrganisationId} />
        </Card>
        <Card title="Hidden organisations">
          {o.blocks.length ? <ul className="mb-3 space-y-1 text-[15px]">{o.blocks.map((b) => <li key={b.id} className="flex items-center justify-between gap-2"><span>{b.name} {b.includeGroup && <span className="text-[13px] text-muted">and its group</span>} {b.reason === 'current_employer' && <Badge>Current employer</Badge>}</span>{b.reason === 'candidate_choice' && <ActionButton path="candidate/blocks/remove" body={{ organisationId: b.id }} label="Unhide" variant="ghost" />}</li>)}</ul> : <p className="mb-3 text-[15px] text-muted">No hidden organisations.</p>}
          <BlockPicker orgs={orgs.filter((x) => !o.blocks.some((b) => b.id === x.id))} />
          <p className="mt-2 text-[13px] text-muted">Hiding is immediate: pending requests from that organisation are cancelled and any shared name is withdrawn in the app. This stops future access in the app. Information already shared cannot be recalled.</p>
        </Card>
        <Card title="Consents">
          <ul className="space-y-1 text-[15px]">
            <li>Prototype terms: {o.consents.terms?.granted ? `accepted (${o.consents.terms.termsVersion})` : 'not accepted'}</li>
            <li>AI processing: {o.consents.ai_processing?.granted ? 'accepted' : 'not accepted'}</li>
            <li>Aggregate insights: {o.consents.aggregate_insights?.granted ? 'on' : 'off'}</li>
          </ul>
          <div className="mt-3"><ActionButton path="candidate/insights" body={{ granted: !o.consents.aggregate_insights?.granted }} label={o.consents.aggregate_insights?.granted ? 'Turn aggregate insights off' : 'Turn aggregate insights on'} variant="secondary" successText="Saved." /></div>
          <p className="mt-2 text-[13px] text-muted">These records describe a prototype interaction, not a legal compliance claim.</p>
        </Card>
        <Card title="Preferences" className="lg:col-span-2">
          <PreferencesForm initial={{ region: o.candidate.region, workModes: o.candidate.workModes, roleFamilies: o.candidate.preferredRoleFamilies, minSalaryPounds: o.candidate.minSalaryPence ? Number(o.candidate.minSalaryPence / 100n) : null, noticeWeeks: o.candidate.noticeWeeks, workAuthorisation: o.candidate.workAuthorisation, experienceBand: o.candidate.experienceBand }} />
        </Card>
        <Card title="Your AI assistant" className="lg:col-span-2">
          <p className="text-[15px]">Let your own Claude or ChatGPT help answer your Elsewhere questions. It saves drafts here; you check them and press Send. It uses your own plan and can’t see anyone else.</p>
          {apps.length > 0 ? (
            <ul className="mt-3 divide-y divide-line rounded-xl border border-line">
              {apps.map((a) => (
                <li key={a.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 text-[15px]">
                  <span><span className="font-medium">{a.name}</span> <span className="text-muted">· connected {date(a.createdAt)}{a.lastUsedAt ? ` · last used ${date(a.lastUsedAt)}` : ''}</span></span>
                  <ActionButton path={`connectors/${a.id}/disconnect`} label="Disconnect" variant="secondary" confirm={{ title: 'Disconnect?', body: <p>{a.name} will lose access straight away. Drafts it already saved stay here for you.</p>, confirmLabel: 'Disconnect' }} />
                </li>
              ))}
            </ul>
          ) : <p className="mt-3 text-[14px] text-muted">Not connected.</p>}
          <details className="mt-3 text-[14px]">
            <summary className="cursor-pointer text-link">How to connect</summary>
            <ol className="mt-2 list-decimal space-y-1 pl-5">
              <li>In Claude or ChatGPT, open Settings, then Connectors (in ChatGPT: Apps &amp; Connectors).</li>
              <li>Add a custom connector and paste this address: <code className="rounded bg-page px-1">{connectorUrl}</code></li>
              <li>Sign in here when asked and press Allow.</li>
              <li>Then ask it: “Help me answer my Elsewhere questions.”</li>
            </ol>
          </details>
        </Card>
        <Card title="Delete profile" className="lg:col-span-2"><p className="text-[15px]">Remove your profile, CV, answers and evidence.</p><div className="mt-3"><Link href="/candidate/delete" className="text-danger">Delete profile</Link></div></Card>
      </div>
    </>
  );
}
