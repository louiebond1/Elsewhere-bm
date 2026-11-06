import Link from 'next/link';
import { eq } from 'drizzle-orm';
import { pageViewer } from '@/server/page-auth';
import { clientsList } from '@/server/views/consultant';
import { users } from '@/server/db/schema';
import { PageHeader, Card, Badge } from '@/components/ui';
import { SimpleForm } from '@/components/consultant-forms';
import { creditsLabel, label } from '@/lib/format';

export default async function Clients() {
  const { ctx, viewer } = await pageViewer('consultant');
  const rows = await clientsList(ctx);
  const cons = await ctx.tx.select({ id: users.id, name: users.displayName }).from(users).where(eq(users.userType, 'consultant'));
  return (
    <>
      <PageHeader title="Clients" />
      <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
        <div className="space-y-3">{rows.map((r) => (
          <Link key={r.c.id} href={`/consultant/clients/${r.c.id}`} className="block rounded-xl border border-line bg-surface p-4 no-underline hover:border-primary">
            <div className="flex items-center justify-between"><span className="font-semibold text-ink">{r.name}</span><Badge tone={r.c.status === 'active' ? 'success' : 'neutral'}>{label(r.c.status)}</Badge></div>
            <p className="mt-1 text-[14px] text-muted">{r.c.contactName} · Consultant {r.consultant} · {creditsLabel(r.wallet.posted)}</p>
          </Link>
        ))}</div>
        <Card title="Add client">
          <SimpleForm path="consultant/clients" submitLabel="Create client" redirect="/consultant/clients/{id}" fields={[
            { name: 'name', label: 'Organisation name (fictional)', required: true },
            { name: 'domain', label: 'Domain', hint: 'For example example.test' },
            { name: 'contactName', label: 'Contact name', required: true },
            { name: 'contactEmail', label: 'Contact email', type: 'email', required: true },
            { name: 'consultantUserId', label: 'Named consultant', options: cons.map((c) => [c.id, c.name ?? '']), defaultValue: viewer.actor.userId },
          ]} />
        </Card>
      </div>
    </>
  );
}
