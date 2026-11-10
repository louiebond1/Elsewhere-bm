import { pageViewer } from '@/server/page-auth';
import { chatMessages } from '@/server/services/mini-me-chat';
import { PageHeader } from '@/components/ui';
import { MiniMeChat } from '@/components/mini-me-chat';

export const dynamic = 'force-dynamic';

export default async function MiniMeChatPage() {
  const { ctx } = await pageViewer('candidate');
  const msgs = await chatMessages(ctx);
  return (
    <div className="mx-auto max-w-[860px]">
      <PageHeader compact back={{ href: '/candidate/onboarding', label: 'Your mini-me' }} title="Build your mini-me" subtitle="No ChatGPT or Claude needed. Chat here: everything you say goes straight into your mini-me." />
      <MiniMeChat initial={msgs.map((m) => ({ role: m.role as 'assistant' | 'user', text: m.text }))} />
    </div>
  );
}
