import Link from 'next/link';
import { pageViewer } from '@/server/page-auth';
import { PageHeader } from '@/components/ui';
import { ActionButton } from '@/components/client';
import { latestQualityRuns, qualityReport, type ResultItem } from '@/server/eval/quality';
import { ASSESSMENT_VERSION } from '@/server/lib/matching-rules';
import { EVAL_JOBS } from '@/server/eval/interview-set';
import { date } from '@/lib/format';
import { QualityView } from '@/components/quality-view';

export const dynamic = 'force-dynamic';


/** Does the interview pick the right people, the same way twice, fairly? One button, one verdict. */
export default async function Quality() {
  await pageViewer('consultant');
  const runs = await latestQualityRuns(5);
  const latest = runs[0];
  const running = latest?.status === 'running';
  // Worked out from the stored results each time, so the page always uses the current ratings and rules.
  // Only runs of the current test set count (older runs used different test people).
  const known = new Set(EVAL_JOBS.flatMap((j) => j.people.map((x) => x.id)));
  const doneRun = runs.find((r) => r.status === 'done' && (r.done as ResultItem[]).length > 0 && (r.done as ResultItem[]).every((x) => known.has(x.person) && x.assessmentVersion === ASSESSMENT_VERSION));
  const report = doneRun ? qualityReport(doneRun.done as ResultItem[]) : null;
  return (
    <div className="mx-auto max-w-[980px]">
      {running && <meta httpEquiv="refresh" content="20" />}
      <p className="my-3 text-[14px] text-muted">New runs check criterion scoring. Reference ratings are provisional and need recruiter approval. Older interview-score results do not validate this ranking.</p>
      <p className="my-3"><Link href="/consultant/quality/context">Read the factory-versus-group live-model test</Link></p>
      <PageHeader title="Interview quality" subtitle="One made-up job, 36 made-up people. Our rating out of 100 next to the AI’s. Our ratings were set by the developer." />
      <div className="flex flex-wrap items-center gap-3">
        {!running && <ActionButton path="consultant/quality-check" body={{}} label="Run quality check" successText="Started. This page updates by itself." />}
        {running && <span className="text-[15px] text-muted">{(latest.done as unknown[]).length} of {(latest.total as unknown[]).length} interviews done</span>}
        {!running && latest?.finishedAt && <span className="text-[15px] text-muted">Last run {date(latest.finishedAt)}</span>}
      </div>

      {!report ? <p className="mt-8 text-[17px] text-muted">No results yet. A run is about 140 AI interviews and takes a while.</p> : <QualityView report={report} />}
    </div>
  );
}
