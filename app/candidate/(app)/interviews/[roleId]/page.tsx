import { notFound } from 'next/navigation';
import { pageViewer } from '@/server/page-auth';
import { myInterview } from '@/server/services/candidate-interviews';
import { isUuid } from '@/server/lib/ids';
import { PageHeader } from '@/components/ui';
import { InterviewDeck, Countdown } from '@/components/interview-feedback';
import { label } from '@/lib/format';

export const dynamic = 'force-dynamic';

/** One interview, as a conversation: the question, how their mini-me answered, and a way to add more. */
export default async function Interview({ params }: { params: Promise<{ roleId: string }> }) {
  const { ctx } = await pageViewer('candidate');
  const { roleId } = await params;
  if (!isUuid(roleId)) notFound();
  const i = await myInterview(ctx, roleId).catch(() => null);
  if (!i) notFound();
  // The interview is a historical snapshot. Show later candidate submissions separately
  // so revisiting the question does not incorrectly say their answer disappeared.
  const { onboardingView } = await import('@/server/services/onboarding');
  const profile = await onboardingView(ctx);
  const byKey = new Map(profile.sections.flatMap((s) => s.questions).map((q) => [q.key, q.answer]));
  const byTopic = new Map(profile.extras.map((e) => [e.text.trim().toLowerCase(), e.answer]));
  const answers = i.answers.map((a) => ({
    ...a,
    submittedAnswer: a.key
      ? (byKey.get(a.key) ?? null)
      : (byTopic.get(a.question.trim().toLowerCase()) ?? null),
  }));
  return (
    <div className="mx-auto max-w-[860px]">
      <PageHeader compact back={{ href: '/candidate/interviews', label: 'Your interviews' }} title={i.title} subtitle={`${label(i.mode)} · ${label(i.region)} · interviewed ${new Date(i.at).toLocaleDateString('en-GB', { day: 'numeric', month: 'long' })} · ${i.answers.length} questions. The employer never sees your name.`} />
      <div className="mb-4"><Countdown lateAllowed={i.lateAllowed} deadline={i.deadline} gaps={answers.filter((a) => !a.answer && !a.submittedAnswer).length} /></div>
      <InterviewDeck answers={answers} open={i.open} />
    </div>
  );
}
