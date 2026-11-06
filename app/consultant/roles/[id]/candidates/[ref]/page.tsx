import { notFound } from 'next/navigation';
import { pageViewer } from '@/server/page-auth';
import { CandidateDetail } from '@/components/candidate-detail';
import { AppError } from '@/server/lib/errors';
import { isUuid } from '@/server/lib/ids';

export default async function Page({ params }: { params: Promise<{ id: string; ref: string }> }) {
  const { ctx } = await pageViewer('consultant');
  const { id, ref } = await params;
  if (!isUuid(id)) notFound();
  try {
    return await CandidateDetail({ ctx, roleId: id, candidateRef: ref, base: '/consultant' });
  } catch (e) {
    if (e instanceof AppError && e.status === 404) notFound();
    throw e;
  }
}
