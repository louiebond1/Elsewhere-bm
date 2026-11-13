import { notFound } from 'next/navigation';
import { pageViewer } from '@/server/page-auth';
import { myInterview } from '@/server/services/candidate-interviews';
import { isUuid } from '@/server/lib/ids';
import { PageHeader } from '@/components/ui';
import { InterviewDeck, Countdown } from '@/components/interview-feedback';
import { label } from '@/lib/format';

export const dynamic = 'force-dynamic';

/** One interview, as a conversation: the question, how their mini-me answered, and a way to add more. */
export default async function Interview({ params }: { params: Promise<{ roleId: string }> }) {
  const { ctx } = await pageViewer('candidate');
  const { roleId } = await params;
  if (!isUuid(roleId)) notFound();
  const i = await myInterview(ctx, roleId).catch(() => null);
  if (!i) notFound();
  return (
    <div className="mx-auto max-w-[860px]">
      <PageHeader compact back={{ href: '/candidate/interviews', label: 'Your interviews' }} title={i.title} subtitle={`${label(i.mode)} · ${label(i.region)} · interviewed ${new Date(i.at).toLocaleDateString('en-GB', { day: 'numeric', month: 'long' })} · ${i.answers.length} questions. The employer never sees your name.`} />
      <div className="mb-4"><Countdown lateAllowed={i.lateAllowed} deadline={i.deadline} gaps={i.answers.filter((a) => !a.answer).length} /></div>
      <InterviewDeck answers={i.answers} open={i.open} />
    </div>
  );
}
