import Link from 'next/link';
import { pageViewer } from '@/server/page-auth';
import { rolesForClient } from '@/server/views/client';
import { PageHeader, Tabs, LinkButton, Empty, Badge } from '@/components/ui';
import { ReopenRole } from '@/components/role-actions';
import { gbp, label, creditsLabel } from '@/lib/format';

export default async function Roles({ searchParams }: { searchParams: Promise<{ tab?: string; q?: string }> }) {
  const { viewer, ctx } = await pageViewer('client');
  const sp = await searchParams;
  const tab = sp.tab ?? 'open';
  const all = await rolesForClient(ctx, viewer.actor.clientId!);
  const q = (sp.q ?? '').toLowerCase();
  const rows = all.filter((r) => r.status === tab && (!q || `${r.title} ${r.vacancyKey}`.toLowerCase().includes(q)));
  return (
    <>
      <PageHeader title="Roles" actions={<LinkButton href="/client/roles/new">Add role</LinkButton>} />
      <Tabs current={tab} tabs={['open', 'draft', 'closed'].map((t) => ({ key: t, label: label(t), href: `/client/roles?tab=${t}`, count: all.filter((r) => r.status === t).length }))} />
      <form className="mb-4"><input type="hidden" name="tab" value={tab} /><input name="q" defaultValue={sp.q} placeholder="Search title or vacancy reference" aria-label="Search roles" className="h-11 w-full max-w-md rounded-lg border border-line bg-surface px-3" /></form>
      {rows.length === 0 ? <Empty action={tab === 'open' ? <LinkButton href="/client/roles/new">Add role</LinkButton> : undefined}>{tab === 'open' ? 'Add your first role to see matched candidates.' : `No ${tab} roles.`}</Empty> : (
        <div className="space-y-3">
          {rows.map((r) => (
            <div key={r.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-line bg-surface p-4">
              <div>
                <Link href={`/client/roles/${r.id}`} className="font-semibold no-underline">{r.title}</Link> <span className="text-muted">· {r.vacancyKey}</span>
                <div className="mt-1 flex flex-wrap gap-1">{r.isExtra && <Badge>Extra role</Badge>}{r.isReplacement && <Badge tone="success">Replacement</Badge>}{r.mode === 'full_search' && <Badge tone="primary">Full search</Badge>}</div>
                <p className="mt-1 text-[14px] text-muted">{gbp(r.salaryPence)} · {label(r.workMode)}{r.charges ? ` · ${r.charges.accepted} of ${r.charges.maxIntros} intros · ${r.activePipe} in pipeline · ${creditsLabel(r.charges.totalUnits)} / ${gbp(r.charges.totalPence)}` : ''}</p>
              </div>
              {r.status === 'closed' && <ReopenRole roleId={r.id} />}
            </div>
          ))}
        </div>
      )}
    </>
  );
}
