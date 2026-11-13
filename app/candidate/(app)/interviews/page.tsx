import Link from 'next/link';
import {myScreeningInvitations} from '@/server/services/screenings';
import {ScreeningInvitation} from '@/components/shortlist-actions';
import { ChevronRight } from 'lucide-react';
import { pageViewer } from '@/server/page-auth';
import { myInterviews } from '@/server/services/candidate-interviews';
import { PageHeader } from '@/components/ui';
import { label } from '@/lib/format';
import { CopyBox } from '@/components/copy-box';
import { TimeLeftPill } from '@/components/interview-feedback';

export const dynamic = 'force-dynamic';

export default async function Interviews() {
  const { ctx } = await pageViewer('candidate');
  const list = await myInterviews(ctx);
  const invitations=await myScreeningInvitations(ctx);
  return (
    <div className="mx-auto max-w-[1000px]">
      <PageHeader compact title="Your interviews" subtitle="Every job that fits you, your mini-me is interviewed for. See what was asked and what it said. Add missing examples during your first 24 hours. Later answers can still help in a shortlist update." />
      <div className="mb-5 space-y-4">{invitations.map(i=><ScreeningInvitation key={i.id} {...i} expiresAt={i.expiresAt?.toISOString()??null}/>)}</div>
      {list.length === 0 ? (
        <div className="rounded-3xl bg-surface p-8 text-center shadow-[0_8px_24px_rgb(18_37_29/0.06)]">
          <p className="font-display text-[22px] font-semibold">No interviews yet</p>
          <p className="mt-2 text-[16px] text-muted">When a job that fits you goes live, your mini-me gets interviewed and it appears here. The more your mini-me knows, the better it does.</p>
          <Link href="/candidate/onboarding" className="mt-4 inline-block font-semibold">Build up your mini-me →</Link>
        </div>
      ) : (
        <>
        <section aria-label="Ask your AI to review" className="mb-5 flex flex-col gap-3 rounded-3xl bg-surface p-5 shadow-[0_8px_24px_rgb(18_37_29/0.06)] lg:flex-row lg:items-center">
          <p className="text-[16px] lg:w-[280px] lg:shrink-0"><span className="block font-semibold">Get your ChatGPT or Claude to review them</span><span className="text-muted">It reads your recent interviews, tells you what to improve and saves the changes.</span></p>
          <div className="min-w-0 flex-1"><CopyBox text="Review my recent Elsewhere interviews. Tell me what to improve, ask me for anything missing, and save the better answers." label="Message for your AI" /></div>
        </section>
        <ul className="space-y-3">
          {list.map((i) => (
            <li key={i.roleId}>
              <Link href={`/candidate/interviews/${i.roleId}`} className="lift flex items-center gap-4 rounded-3xl bg-surface p-5 text-ink no-underline shadow-[0_8px_24px_rgb(18_37_29/0.06)]">
                <span className="min-w-0 flex-1">
                  <span className="block font-display text-[21px] font-semibold">{i.title}</span>
                  <span className="text-[15px] text-muted">{label(i.mode)} · {label(i.region)} · {new Date(i.at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })} · {i.asked} questions{i.gaps ? ` · ${i.gaps} to answer` : ''}</span>
                </span>
                <TimeLeftPill deadline={i.deadline} />
                <ChevronRight aria-hidden className="text-muted" />
              </Link>
            </li>
          ))}
        </ul>
        </>
      )}
    </div>
  );
}
