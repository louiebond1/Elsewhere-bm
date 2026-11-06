import { pageViewer } from '@/server/page-auth';
import { clientSummary } from '@/server/views/client';
import { PageHeader, Card } from '@/components/ui';
import { SimpleForm } from '@/components/consultant-forms';

export default async function Support() {
  const { viewer, ctx } = await pageViewer('client');
  const c = await clientSummary(ctx, viewer.actor.clientId!);
  return (
    <>
      <PageHeader title="Support" subtitle="Your named consultant handles every request." />
      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        <Card title="Send a request">
          <SimpleForm path="notifications/support-request" submitLabel="Send" fields={[{ name: 'category', label: 'Category', options: [['role', 'A role'], ['candidate', 'A candidate'], ['training', 'Training'], ['credits', 'Credits'], ['other', 'Something else']], defaultValue: 'role' }, { name: 'message', label: 'Message', textarea: true }]} />
          <p className="mt-3 text-[13px] text-muted">Demo request saved in the app. No email is sent.</p>
        </Card>
        <Card title="Your consultant"><p className="font-semibold">{c.consultant.name}</p><p className="text-[14px] text-muted">{c.consultant.email}</p></Card>
      </div>
    </>
  );
}
