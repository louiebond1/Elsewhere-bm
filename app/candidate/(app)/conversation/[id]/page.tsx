import { notFound } from 'next/navigation';
import { pageViewer } from '@/server/page-auth';
import { getConversation } from '@/server/services/conversations';
import { PageHeader } from '@/components/ui';
import { Conversation } from '@/components/candidate-forms';
import { isUuid } from '@/server/lib/ids';
import { providerLabel } from '@/server/ai';
import { connectedAi } from '@/server/connectors/drafts';
import { issuer } from '@/server/connectors/oauth';
import { CANDIDATES } from '../../../../../fixtures/candidates';

export default async function Page({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ q?: string; ai?: string }> }) {
  const { ctx } = await pageViewer('candidate');
  const { id } = await params;
  if (!isUuid(id)) notFound();
  const c = await getConversation(ctx, id).catch(() => null);
  if (!c) notFound();
  const sp = await searchParams;
  const asked = sp.q;
  const open = c.questions.filter((x) => x.state === 'unanswered');
  // A chosen question first, then one their AI already drafted, then the next in order.
  const q = open.find((x) => x.id === asked) ?? open.find((x) => x.draft) ?? open[0] ?? null;
  const moreDrafts = open.filter((x) => x.draft && x.id !== q?.id).length;
  const ai = { connected: await connectedAi(ctx), connectorUrl: `${issuer()}/mcp` };
  const answered = c.questions.filter((x) => x.state === 'answered').length;
  const topics = [...new Set(c.questions.filter((x) => x.state === 'answered').map((x) => x.topic))];
  const c40 = CANDIDATES.find((x) => x.code === 'C40')!;
  return (
    <div className="mx-auto max-w-[640px]">
      <PageHeader title="" back={{ href: '/candidate/check-ins', label: 'Your questions' }} />
      {c.conversation.status === 'completed' ? <><h1>All done</h1><p className="mt-3 text-[17px] text-muted">This conversation is complete. Your draft examples are being prepared.</p></> : (<>
        {moreDrafts > 0 && <p className="mb-4 rounded-full bg-success-tint px-4 py-2 text-[14px] font-semibold text-primary">Your AI also drafted {moreDrafts} more answer{moreDrafts > 1 ? 's' : ''}. They come up next.</p>}
        <Conversation key={q?.id ?? "done"} conversationId={id} question={q ? { id: q.id, text: q.questionText, topic: q.topic, draft: q.draft ? { body: q.draft.body, provider: q.draft.aiProvider ?? 'AI' } : null } : null} answered={answered} canFinish={answered > 0} ai={ai} autoAi={sp.ai === '1'} />
      </>)}
      {c.questions.some((x) => x.state !== 'unanswered') && (
        <details className="mt-10 text-[15px]"><summary className="cursor-pointer font-semibold">Your answers so far ({c.questions.filter((x) => x.state !== 'unanswered').length})</summary>
          <ol className="mt-3 space-y-3">{c.questions.filter((x) => x.state !== 'unanswered').map((x) => <li key={x.id} className="rounded-2xl bg-page p-4"><p className="font-semibold">{x.questionText}</p><p className="mt-1 text-muted">{x.state === 'skipped' ? 'Skipped' : x.answer?.body}</p></li>)}</ol>
        </details>
      )}
      <details className="mt-4 text-[13px] text-muted"><summary className="cursor-pointer">Demo helper: fictional answers for Ravi Das (C40)</summary><p className="mt-2">Q1: {c40.q1}</p><p className="mt-1">Q2: {c40.q2}</p></details>
      <p className="sr-only">{providerLabel()}. Topics covered: {topics.join(', ') || 'none yet'}.</p>
    </div>
  );
}
