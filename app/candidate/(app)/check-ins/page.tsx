import Link from 'next/link';
import { pageViewer } from '@/server/page-auth';
import { candidateOverview } from '@/server/views/candidate';
import { PageHeader, Card, Empty } from '@/components/ui';
import { ActionButton } from '@/components/client';
import { date } from '@/lib/format';

export default async function CheckIns() {
  const { ctx } = await pageViewer('candidate');
  const o = await candidateOverview(ctx);
  const gaps = (((o.profile?.feedbackLive ?? o.profile?.feedback) as { gaps?: { text: string; topic: string }[] } | null)?.gaps ?? []);
  const active = o.conversations.find((c) => c.status !== 'completed');
  const initialDone = o.conversations.some((c) => c.kind === 'initial_screening' && c.status === 'completed');
  return (
    <>
      <PageHeader title="Check-ins" subtitle="Share more when it is useful to you. Up to three short questions per check-in." />
      <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
        <div className="space-y-3">
          <h2 className="text-[20px]">Suggested questions</h2>
          {gaps.length ? gaps.map((g) => <Card key={g.text}><p className="text-[15px]">{g.text}</p><p className="mt-1 text-[13px] text-muted">Topic: {g.topic}. Why it helps: employers see a specific example instead of Unknown.</p></Card>) : <Empty>No suggestions yet.</Empty>}
          <h2 className="mt-6 text-[20px]">Completed</h2>
          {o.conversations.filter((c) => c.status === 'completed').map((c) => <Card key={c.id}><p className="text-[15px]">{c.kind === 'initial_screening' ? 'First conversation' : 'Check-in'} · {c.questionCount} questions · {date(c.completedAt)}</p></Card>)}
        </div>
        <Card title="Start">
          {active ? <Link href={`/candidate/conversation/${active.id}`}>Continue your {active.kind === 'initial_screening' ? 'first conversation' : 'check-in'}</Link>
            : <ActionButton path="conversations/start" body={{ kind: initialDone ? 'check_in' : 'initial_screening' }} label={initialDone ? 'Start check-in' : 'Start your first conversation'} redirect="/candidate/conversation/{id}" />}
          <p className="mt-3 text-[13px] text-muted">Text only. There is no streak and nothing is lost if you take a break.</p>
        </Card>
      </div>
    </>
  );
}
