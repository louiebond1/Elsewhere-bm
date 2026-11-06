import { notFound } from 'next/navigation';
import { pageViewer } from '@/server/page-auth';
import { CandidateDetail } from '@/components/candidate-detail';
import { AppError } from '@/server/lib/errors';
import { isUuid } from '@/server/lib/ids';

export default async function Page({ params }: { params: Promise<{ id: string; ref: string }> }) {
  const { ctx } = await pageViewer('client');
  const { id, ref } = await params;
  if (!isUuid(id) || !/^R[0-9a-f]{20}$/.test(ref)) notFound();
  try {
    return await CandidateDetail({ ctx, roleId: id, ref, base: '/client' });
  } catch (e) {
    if (e instanceof AppError && e.status === 404) notFound();
    throw e;
  }
}
