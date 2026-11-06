import { notFound } from 'next/navigation';
import { pageViewer } from '@/server/page-auth';
import { activeContractForClient } from '@/server/services/contracts';
import { PageHeader, Notice } from '@/components/ui';
import { RoleForm } from '@/components/role-form';
import { isUuid } from '@/server/lib/ids';

export default async function NewRole({ searchParams }: { searchParams: Promise<{ client?: string }> }) {
  const { ctx } = await pageViewer('consultant');
  const clientId = (await searchParams).client;
  if (!clientId || !isUuid(clientId)) notFound();
  const c = await activeContractForClient(ctx, clientId);
  return (
    <>
      <PageHeader title="Add role for client" back={{ href: `/consultant/clients/${clientId}?tab=roles`, label: 'Client roles' }} subtitle="The same validations and pricing apply as when the client adds a role." />
      {!c ? <Notice tone="warning">This client has no active contract.</Notice> : <RoleForm clientId={clientId} ratePence={c.creditRatePence ?? 380000} base="/consultant" />}
    </>
  );
}
