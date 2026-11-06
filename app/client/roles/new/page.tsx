import { pageViewer } from '@/server/page-auth';
import { activeContractForClient } from '@/server/services/contracts';
import { PageHeader, Notice } from '@/components/ui';
import { RoleForm } from '@/components/role-form';

export default async function NewRole() {
  const { viewer, ctx } = await pageViewer('client');
  const c = await activeContractForClient(ctx, viewer.actor.clientId!);
  return (
    <>
      <PageHeader title="Add role" back={{ href: '/client/roles', label: 'Roles' }} subtitle="Saving a draft is free. You choose when to activate." />
      {!c ? <Notice tone="warning">Your contract is not active yet. Ask your consultant.</Notice> : <RoleForm ratePence={c.creditRatePence ?? 380000} base="/client" />}
    </>
  );
}
