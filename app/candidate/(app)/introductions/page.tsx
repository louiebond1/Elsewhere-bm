import Link from 'next/link';
import { pageViewer } from '@/server/page-auth';
import { candidateIntroductions } from '@/server/services/intros';
import { PageHeader, Card, Tabs, Empty, Badge } from '@/components/ui';
import { ActionButton } from '@/components/client';
import { gbp, date, label, REGION } from '@/lib/format';

export default async function Intros({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const { ctx } = await pageViewer('candidate');
  const tab = (await searchParams).tab ?? 'pending';
  const all = await candidateIntroductions(ctx);
  const rows = all.filter((r) => (tab === 'pending' ? r.state === 'pending' : tab === 'accepted' ? r.state === 'accepted' : !['pending', 'accepted'].includes(r.state)));
  return (
    <>
      <PageHeader title="Introduction requests" subtitle="You control which employers see your name. Each request is separate." />
      <Tabs current={tab} tabs={[['pending', 'Pending'], ['accepted', 'Accepted'], ['past', 'Past']].map(([k, l]) => ({ key: k, label: l, href: `/candidate/introductions?tab=${k}`, count: all.filter((r) => (k === 'pending' ? r.state === 'pending' : k === 'accepted' ? r.state === 'accepted' : !['pending', 'accepted'].includes(r.state))).length }))} />
      {rows.length === 0 ? <Empty>You control which employers see your name.</Empty> : (
        <div className="space-y-3">
          {rows.map((r) => (
            <Card key={r.id} title={`${r.employer} · ${r.roleTitle}`} action={<Badge tone={r.state === 'accepted' ? 'success' : r.state === 'pending' ? 'neutral' : 'warning'}>{label(r.state)}</Badge>}>
              <p className="text-[15px]">{gbp(r.salaryPence)} · {label(r.workMode)}, {REGION[r.location] ?? r.location} · Service contact: {r.serviceContact} at BondMoran</p>
              {r.message && <p className="mt-2 text-[15px] italic">&ldquo;{r.message}&rdquo;</p>}
              {r.state === 'pending' && <p className="mt-2 text-[14px] text-muted">Expires {date(r.expiresAt)}.</p>}
              <div className="mt-3 grid gap-3 text-[14px] sm:grid-cols-2">
                <div><p className="font-medium">If you accept, this employer sees for this role only:</p><ul className="list-disc pl-5">{r.disclosure.map((d) => <li key={d}>{d}</li>)}</ul></div>
                <div><p className="font-medium">Never shared:</p><ul className="list-disc pl-5">{r.notShared.map((d) => <li key={d}>{d}</li>)}</ul></div>
              </div>
              <div className="mt-4 flex flex-wrap gap-2">
                {r.state === 'pending' && <>
                  <ActionButton path={`intros/${r.id}/accept`} label="Accept introduction" confirm={{ title: `Share your name with ${r.employer}?`, body: <p>{r.employer} will see your full name, email address and approved profile for {r.roleTitle} only. You can withdraw later, but information already shared cannot be recalled.</p>, confirmLabel: 'Accept introduction' }} />
                  <ActionButton path={`intros/${r.id}/decline`} label="Decline" variant="secondary" confirm={{ title: 'Decline this request', body: <p>{r.employer} is told the request was declined. No reason is shared and your name is not shared.</p>, confirmLabel: 'Decline' }} />
                </>}
                {r.state === 'accepted' && <>
                  <Link href={`/candidate/introductions/${r.id}/prep`} className="inline-flex h-11 items-center rounded-lg border border-line px-4 no-underline">Interview prep</Link>
                  <ActionButton path={`intros/${r.id}/withdraw`} label="Withdraw introduction" variant="secondary" confirm={{ title: 'Withdraw this introduction', body: <p>{r.employer} loses access to your name and email in the app straight away. This stops future access in the app. Information already shared cannot be recalled.</p>, confirmLabel: 'Withdraw' }} />
                </>}
              </div>
            </Card>
          ))}
        </div>
      )}
    </>
  );
}
