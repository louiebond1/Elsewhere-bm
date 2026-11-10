import { redirect } from 'next/navigation';
import { gateOk } from '@/server/page-auth';
import { getActiveDataset } from '@/server/services/context';
import { personaDirectory, SCENARIOS } from '@/server/services/demo';
import { Brand } from '@/components/shell';
import { PhotoBackdrop } from '@/components/photo-backdrop';
import { Personas } from './personas';
import { providerLabel } from '@/server/ai';

export const dynamic = 'force-dynamic';

export default async function TesterToolsPage() {
  if (!(await gateOk())) redirect('/demo');
  const ds = await getActiveDataset();
  const people = ds ? await personaDirectory(ds.id) : [];
  return (
    <main className="relative isolate min-h-screen overflow-x-clip px-5 pb-16 pt-8 lg:px-10">
      <PhotoBackdrop height={460} />
      <div className="mx-auto max-w-[1180px]">
        <span className="[&_*]:text-white"><Brand sub="Elsewhere" /></span>
        <h1 className="mt-10 text-[40px] leading-[1.05] text-white lg:text-[56px]">Tester tools</h1>
        <p className="mt-3 text-[18px] text-white/90"><a href="/demo/personas" className="text-white underline">← Back to the demo</a> · Every fictional account and scenario. {ds ? '' : 'Setup is not complete yet.'}</p>
        <Personas people={people} scenarios={SCENARIOS.map(({ code, title, persona, personaCode, action, expected }) => ({ code, title, persona, personaCode, action, expected }))} activeScenario={ds?.scenarioCode ?? null} />
        <p className="mt-8 text-center text-[13px] text-muted">{providerLabel()}{ds ? ` · data version ${ds.generation}${ds.scenarioCode ? ` · ${ds.scenarioCode}` : ''}` : ''}</p>
      </div>
    </main>
  );
}
