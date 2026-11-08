import Link from 'next/link';
import { redirect } from 'next/navigation';
import { gateOk } from '@/server/page-auth';
import { Brand } from '@/components/shell';
import { providerLabel } from '@/server/ai';
import { SECTIONS, COVERAGE, COVERAGE_SOURCE, WALKTHROUGH_BASIS, COMMERCIAL_BASIS, type Step } from '@/config/walkthrough';

export const dynamic = 'force-dynamic';

const WHO_TONE: Record<Step['who'], string> = {
  Facilitator: 'bg-info-tint text-ink',
  Consultant: 'bg-primary text-white',
  Candidate: 'bg-success-tint text-success',
  Client: 'bg-warning-tint text-warning',
};

/** Read-only teaching guide. It renders text and links only: no buttons, forms or API calls. */
export default async function GuidePage() {
  if (!(await gateOk())) redirect('/demo');
  return (
    <>
      <div className="bg-primary px-4 py-1.5 text-[13px] text-white">Demo using fictional data · {providerLabel()}</div>
      <main className="mx-auto max-w-[960px] px-4 py-6 md:px-8">
        <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
          <Brand />
          <Link href="/demo/personas" className="text-[14px]">Back to demo accounts</Link>
        </div>
        <h1>Guided walkthrough (read-only)</h1>
        <p className="mt-2 text-[15px]">{WALKTHROUGH_BASIS}</p>
        <p className="mt-3 rounded-lg bg-warning-tint px-4 py-3 text-[14px] text-warning">This page does not change anything. Do not press Load scenario, Reset demo, Buy credits, Record hire or Delete during the tour: those change the shared fictional dataset.</p>
        <p className="mt-3 text-[13px] text-muted">{COMMERCIAL_BASIS}</p>

        <nav aria-label="Walkthrough sections" className="mt-5">
          <ol className="flex flex-wrap gap-x-4 gap-y-1 text-[14px]">
            {SECTIONS.map((s) => <li key={s.id}><a href={`#${s.id}`}>{s.title}</a></li>)}
            <li><a href="#coverage">Requirements coverage</a></li>
          </ol>
        </nav>

        {SECTIONS.map((sec) => (
          <section key={sec.id} id={sec.id} className="mt-8" aria-labelledby={`${sec.id}-h`}>
            <h2 id={`${sec.id}-h`} className="text-[20px]">{sec.title}</h2>
            <p className="mt-1 text-[15px] text-muted">{sec.intro}</p>
            {sec.warning && <p role="note" className="mt-3 rounded-lg border-2 border-warning bg-warning-tint px-4 py-3 text-[14px] font-semibold text-warning">{sec.warning}</p>}
            <ol className="mt-3 space-y-3">
              {sec.steps.map((st, i) => (
                <li key={i} className="rounded-xl border border-line bg-surface p-4">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className={`rounded-full px-2 py-0.5 text-[12px] font-semibold ${WHO_TONE[st.who]}`}>{st.who}</span>
                    <span className="rounded-full border border-line px-2 py-0.5 text-[12px]">{st.kind === 'simulated' ? 'Simulated' : 'Real app logic, fictional data'}</span>
                    {st.changesData && <span className="rounded-full border border-warning px-2 py-0.5 text-[12px] text-warning">Explanation only, not performed</span>}
                  </div>
                  <h3 className="mt-2 text-[16px]">{i + 1}. {st.title}</h3>
                  {st.persona && <p className="text-[14px] text-muted">As: {st.persona}. Switch on the demo accounts page first.</p>}
                  {st.path && <p className="mt-1 text-[14px]">Screen: <Link href={st.path}>{st.path}</Link></p>}
                  <p className="mt-1 text-[15px]">{st.look}</p>
                  {st.changesData && (
                    <div className="mt-2 rounded-lg bg-page px-3 py-2 text-[14px]">
                      <p><span className="font-semibold">If someone used “{st.changesData.action}”:</span> {st.changesData.expected}</p>
                      <p className="mt-1 text-muted">Describes intended behaviour. It has not been performed by this guide.</p>
                    </div>
                  )}
                  {st.note && <p className="mt-2 text-[13px] text-muted">{st.note}</p>}
                </li>
              ))}
            </ol>
          </section>
        ))}

        <section id="coverage" className="mt-10" aria-labelledby="coverage-h">
          <h2 id="coverage-h" className="text-[20px]">Requirements coverage</h2>
          <p className="mt-1 text-[14px] text-muted">{COVERAGE_SOURCE}</p>
          <div className="mt-3 overflow-x-auto">
            <table className="w-full min-w-[560px] border-collapse text-left text-[14px]">
              <thead><tr className="border-b border-line"><th className="py-2 pr-3">Spec</th><th className="py-2 pr-3">Criterion</th><th className="py-2 pr-3">Status</th><th className="py-2">Notes</th></tr></thead>
              <tbody>
                {COVERAGE.map((c, i) => (
                  <tr key={i} className="border-b border-line align-top">
                    <td className="py-2 pr-3 whitespace-nowrap">{c.ref}</td>
                    <td className="py-2 pr-3">{c.criterion}</td>
                    <td className="py-2 pr-3">{c.status.join('; ')}</td>
                    <td className="py-2 text-muted">{c.note}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </main>
    </>
  );
}
