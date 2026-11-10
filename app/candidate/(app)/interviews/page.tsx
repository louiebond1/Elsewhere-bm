import Link from 'next/link';
import { ChevronRight } from 'lucide-react';
import { pageViewer } from '@/server/page-auth';
import { myInterviews } from '@/server/services/candidate-interviews';
import { PageHeader } from '@/components/ui';
import { label } from '@/lib/format';

export const dynamic = 'force-dynamic';

export default async function Interviews() {
  const { ctx } = await pageViewer('candidate');
  const list = await myInterviews(ctx);
  return (
    <div className="mx-auto max-w-[1000px]">
      <PageHeader title="Your interviews" subtitle="Every time a job goes live that fits you, your mini-me is interviewed for it. See what was asked and how it answered. No scores, just the conversation." />
      {list.length === 0 ? (
        <div className="rounded-3xl bg-surface p-8 text-center shadow-[0_8px_24px_rgb(18_37_29/0.06)]">
          <p className="font-display text-[22px] font-semibold">No interviews yet</p>
          <p className="mt-2 text-[16px] text-muted">When a job that fits you goes live, your mini-me gets interviewed and it appears here. The more your mini-me knows, the better it does.</p>
          <Link href="/candidate/onboarding" className="mt-4 inline-block font-semibold">Build up your mini-me →</Link>
        </div>
      ) : (
        <ul className="space-y-3">
          {list.map((i) => (
            <li key={i.roleId}>
              <Link href={`/candidate/interviews/${i.roleId}`} className="lift flex items-center gap-4 rounded-3xl bg-surface p-5 text-ink no-underline shadow-[0_8px_24px_rgb(18_37_29/0.06)]">
                <span className="min-w-0 flex-1">
                  <span className="block font-display text-[21px] font-semibold">{i.title}</span>
                  <span className="text-[15px] text-muted">{label(i.mode)} · {label(i.region)} · {new Date(i.at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })} · {i.asked} questions{i.gaps ? ` · ${i.gaps} it couldn’t answer yet` : ''}</span>
                </span>
                <ChevronRight aria-hidden className="text-muted" />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
