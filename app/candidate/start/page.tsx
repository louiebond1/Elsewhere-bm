import { redirect } from 'next/navigation';
import { gateOk } from '@/server/page-auth';
import { Brand } from '@/components/shell';
import { SignupForm } from './signup-form';

export const dynamic = 'force-dynamic';

export default async function Start() {
  if (!(await gateOk())) redirect('/demo');
  return (
    <>
      <div className="bg-primary px-4 py-1.5 text-[13px] text-white">Demo using fictional data</div>
      <main className="mx-auto max-w-2xl px-4 py-8">
        <Brand sub="Your Elsewhere profile" />
        <ol className="mt-6 flex gap-2 text-[13px] text-muted" aria-label="Steps"><li className="font-semibold text-ink">1 Basics</li><li>2 CV</li><li>3 Conversation</li><li>4 Review</li></ol>
        <h1 className="mt-3">Create a fictional candidate</h1>
        <p className="mt-2 text-[15px]">You choose who sees your name. Candidates never pay.</p>
        <SignupForm />
      </main>
    </>
  );
}
