import Link from 'next/link';
import { redirect } from 'next/navigation';
import { ChevronRight, Plus } from 'lucide-react';
import { gateOk } from '@/server/page-auth';
import { getActiveDataset } from '@/server/services/context';
import { realClients } from '@/server/services/demo';
import { Brand } from '@/components/shell';
import { PhotoBackdrop } from '@/components/photo-backdrop';
import { AccountButton, NewClientButton } from '../demo-entry';

export const dynamic = 'force-dynamic';

const row = 'flex items-center gap-4 rounded-[24px] bg-surface px-5 py-4 text-ink no-underline shadow-[0_8px_24px_-12px_rgb(18_37_29/0.3)]';

export default async function DemoClients() {
  if (!(await gateOk())) redirect('/demo');
  const ds = await getActiveDataset();
  const clients = ds ? await realClients(ds.id) : [];
  return (
    <main className="relative isolate min-h-screen overflow-x-clip px-5 pb-12 pt-8 lg:px-10">
      <PhotoBackdrop height={380} />
      <div className="mx-auto max-w-[640px]">
        <span className="[&_*]:text-white"><Brand sub="Elsewhere" /></span>
        <p className="mt-8"><Link href="/demo/personas" className="text-[15px] text-white/90">← Back</Link></p>
        <h1 className="mt-2 text-[40px] leading-[1.05] text-white">Clients</h1>
        <ul className="mt-8 space-y-3">
          <li>
            <NewClientButton className={row}>
              <span aria-hidden className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-primary text-white"><Plus size={22} /></span>
              <span className="flex-1"><span className="block text-[19px] font-semibold">New blank client</span><span className="text-[14px] text-muted">A fresh company with 10 credits</span></span>
              <ChevronRight aria-hidden className="text-muted" />
            </NewClientButton>
          </li>
          {clients.map((c) => (
            <li key={c.userId}>
              <AccountButton userId={c.userId} className={row}>
                <span aria-hidden className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-page font-display text-[15px] font-semibold text-primary">{c.credits}</span>
                <span className="flex-1"><span className="block text-[19px] font-semibold">{c.company}</span><span className="text-[14px] text-muted">{c.contact} · {c.credits} credits</span></span>
                <ChevronRight aria-hidden className="text-muted" />
              </AccountButton>
            </li>
          ))}
        </ul>
      </div>
    </main>
  );
}
