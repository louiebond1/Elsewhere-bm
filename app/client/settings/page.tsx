import Link from 'next/link';
import { pageViewer } from '@/server/page-auth';
import { PageHeader } from '@/components/ui';
import { TastePicker } from '@/components/taste-picker';
import { preferencePair, feedbackCount } from '@/server/services/scoring-feedback';

export const dynamic = 'force-dynamic';

/** Settings: "Teach it your taste". Optional; nothing here is needed to hire. */
export default async function ClientSettings() {
  const { ctx, viewer } = await pageViewer('client');
  const [pair, taught] = await Promise.all([preferencePair(ctx), feedbackCount(ctx, viewer.actor.clientId!)]);
  return (
    <div className="mx-auto max-w-[900px]">
      <PageHeader title="Teach it your taste" subtitle="Optional. Pick the answer that suits your jobs better and your interviews are scored more like you would." />
      <p className="mb-4 text-[15px] text-muted">{taught ? `You’ve taught it ${taught} preference${taught === 1 ? '' : 's'}. Each one re-scores everyone for your live jobs the same way.` : 'Nothing taught yet.'}</p>
      {pair ? <TastePicker key={`${pair.roleId}-${pair.questionIndex}-${pair.a.id}-${pair.b.id}`} pair={pair} />
        : <p className="rounded-3xl bg-surface p-6 text-[16px]">Nothing to compare yet. Once people have been interviewed for one of your <Link href="/client/roles">live jobs</Link>, their answers appear here.</p>}
    </div>
  );
}
