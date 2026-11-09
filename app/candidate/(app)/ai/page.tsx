import Link from 'next/link';
import { pageViewer } from '@/server/page-auth';
import { aiHelperStatus } from '@/server/connectors/status';
import { PageHeader, Card, Badge, LinkButton, Tabs } from '@/components/ui';
import { ActionButton } from '@/components/client';
import { CopyBox } from '@/components/copy-box';
import { date } from '@/lib/format';
import { AI_APPS } from '@/lib/ai-connect';

export const dynamic = 'force-dynamic';

const STARTER = 'Help me answer my Elsewhere questions.';

export default async function AiHelper({ searchParams }: { searchParams: Promise<{ app?: string }> }) {
  const { ctx } = await pageViewer('candidate');
  const s = await aiHelperStatus(ctx);
  const app = (await searchParams).app === 'claude' ? 'claude' : 'chatgpt';
  const how = AI_APPS[app];
  return (
    <div className="mx-auto max-w-[760px]">
      <PageHeader title="Your AI" subtitle="Your own ChatGPT or Claude prepares drafts. You check them and send them yourself." back={{ href: '/candidate/home', label: 'Home' }} />

      {s.waiting.length > 0 && (
        <Card title={`${s.waiting.length} answer${s.waiting.length > 1 ? 's' : ''} ready to check`} className="mb-4">
          <ul className="space-y-2">
            {s.waiting.slice(0, 5).map((w) => (
              <li key={w.questionId} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-line px-3 py-2 text-[15px]">
                <span className="min-w-0 flex-1">{w.question}</span>
                <LinkButton href={`/candidate/conversation/${w.conversationId}?q=${w.questionId}`}>Check and send</LinkButton>
              </li>
            ))}
          </ul>
        </Card>
      )}

      {s.connections.length > 0 ? (
        <Card title="Connected" action={<Badge tone="success">On</Badge>} className="mb-4">
          <ul className="divide-y divide-line">
            {s.connections.map((a) => (
              <li key={a.id} className="flex flex-wrap items-center justify-between gap-2 py-2 text-[15px]">
                <span><span className="font-medium">{a.name}</span> <span className="text-muted">· since {date(a.createdAt)}{a.lastUsedAt ? ` · last used ${date(a.lastUsedAt)}` : ''}</span></span>
                <ActionButton path={`connectors/${a.id}/disconnect`} label="Disconnect" variant="secondary" confirm={{ title: 'Disconnect?', body: <p>{a.name} will lose access straight away. Drafts it already saved stay here for you.</p>, confirmLabel: 'Disconnect' }} />
              </li>
            ))}
          </ul>
          <p className="mt-3 text-[15px]">Now ask it:</p>
          <div className="mt-2"><CopyBox text={STARTER} label="Message to send your AI" /></div>
          <p className="mt-2 text-[14px] text-muted">{s.unanswered ? `You have ${s.unanswered} question${s.unanswered > 1 ? 's' : ''} it can help with.` : <>No questions waiting. <Link href="/candidate/check-ins">Start a check-in</Link> to get a new one.</>}</p>
        </Card>
      ) : null}

      <Card title={s.connections.length ? 'Connect another' : 'Connect in 3 steps'}>
        <Tabs current={app} tabs={[{ key: 'chatgpt', label: 'ChatGPT', href: '/candidate/ai?app=chatgpt' }, { key: 'claude', label: 'Claude', href: '/candidate/ai?app=claude' }]} />
        <ol className="mt-4 space-y-3">
          {how.steps.map((t, i) => (
            <li key={t} className="flex gap-3 text-[16px]">
              <span aria-hidden className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-page font-semibold">{i + 1}</span>
              <span className="pt-1">{t}</span>
            </li>
          ))}
        </ol>
        <div className="mt-4"><CopyBox text={s.connectorUrl} label="Connector address" /></div>
        <p className="mt-3 text-[14px] text-muted">{how.note}</p>
      </Card>

      <ul className="mt-4 grid gap-2 text-[14px] sm:grid-cols-3">
        <li className="rounded-lg bg-page p-3">✓ Uses your own {how.name} plan</li>
        <li className="rounded-lg bg-page p-3">✓ Never sends anything for you</li>
        <li className="rounded-lg bg-page p-3">✓ Can’t see anyone else</li>
      </ul>
    </div>
  );
}
