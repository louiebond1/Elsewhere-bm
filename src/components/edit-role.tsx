import { notFound } from 'next/navigation';
import { pageViewer } from '@/server/page-auth';
import { roleForActor, criteriaFor } from '@/server/services/roles';
import { activeContractForClient } from '@/server/services/contracts';
import { PageHeader } from '@/components/ui';
import { RoleForm } from '@/components/role-form';
import { isUuid } from '@/server/lib/ids';

export async function EditRole({ id, base, type }: { id: string; base: string; type: 'client' | 'consultant' }) {
  const { ctx } = await pageViewer(type);
  if (!isUuid(id)) notFound();
  const role = await roleForActor(ctx, id).catch(() => null);
  if (!role) notFound();
  const crit = await criteriaFor(ctx, id);
  const c = await activeContractForClient(ctx, role.clientId);
  return (
    <>
      <PageHeader title={`Edit ${role.title}`} back={{ href: `${base}/roles/${id}`, label: 'Back to role' }} subtitle={role.status === 'draft' ? 'Draft: every field can change.' : 'Pricing is locked. Changing the brief or criteria refreshes matches.'} />
      <RoleForm ratePence={c?.creditRatePence ?? 380000} base={base} roleId={id} rowVersion={role.rowVersion} locked={role.status !== 'draft'}
        initial={{ vacancyKey: role.vacancyKey, title: role.title, roleFamily: role.roleFamily, salaryPounds: String(Number(role.salaryPence / 100n)), locationRegion: role.locationRegion, workMode: role.workMode, outcomes: role.outcomes.join('\n'), teachableSkills: role.teachableSkills.join('\n'), briefText: role.briefText, serviceMode: role.defaultServiceMode, criteria: crit.map((x) => ({ key: x.criterionKey, label: x.label, description: x.description, importance: x.importance, weight: x.weight, evidenceTags: x.evidenceTags })) }} />
    </>
  );
}
