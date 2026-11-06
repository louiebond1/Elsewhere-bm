import { redirect } from 'next/navigation';
import { gateOk } from '@/server/page-auth';
import { Brand } from '@/components/shell';
import { GateForm } from './gate-form';

export const dynamic = 'force-dynamic';

export default async function Gate() {
  if (await gateOk()) redirect('/demo/personas');
  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-4">
      <div className="mb-6"><Brand /></div>
      <div className="rounded-xl border border-line bg-surface p-5">
        <h1 className="text-[24px]">Private demo</h1>
        <p className="mt-2 text-[15px] text-muted">This prototype uses fictional people, employers and data only. Enter the access password you were given.</p>
        <GateForm />
      </div>
      <p className="mt-6 text-center text-[12px] text-muted">Powered by Elsewhere</p>
    </main>
  );
}
