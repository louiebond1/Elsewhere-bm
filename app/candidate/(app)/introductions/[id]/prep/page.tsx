import { pageViewer } from '@/server/page-auth';
import { PrepPage } from '@/components/prep-page';

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { ctx } = await pageViewer('candidate');
  return PrepPage({ ctx, introId: (await params).id, back: { href: '/candidate/introductions?tab=accepted', label: 'Requests' } });
}
