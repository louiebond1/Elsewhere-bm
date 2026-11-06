import { EditRole } from '@/components/edit-role';

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  return EditRole({ id: (await params).id, base: '/consultant', type: 'consultant' });
}
