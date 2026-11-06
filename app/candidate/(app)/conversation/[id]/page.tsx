import { notFound } from 'next/navigation';
import { pageViewer } from '@/server/page-auth';
import { getConversation } from '@/server/services/conversations';
import { PageHeader, Badge } from '@/components/ui';
import { Conversation } from '@/components/candidate-forms';
import { isUuid } from '@/server/lib/ids';
import { providerLabel } from '@/server/ai';
import { CANDIDATES } from '../../../../../fixtures/candidates';

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { ctx } = await pageViewer('candidate');
  const { id } = await params;
  if (!isUuid(id)) notFound();
  const c = await getConversation(ctx, id).catch(() => null);
  if (!c) notFound();
  const q = c.questions.find((x) => x.state === 'unanswered') ?? null;
  const answered = c.questions.filter((x) => x.state === 'answered').length;
  const topics = [...new Set(c.questions.filter((x) => x.state === 'answered').map((x) => x.topic))];
  const c40 = CANDIDATES.find((x) => x.code === 'C40')!;
  return (
    <div className="mx-auto max-w-[760px]">
      <PageHeader title={c.conversation.kind === 'initial_screening' ? 'Your first conversation' : 'Check-in'} back={{ href: '/candidate/home', label: 'Home' }} subtitle={<span>Low pressure, text only. <Badge>{providerLabel()}</Badge></span>} />
      {c.conversation.status === 'completed' ? <p className="rounded-xl border border-line bg-surface p-5">This conversation is complete. Your draft evidence is being prepared.</p> : (
        <div className="grid gap-6 md:grid-cols-[1fr_200px]">
          <Conversation conversationId={id} question={q ? { id: q.id, text: q.questionText, topic: q.topic } : null} answered={answered} canFinish={answered > 0} />
          <aside className="hidden text-[14px] md:block"><h4 className="font-semibold">Topics covered</h4><ul className="mt-1 text-muted">{topics.length ? topics.map((t) => <li key={t}>{t}</li>) : <li>None yet</li>}</ul></aside>
        </div>
      )}
      <details className="mt-6 rounded-lg bg-warning-tint p-3 text-[14px] text-warning"><summary className="cursor-pointer">Demo helper: fictional answers for Ravi Das (C40)</summary><p className="mt-2">Q1: {c40.q1}</p><p className="mt-1">Q2: {c40.q2}</p></details>
      <ol className="mt-6 space-y-3">{c.questions.filter((x) => x.state !== 'unanswered').map((x) => <li key={x.id} className="rounded-lg border border-line bg-surface p-3 text-[14px]"><p className="font-medium">{x.questionText}</p><p className="mt-1 text-muted">{x.state === 'skipped' ? 'Skipped' : x.answer?.body}</p></li>)}</ol>
    </div>
  );
}
