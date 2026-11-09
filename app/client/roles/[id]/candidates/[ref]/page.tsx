import { notFound } from 'next/navigation';
import { pageViewer } from '@/server/page-auth';
import { CandidateDetail } from '@/components/candidate-detail';
import { AppError } from '@/server/lib/errors';
import { isUuid } from '@/server/lib/ids';

export default async function Page({ params, searchParams }: { params: Promise<{ id: string; ref: string }>; searchParams: Promise<{ view?: string }> }) {
  const { ctx } = await pageViewer('client');
  const { id, ref } = await params;
  const { view } = await searchParams;
  if (!isUuid(id) || !/^R[0-9a-f]{20}$/.test(ref)) notFound();
  try {
    return await CandidateDetail({ ctx, roleId: id, candidateRef: ref, base: '/client', view });
  } catch (e) {
    if (e instanceof AppError && e.status === 404) notFound();
    throw e;
  }
}
