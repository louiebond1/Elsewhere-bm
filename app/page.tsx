import { redirect } from 'next/navigation';
import { gateOk, optionalViewer } from '@/server/page-auth';

export const dynamic = 'force-dynamic';

export default async function Home() {
  if (!(await gateOk())) redirect('/demo');
  const v = await optionalViewer();
  if (!v) redirect('/login');
  redirect(`/${v.actor.userType}/home`);
}
