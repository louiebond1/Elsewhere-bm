import { redirect } from 'next/navigation';
import Link from 'next/link';
import { gateOk } from '@/server/page-auth';
import { getActiveDataset } from '@/server/services/context';
import { Brand } from '@/components/shell';
import { LoginForm } from './login-form';

export const dynamic = 'force-dynamic';

export default async function Login() {
  if (!(await gateOk())) redirect('/demo');
  const ds = await getActiveDataset();
  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-4">
      <div className="mb-6"><Brand /></div>
      <div className="rounded-xl border border-line bg-surface p-5">
        <h1 className="text-[24px]">Sign in</h1>
        {!ds ? <p className="mt-3 text-[15px] text-muted">Demo setup is not complete yet.</p> : <LoginForm />}
      </div>
      <p className="mt-4 text-center text-[14px]"><Link href="/demo/personas">Choose a fictional demo account instead</Link> · <Link href="/candidate/start">Create a fictional candidate</Link></p>
    </main>
  );
}
