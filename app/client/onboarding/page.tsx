import { pageViewer } from '@/server/page-auth';
import { clientSummary } from '@/server/views/client';
import { PageHeader, Card, Badge } from '@/components/ui';
import { SimpleForm } from '@/components/consultant-forms';
import { label, date } from '@/lib/format';

export default async function Onboarding() {
  const { viewer, ctx } = await pageViewer('client');
  const c = await clientSummary(ctx, viewer.actor.clientId!);
  const o = c.onboarding;
  const items: Array<[string, boolean]> = o ? [['Introductory session', o.introStatus === 'completed'], ['Interview training', o.interviewTrainingDone], ['Hiring process design', o.processDesignDone], ['Writing job specifications', o.jobSpecsDone], ['Assessing candidates fairly', o.assessmentTrainingDone]] : [];
  return (
    <>
      <PageHeader title="Training" subtitle="Hiring training is included, online or in person. Your consultant marks each topic complete." />
      <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
        <Card title="Checklist" action={o && <Badge tone={o.trainingStatus === 'completed' ? 'success' : 'neutral'}>{label(o.trainingStatus)}</Badge>}>
          <ul className="space-y-2">{items.map(([l, d]) => <li key={l} className="flex items-center justify-between text-[15px]"><span>{l}</span><Badge tone={d ? 'success' : 'neutral'}>{d ? 'Done' : 'To do'}</Badge></li>)}</ul>
          {o?.scheduledAt && <p className="mt-3 text-[14px]">Scheduled: {date(o.scheduledAt)}</p>}
          {o?.hiringBrief && <div className="mt-4 border-t border-line pt-3"><h4 className="font-semibold">Hiring brief from your consultant</h4><p className="text-[15px]">{o.hiringBrief}</p></div>}
        </Card>
        <Card title="Preferred format">
          <p className="mb-3 text-[14px] text-muted">Current: {o?.trainingMode ? (o.trainingMode === 'online' ? 'Online' : 'In person') : 'Not chosen'}. Changing this sends a request to your consultant.</p>
          <SimpleForm path="notifications/onboarding-preference" submitLabel="Request change" fields={[{ name: 'mode', label: 'Format', options: [['online', 'Online'], ['in_person', 'In person']], defaultValue: o?.trainingMode ?? 'online' }]} />
        </Card>
      </div>
    </>
  );
}
