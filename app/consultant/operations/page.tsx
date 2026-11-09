import { desc, eq, sql } from 'drizzle-orm';
import { pageViewer } from '@/server/page-auth';
import * as S from '@/server/db/schema';
import { PageHeader, Card, ResponsiveTable, KV, Badge } from '@/components/ui';
import { ActionButton } from '@/components/client';
import { prototype } from '@/config/prototype';
import { providerLabel, aiMode } from '@/server/ai';
import { reconcileWallet } from '@/server/services/ledger';
import { label, date, credits } from '@/lib/format';
import { env } from '@/server/env';
import { maskAddress } from '@/server/email';
import { monthSpendMicroUsd, monthlyBudgetMicroUsd } from '@/server/ai/spend';

const usd = (m: bigint) => `$${(Number(m) / 1_000_000).toFixed(4)}`;

export default async function Operations() {
  const { ctx } = await pageViewer('consultant');
  const jobs = await ctx.tx.select().from(S.jobs).where(eq(S.jobs.datasetId, ctx.datasetId)).orderBy(desc(S.jobs.createdAt)).limit(30);
  const today = new Date().toISOString().slice(0, 10);
  const usage = await ctx.tx.execute(sql`select model_id, provider, count(*)::int as calls, coalesce(sum(input_tokens),0)::int as input, coalesce(sum(output_tokens),0)::int as output, coalesce(sum(cache_read_tokens),0)::int as cache_read, coalesce(sum(cache_write_tokens),0)::int as cache_write, count(*) filter (where outcome <> 'succeeded')::int as failed from ai_runs where created_at::date = ${today}::date group by 1,2`);
  const wallets = await ctx.tx.select({ w: S.wallets, name: S.organisations.displayName }).from(S.wallets).innerJoin(S.clients, eq(S.clients.id, S.wallets.clientId)).innerJoin(S.organisations, eq(S.organisations.id, S.clients.organisationId)).where(eq(S.wallets.datasetId, ctx.datasetId));
  const outbox = await ctx.tx.select({ o: S.emailOutbox, email: S.users.emailNormalized }).from(S.emailOutbox).innerJoin(S.users, eq(S.users.id, S.emailOutbox.recipientUserId)).where(eq(S.emailOutbox.datasetId, ctx.datasetId)).orderBy(desc(S.emailOutbox.createdAt)).limit(20);
  const emailDriver = env().EMAIL_DRIVER;
  const spent = await monthSpendMicroUsd();
  const budget = monthlyBudgetMicroUsd();
  const rec = [];
  for (const w of wallets) rec.push({ name: w.name, ...(await reconcileWallet(ctx, w.w.id)) });
  return (
    <>
      <PageHeader title="Operations" subtitle="Jobs, AI usage, wallet reconciliation and provisional configuration." />
      <div className="grid gap-6 lg:grid-cols-2">
        <Card title="AI usage today (real UTC day, all demo generations)">
          <p className="mb-2 text-[14px]">Mode: <Badge>{providerLabel()}</Badge> · Daily token limit {prototype.aiDailyTokenLimit.toLocaleString('en-GB')} (prototype control, not a cost promise).</p>
          {(usage.rows as Array<Record<string, string | number>>).length === 0 ? <p className="text-[14px] text-muted">{aiMode() === 'fixture' ? 'No provider calls. Fixture mode uses local demo responses.' : 'No calls yet today.'}</p> : (
            <ul className="text-[14px]">{(usage.rows as Array<Record<string, string | number>>).map((u) => <li key={`${u.model_id}${u.provider}`}>{u.model_id} ({u.provider}): {u.calls} calls, {u.input} input, {u.output} output, {u.cache_read} cache read, {u.cache_write} cache write tokens, {u.failed} failed</li>)}</ul>
          )}
          <p className="mt-2 text-[15px]">AI spend this month (UTC): <span className="font-semibold">{usd(spent)}</span> of a {usd(budget)} hard limit shared by web and worker. A call that could pass the limit is refused before anything is sent.</p>
          <p className="mt-1 text-[13px] text-muted">Worked out from published per-token prices and the provider’s usage figures; failed calls count at their worst case. Anthropic’s own bill is the final figure.</p>
        </Card>
        <Card title="Wallet reconciliation">
          <ul className="space-y-1 text-[15px]">{rec.map((r) => <li key={r.name} className="flex justify-between"><span>{r.name}</span><span>{credits(r.posted)} credits {r.chainOk && !r.discrepancy ? <Badge tone="success">Reconciled</Badge> : <Badge tone="danger">Check</Badge>}</span></li>)}</ul>
        </Card>
      </div>
      <h2 className="mb-3 mt-6 text-[20px]">Email outbox</h2>
      <p className="mb-2 text-[14px]">Driver: <Badge>{emailDriver === 'fixture' ? 'Recorded only, nothing sent' : 'Resend, allow-listed addresses only'}</Badge> Emails carry the safe title and a sign-in link only.</p>
      <ResponsiveTable rowKey={(r) => r.o.id} rows={outbox} empty="No emails yet." columns={[
        { label: 'Created', cell: (r) => date(r.o.createdAt) }, { label: 'To', cell: (r) => maskAddress(r.email) }, { label: 'Event', cell: (r) => label(r.o.notificationType) }, { label: 'Subject', cell: (r) => r.o.subject },
        { label: 'Status', cell: (r) => <Badge tone={r.o.status === 'failed' ? 'danger' : r.o.status === 'sent' ? 'success' : r.o.status === 'suppressed' ? 'warning' : 'neutral'}>{label(r.o.status)}</Badge> },
        { label: 'Note', cell: (r) => (r.o.suppressedReason ? label(r.o.suppressedReason) : r.o.lastError ?? '') },
      ]} />
      <h2 className="mb-3 mt-6 text-[20px]">Jobs</h2>
      <ResponsiveTable rowKey={(j) => j.id} rows={jobs} empty="No jobs yet." columns={[
        { label: 'Created', cell: (j) => date(j.createdAt) }, { label: 'Kind', cell: (j) => label(j.kind) }, { label: 'Status', cell: (j) => <Badge tone={j.status === 'failed' ? 'danger' : j.status === 'succeeded' ? 'success' : 'neutral'}>{label(j.status)}</Badge> },
        { label: 'Attempts', align: 'right', cell: (j) => j.attempts }, { label: 'Error', cell: (j) => j.errorCode ?? '' },
        { label: '', cell: (j) => (j.status === 'failed' ? <ActionButton path={`consultant/jobs/${j.id}/retry`} label="Retry" variant="ghost" /> : null) },
      ]} />
      <h2 className="mb-3 mt-6 text-[20px]">Provisional configuration</h2>
      <Card>
        <KV rows={[['Pricing version', prototype.pricingVersion], ['Pack / single credit', `£${prototype.packCreditPence / 100} / £${prototype.singleCreditPence / 100}`], ['Deposit', `${prototype.depositBps / 100}% of standard credits, once per role`], ['Full search', `${prototype.fullSearchBps / 10000} x standard`], ['Comparison', `${prototype.comparisonFeeBps / 100}% illustrative`], ['Intros / screenings per role', `${prototype.maxAcceptedIntros} / ${prototype.includedScreenings}`], ['Intro expiry', `${prototype.introExpiryDays} days`], ['Replacement window', `${prototype.replacementWindowDays} days, one per paid hire`], ['Outside-hire window', `${prototype.outsideHireMonths} months`], ['Rollover', 'To be agreed'], ['Top-ups', 'Simulated consultant grants and demo checkout (no money taken)'], ['VAT', 'To be agreed'], ['Models', `${prototype.aiCheapModel} (routine), ${prototype.aiReviewModel} (review)`], ['Business clock', prototype.demoBusinessNow]]} />
        <p className="mt-2 text-[13px] text-muted">All commercial values are provisional prototype choices, not agreements by BondMoran. No API credentials are shown.</p>
      </Card>
    </>
  );
}
