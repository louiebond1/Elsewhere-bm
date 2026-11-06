import { pageViewer } from '@/server/page-auth';
import { PrepPage } from '@/components/prep-page';
import { PrepEditor } from '@/components/screening-forms';
import { prepFor } from '@/server/services/prep';

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { ctx } = await pageViewer('consultant');
  const { id } = await params;
  const p = await prepFor(ctx, id).catch(() => null);
  return PrepPage({ ctx, introId: id, back: { href: '/consultant/home', label: 'Work queue' }, editor: p ? <PrepEditor introId={id} initial={{ questions: p.questions, discussionPoints: p.discussionPoints }} evidence={p.evidence} /> : null });
}
