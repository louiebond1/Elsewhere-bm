import { notFound } from 'next/navigation';
import { pageViewer } from '@/server/page-auth';
import { myInterview } from '@/server/services/candidate-interviews';
import { isUuid } from '@/server/lib/ids';
import { PageHeader } from '@/components/ui';
import { AddToAnswer } from '@/components/interview-feedback';
import { label } from '@/lib/format';

export const dynamic = 'force-dynamic';

/** One interview, as a conversation: the question, how their mini-me answered, and a way to add more. */
export default async function Interview({ params }: { params: Promise<{ roleId: string }> }) {
  const { ctx } = await pageViewer('candidate');
  const { roleId } = await params;
  if (!isUuid(roleId)) notFound();
  const i = await myInterview(ctx, roleId).catch(() => null);
  if (!i) notFound();
  return (
    <div className="mx-auto max-w-[860px]">
      <PageHeader back={{ href: '/candidate/interviews', label: 'Your interviews' }} title={i.title} subtitle={`${label(i.mode)} · ${label(i.region)} · interviewed ${new Date(i.at).toLocaleDateString('en-GB', { day: 'numeric', month: 'long' })}. The employer only sees your mini-me, never your name.`} />
      <ol className="space-y-4">
        {i.answers.map((a, n) => (
          <li key={n} className="rounded-3xl bg-surface p-6 shadow-[0_8px_24px_rgb(18_37_29/0.06)] lg:p-7">
            <p className="text-[13px] font-semibold uppercase tracking-wide text-muted">Question {n + 1}</p>
            <p className="mt-1 font-display text-[20px] font-semibold leading-snug">{a.question}</p>
            {a.answer
              ? <p className="mt-4 rounded-2xl bg-page p-4 text-[17px] leading-relaxed"><span className="mb-1 block text-[13px] font-semibold text-primary">Your mini-me said</span>“{a.answer}”</p>
              : <p className="mt-4 rounded-2xl bg-warning-tint p-4 text-[16px] text-warning">Your mini-me didn’t have an example for this one yet.</p>}
            <AddToAnswer question={a.question} gap={!a.answer} />
          </li>
        ))}
      </ol>
    </div>
  );
}
