import { redirect } from 'next/navigation';
import { gateOk } from '@/server/page-auth';
import { getActiveDataset } from '@/server/services/context';
import { personaDirectory, SCENARIOS } from '@/server/services/demo';
import { Brand } from '@/components/shell';
import { Personas } from './personas';
import { providerLabel } from '@/server/ai';

export const dynamic = 'force-dynamic';

export default async function PersonasPage() {
  if (!(await gateOk())) redirect('/demo');
  const ds = await getActiveDataset();
  const people = ds ? await personaDirectory(ds.id) : [];
  return (
    <>
      <div className="bg-primary px-4 py-1.5 text-[13px] text-white">Demo using fictional data · {providerLabel()}</div>
      <main className="mx-auto max-w-[1240px] px-4 py-6 md:px-8">
        <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
          <Brand />
          <div className="text-[13px] text-muted">{ds ? `Dataset generation ${ds.generation}${ds.scenarioCode ? ` · Scenario ${ds.scenarioCode}` : ' · Baseline'} · Business date 6 November 2026` : 'Demo setup is not complete yet.'}</div>
        </div>
        <h1>Choose a fictional demo account</h1>
        <p className="mt-1 text-[15px] text-muted">Switching signs you in as that fictional account. Every switch is recorded.</p>
        <Personas people={people} scenarios={SCENARIOS.map(({ code, title, persona, personaCode, action, expected }) => ({ code, title, persona, personaCode, action, expected }))} activeScenario={ds?.scenarioCode ?? null} />
      </main>
    </>
  );
}
