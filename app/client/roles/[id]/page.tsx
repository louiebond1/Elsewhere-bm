import { notFound } from 'next/navigation';
import { pageViewer } from '@/server/page-auth';
import { RoleDetail } from '@/components/role-detail';
import { isUuid } from '@/server/lib/ids';
import { AppError } from '@/server/lib/errors';

export default async function RolePage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ tab?: string; show?: string;version?:string }> }) {
  const { ctx } = await pageViewer('client');
  const { id } = await params;
  const { tab, show,version } = await searchParams;
  if (!isUuid(id)) notFound();
  try {
    return await RoleDetail({ ctx, roleId: id, tab: tab ?? 'matches', base: '/client', show: Number(show),version:Number(version)||undefined });
  } catch (e) {
    if (e instanceof AppError && e.status === 404) notFound();
    throw e;
  }
}
