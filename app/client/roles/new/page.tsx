import { pageViewer } from '@/server/page-auth';
import { activeContractForClient } from '@/server/services/contracts';
import { assistantView } from '@/server/services/hiring-assistant';
import { aiMode } from '@/server/ai';
import { PageHeader, Notice } from '@/components/ui';
import { RoleForm } from '@/components/role-form';
import { HiringAssistant } from '@/components/hiring-assistant';

export default async function NewRole({ searchParams }: { searchParams: Promise<{ form?: string }> }) {
  const { viewer, ctx } = await pageViewer('client');
  const sp = await searchParams;
  const c = await activeContractForClient(ctx, viewer.actor.clientId!);
  if (!c) return (<><PageHeader title="Add a role" back={{ href: '/client/roles', label: 'Roles' }} /><Notice tone="warning">Your contract is not active yet. Ask your consultant.</Notice></>);
  if (sp.form === '1') {
    return (
      <>
        <PageHeader title="Add a role (form)" back={{ href: '/client/roles/new', label: 'Back to your assistant' }} subtitle="Saving a draft is free. You choose when to make it live." />
        <RoleForm ratePence={c.creditRatePence ?? 380000} base="/client" />
      </>
    );
  }
  const v = await assistantView(ctx);
  return (
    <>
      <PageHeader title="Add a role" back={{ href: '/client/roles', label: 'Roles' }} subtitle="Tell your hiring assistant who you need. It sets up the role for you." />
      <HiringAssistant conversationId={v.conversationId} messages={v.messages} understanding={v.understanding} lastAsked={v.lastAsked} facts={v.facts.map((f) => ({ id: f.id, text: f.text }))} ratePence={c.creditRatePence ?? 380000} demo={aiMode() !== 'live'} />
    </>
  );
}
