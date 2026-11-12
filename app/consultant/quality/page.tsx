import { pageViewer } from '@/server/page-auth';
import { PageHeader } from '@/components/ui';
import { ActionButton } from '@/components/client';
import { latestQualityRuns, qualityReport, type ResultItem } from '@/server/eval/quality';
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
  const doneRun = runs.find((r) => r.status === 'done');
  const report = doneRun ? qualityReport(doneRun.done as ResultItem[]) : null;
  return (
    <div className="mx-auto max-w-[980px]">
      {running && <meta httpEquiv="refresh" content="20" />}
      <PageHeader title="Interview quality" subtitle="36 test people, 3 jobs. Our rating out of 100 next to the AI’s. Our ratings were set by the developer." />
      <div className="flex flex-wrap items-center gap-3">
        {!running && <ActionButton path="consultant/quality-check" body={{}} label="Run quality check" successText="Started. This page updates by itself." />}
        {running && <span className="text-[15px] text-muted">{(latest.done as unknown[]).length} of {(latest.total as unknown[]).length} interviews done</span>}
        {!running && latest?.finishedAt && <span className="text-[15px] text-muted">Last run {date(latest.finishedAt)}</span>}
      </div>

      {!report ? <p className="mt-8 text-[17px] text-muted">No results yet. A run is about 140 AI interviews and takes a while.</p> : <QualityView report={report} />}
    </div>
  );
}
