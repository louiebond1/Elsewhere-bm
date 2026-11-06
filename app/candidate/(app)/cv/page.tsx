import Link from 'next/link';
import { pageViewer } from '@/server/page-auth';
import { candidateOverview } from '@/server/views/candidate';
import { PageHeader, Card, Notice, LinkButton } from '@/components/ui';
import { CvUpload } from '@/components/candidate-forms';
import { ActionButton } from '@/components/client';
import { EXTRACTION_MESSAGES } from '@/server/lib/extract';

export default async function Cv() {
  const { ctx } = await pageViewer('candidate');
  const o = await candidateOverview(ctx);
  const cv = o.cv;
  const initial = o.conversations.find((c) => c.kind === 'initial_screening');
  return (
    <>
      <PageHeader title="Your CV" subtitle="Your CV stays private. Employers never receive it, even after you accept an introduction." />
      <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
        <Card title={cv ? 'Current CV' : 'Upload a CV'}>
          {cv && (
            <div className="mb-4 space-y-2 text-[15px]">
              <p>{cv.originalFilename} · {cv.uploadState === 'ready' ? 'Ready' : cv.uploadState === 'processing' ? 'Reading your CV' : cv.uploadState === 'failed' ? 'Could not read' : cv.uploadState}</p>
              {cv.uploadState === 'failed' && <Notice tone="danger">{EXTRACTION_MESSAGES[cv.extractionErrorCode ?? 'no_text'] ?? EXTRACTION_MESSAGES.no_text}</Notice>}
              {cv.uploadState === 'ready' && cv.extractedTextPrivate && (
                <details><summary className="cursor-pointer text-link">Check this looks right</summary><pre className="mt-2 max-h-80 overflow-auto whitespace-pre-wrap rounded-lg bg-page p-3 text-[14px]">{cv.extractedTextPrivate}</pre>{!cv.textConfirmedAt && <div className="mt-2"><ActionButton path={`files/${cv.id}/confirm`} label="This looks right" /></div>}{cv.textConfirmedAt && <p className="mt-2 text-[14px] text-success">Confirmed. It will be used as a source for your draft evidence.</p>}</details>
              )}
              <div className="flex flex-wrap gap-2">
                {cv.mimeType !== 'text/plain' && <a className="text-[15px]" href={`/api/files/${cv.id}/download`}>View file</a>}
                <ActionButton path={`files/${cv.id}/delete`} label="Delete CV" variant="ghost" confirm={{ title: 'Delete your CV', body: <p>This removes the private file. Evidence you already approved stays until you remove it.</p>, confirmLabel: 'Delete CV' }} />
              </div>
            </div>
          )}
          <CvUpload hasCv={!!cv} />
          {o.candidate.publicRef === 'CAND-040' && !cv && <div className="mt-4 rounded-lg bg-warning-tint p-3 text-[14px] text-warning">Demo helper: <ActionButton path="candidate/load-fictional-cv" label="Load fictional CV" variant="secondary" /></div>}
        </Card>
        <Card title="Next">
          <p className="text-[15px]">You can continue without a CV. A short conversation often shows more than a CV does.</p>
          <div className="mt-3">{initial ? <LinkButton href={initial.status === 'completed' ? '/candidate/check-ins' : `/candidate/conversation/${initial.id}`}>Continue</LinkButton> : <ActionButton path="conversations/start" body={{ kind: 'initial_screening' }} label="Start your first conversation" redirect="/candidate/conversation/{id}" />}</div>
          <p className="mt-3 text-[13px] text-muted"><Link href="/candidate/home">Back to home</Link></p>
        </Card>
      </div>
    </>
  );
}
