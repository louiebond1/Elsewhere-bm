import { notFound } from 'next/navigation';
import { pageViewer } from '@/server/page-auth';
import { RoleDetail } from '@/components/role-detail';
import { isUuid } from '@/server/lib/ids';
import { AppError } from '@/server/lib/errors';

export default async function RolePage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ tab?: string }> }) {
  const { ctx } = await pageViewer('client');
  const { id } = await params;
  const { tab } = await searchParams;
  if (!isUuid(id)) notFound();
  try {
    return await RoleDetail({ ctx, roleId: id, tab: tab ?? 'matches', base: '/client' });
  } catch (e) {
    if (e instanceof AppError && e.status === 404) notFound();
    throw e;
  }
}
