import { pageViewer } from '@/server/page-auth';
import { PrepPage } from '@/components/prep-page';

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { ctx } = await pageViewer('client');
  return PrepPage({ ctx, introId: (await params).id, back: { href: '/client/home', label: 'Home' } });
}
