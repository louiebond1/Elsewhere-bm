import Link from 'next/link';
import { redirect } from 'next/navigation';
import { ChevronRight, Plus } from 'lucide-react';
import { gateOk } from '@/server/page-auth';
import { getActiveDataset } from '@/server/services/context';
import { realCandidates } from '@/server/services/demo';
import { Brand } from '@/components/shell';
import { PhotoBackdrop } from '@/components/photo-backdrop';
import { AccountButton } from '../demo-entry';

export const dynamic = 'force-dynamic';

const row = 'flex items-center gap-4 rounded-[24px] bg-surface px-5 py-4 text-ink no-underline shadow-[0_8px_24px_-12px_rgb(18_37_29/0.3)]';

export default async function DemoCandidates() {
  if (!(await gateOk())) redirect('/demo');
  const ds = await getActiveDataset();
  const people = ds ? await realCandidates(ds.id) : [];
  return (
    <main className="relative isolate min-h-screen overflow-x-clip px-5 pb-12 pt-8 lg:px-10">
      <PhotoBackdrop height={380} />
      <div className="mx-auto max-w-[640px]">
        <span className="[&_*]:text-white"><Brand sub="Elsewhere" /></span>
        <p className="mt-8"><Link href="/demo/personas" className="text-[15px] text-white/90">← Back</Link></p>
        <h1 className="mt-2 text-[40px] leading-[1.05] text-white">Candidates</h1>
        <ul className="mt-8 space-y-3">
          {people.map((p) => (
            <li key={p.userId}>
              <AccountButton userId={p.userId} className={row}>
                <span aria-hidden className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-primary font-display text-[17px] font-semibold text-white">{p.name.split(' ').map((w) => w[0]).slice(0, 2).join('').toUpperCase()}</span>
                <span className="flex-1"><span className="block text-[19px] font-semibold">{p.name}</span><span className="text-[14px] text-muted">{p.status === 'paused' ? 'Hidden from employers' : 'Your account'}</span></span>
                <ChevronRight aria-hidden className="text-muted" />
              </AccountButton>
            </li>
          ))}
          <li>
            <Link href="/candidate/start" className={row}>
              <span aria-hidden className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-page text-primary"><Plus size={22} /></span>
              <span className="flex-1"><span className="block text-[19px] font-semibold">Add new</span><span className="text-[14px] text-muted">Sign up a new candidate</span></span>
              <ChevronRight aria-hidden className="text-muted" />
            </Link>
          </li>
        </ul>
      </div>
    </main>
  );
}
