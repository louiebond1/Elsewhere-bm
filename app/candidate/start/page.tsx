import Link from 'next/link';
import { redirect } from 'next/navigation';
import { gateOk } from '@/server/page-auth';
import { Brand } from '@/components/shell';
import { PhotoBackdrop } from '@/components/photo-backdrop';
import { SignupForm } from './signup-form';

export const dynamic = 'force-dynamic';

/** Join: three boxes and one tick. Everything else comes later, mostly from their own AI. */
export default async function Start() {
  if (!(await gateOk())) redirect('/demo');
  return (
    <main className="relative isolate min-h-screen overflow-x-clip px-5 pb-16 pt-8 lg:px-10">
      <PhotoBackdrop height={820} />
      <div className="mx-auto flex max-w-[1180px] items-center justify-between"><span className="[&_*]:text-white"><Brand sub="Elsewhere" /></span><Link href="/login" className="text-[16px] font-semibold text-white">Log in</Link></div>
      <div className="mx-auto mt-12 grid max-w-[1180px] gap-10 lg:mt-20 lg:grid-cols-[1fr_460px] lg:items-start">
        <div className="text-white">
          <h1 className="text-[44px] leading-[1.05] text-white lg:text-[64px]">Let your experience speak.</h1>
          <p className="mt-4 max-w-[42ch] text-[18px] text-white/90 lg:text-[20px]">Get interviewed for every job that fits, by a mini-me that knows your work inside out. Your name stays hidden until you say yes. Candidates never pay.</p>
        </div>
        <SignupForm />
      </div>
    </main>
  );
}
