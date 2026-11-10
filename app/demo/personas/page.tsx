import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Building2, ChevronRight, UserRound, BriefcaseBusiness } from 'lucide-react';
import { gateOk } from '@/server/page-auth';
import { getActiveDataset } from '@/server/services/context';
import { demoConsultant } from '@/server/services/demo';
import { Brand } from '@/components/shell';
import { PhotoBackdrop } from '@/components/photo-backdrop';
import { AccountButton } from '../demo-entry';

export const dynamic = 'force-dynamic';

const card = 'lift flex h-full flex-col rounded-[28px] bg-surface p-7 text-ink no-underline shadow-[0_16px_40px_-20px_rgb(18_37_29/0.35)]';

/** The demo entry: three doors. Everything else lives on Tester tools. */
export default async function DemoEntry() {
  if (!(await gateOk())) redirect('/demo');
  const ds = await getActiveDataset();
  const bm = ds ? await demoConsultant(ds.id) : null;
  const inner = (Icon: typeof UserRound, title: string, text: string) => (
    <>
      <Icon aria-hidden size={34} strokeWidth={1.6} className="text-primary" />
      <span className="mt-5 block font-display text-[28px] font-extrabold leading-tight">{title}</span>
      <span className="mt-2 block flex-1 text-[16px] text-muted">{text}</span>
      <span className="mt-6 inline-flex items-center gap-1 font-semibold text-primary">Go in <ChevronRight aria-hidden size={18} /></span>
    </>
  );
  return (
    <main className="relative isolate min-h-screen overflow-x-clip px-5 pb-12 pt-8 lg:px-10">
      <PhotoBackdrop height={460} />
      <div className="mx-auto max-w-[1080px]">
        <span className="[&_*]:text-white"><Brand sub="Elsewhere" /></span>
        <h1 className="mt-10 text-[40px] leading-[1.05] text-white lg:text-[56px]">Who are you today?</h1>
        <p className="mt-3 text-[18px] text-white/90">{ds ? 'Pick a side. You can switch any time.' : 'Setup is not complete yet.'}</p>
        <div className="mt-10 grid gap-5 md:grid-cols-3">
          {bm ? <AccountButton userId={bm.userId} className={card}>{inner(Building2, 'BondMoran', 'Clients, their credits, and who they’ve asked to screen.')}</AccountButton> : <div className={card}>{inner(Building2, 'BondMoran', 'Not set up yet.')}</div>}
          <Link href="/demo/candidates" className={card}>{inner(UserRound, 'Candidate', 'Louie Bond, or anyone you’ve signed up. Or add someone new.')}</Link>
          <Link href="/demo/clients" className={card}>{inner(BriefcaseBusiness, 'Client', 'A blank company with 10 credits. Post a job, see who matches.')}</Link>
        </div>
        <p className="mt-10 text-center text-[14px] text-muted"><Link href="/demo/tools" className="text-muted">Tester tools</Link> · fictional demo accounts, scenarios and reset</p>
      </div>
    </main>
  );
}
