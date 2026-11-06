import Link from 'next/link';
import { pageViewer } from '@/server/page-auth';
import { candidatesList } from '@/server/views/consultant';
import { PageHeader, Badge, ResponsiveTable } from '@/components/ui';
import { label } from '@/lib/format';

export default async function Candidates({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const { ctx } = await pageViewer('consultant');
  const q = (await searchParams).q ?? '';
  const rows = await candidatesList(ctx, q);
  return (
    <>
      <PageHeader title="Candidates" subtitle="Private identities are visible to BondMoran only. Only the candidate can change their visibility to clients or accept an introduction." />
      <form className="mb-4"><input name="q" defaultValue={q} placeholder="Search name, reference or role family" aria-label="Search candidates" className="h-11 w-full max-w-md rounded-lg border border-line bg-surface px-3" /></form>
      <ResponsiveTable rowKey={(r) => r.c.id} rows={rows} columns={[
        { label: 'Reference', cell: (r) => <Link href={`/consultant/candidates/${r.c.id}`}>{r.c.publicRef}</Link> },
        { label: 'Name', cell: (r) => r.name ?? 'Deleted' },
        { label: 'Families', cell: (r) => r.c.preferredRoleFamilies.join(', ') },
        { label: 'Status', cell: (r) => <span className="flex flex-wrap justify-end gap-1 md:justify-start"><Badge tone={r.c.status === 'active' ? 'success' : 'neutral'}>{label(r.c.status)}</Badge>{!r.c.discoveryEnabled && <Badge>Visible to clients: No</Badge>}{r.c.employerResolutionStatus === 'unresolved' && <Badge tone="warning">Employer to confirm</Badge>}{r.pendingReview && <Badge tone="warning">Review</Badge>}</span> },
      ]} />
    </>
  );
}
