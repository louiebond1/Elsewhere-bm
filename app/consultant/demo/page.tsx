import Link from 'next/link';
import { pageViewer } from '@/server/page-auth';
import { getActiveDataset } from '@/server/services/context';
import { PageHeader, Card, KV, LinkButton } from '@/components/ui';
import { providerLabel } from '@/server/ai';
import { date } from '@/lib/format';

export default async function Demo() {
  await pageViewer('consultant');
  const ds = await getActiveDataset();
  return (
    <>
      <PageHeader title="Demo controls" subtitle="Facilitator tools for the fictional demo." />
      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="Dataset"><KV rows={[['Generation', ds?.generation ?? ''], ['Loaded', ds?.scenarioCode ? `Scenario ${ds.scenarioCode}` : 'Baseline'], ['Business date', '6 November 2026, 12:00 Europe/London'], ['Last reset', ds?.lastResetAt ? date(ds.lastResetAt) : ''], ['AI mode', providerLabel()]]} /></Card>
        <Card title="Scenarios and persona switching"><p className="text-[15px]">Scenario cards, persona switching and Reset demo (typed RESET) are on the demo account page.</p><div className="mt-3"><LinkButton href="/demo/personas">Open scenarios and personas</LinkButton></div><p className="mt-3 text-[13px] text-muted"><Link href="/consultant/operations">Operations</Link> shows jobs and AI usage.</p></Card>
      </div>
    </>
  );
}
