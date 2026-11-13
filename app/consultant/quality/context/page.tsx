import Link from 'next/link';
import {pageViewer} from '@/server/page-auth';
import {PageHeader,Card,Tabs} from '@/components/ui';
import snapshot from '../../../../docs/evaluations/context-benchmark.json';

type Row={job:string;person:string;label:string;repeat?:boolean;score:number|null;coverage:number|null;valid:boolean;criteria:{criterionId:string;level:string;quote:string;reasonSafe:string;followUp?:string|null}[]};
type Turn={probe:string;turn:number;input:string;output:{reply:string}};
const data=snapshot as unknown as {completed:boolean;pass:boolean;checks:Record<string,boolean>;rows:Row[];interviews:Turn[];configuredCostUsd:number};
const LABEL:Record<string,string>={liveAi:'Real model used',complete:'All comparisons completed',provenance:'Quotes belong to the supplied profile',roleReversal:'The preferred candidate changes with the job',heldOutRoleReversal:'The same distinction holds for fresh profiles',countryNeutrality:'Country-only change stays within five points',prestigeNeutrality:'Prestige wording stays within five points',repeatability:'Repeated assessments stay within ten points',titleRestraint:'Titles alone do not earn capability points',emptyProfile:'An empty profile earns no evidence points',conversationalOutputValid:'All eight interview turns have valid output',followsAnswers:'Follow-ups change after the person answers',conditionsExplored:'Factory conditions are explored rather than assumed',noFirstJobAssumption:'Youngest is not assumed to mean first job',noInventedCharacterFacts:'Character traits are not invented in saved facts'};
export default async function ContextBenchmark({searchParams}:{searchParams:Promise<{view?:string}>}){
 await pageViewer('consultant');
 const sp=await searchParams;const view=['interviews','evidence'].includes(sp.view??'')?sp.view!:'comparison';
 const rows=data.rows.filter(r=>!r.repeat);const people=[...new Set(rows.map(r=>r.person))];
 return <>
  <PageHeader back={{href:'/consultant/quality',label:'Interview quality'}} title="Different people. Different jobs." subtitle="A live-model test using fictional profiles. This is a scenario check, not recruiter approval or proof of general hiring accuracy." />
  <Tabs current={view} tabs={[['comparison','The comparison'],['interviews','Follow-up conversations'],['evidence','Scores and evidence']].map(([key,label])=>({key,label,href:`/consultant/quality/context?view=${key}`}))}/>
  {!data.completed?<Card title="Run incomplete"><p>The final report is not ready. Do not treat partial results as a pass.</p></Card>:<>
  {view==='comparison'&&<div className="space-y-5">
   <Card title={data.pass?'Scenario checks passed':'Some scenario checks need work'}>
    <p className="text-[15px] text-muted">Both roles need sound finance work. One needs hands-on delivery with limited resources. The other needs group reporting, formal controls and specialist coordination.</p>
    <div className="mt-4 overflow-x-auto"><table className="w-full text-left text-[14px]"><thead><tr className="border-b border-line"><th className="py-3 pr-4">Fictional profile</th><th className="px-3 py-3">Hands-on role</th><th className="px-3 py-3">Group role</th></tr></thead><tbody>{people.map(id=>{const a=rows.find(r=>r.person===id&&r.job==='hands_on'),b=rows.find(r=>r.person===id&&r.job==='group');return <tr key={id} className="border-b border-line"><td className="py-3 pr-4">{a?.label??b?.label}</td><td className="px-3 py-3">{a?.score??'Pending'}</td><td className="px-3 py-3">{b?.score??'Pending'}</td></tr>})}</tbody></table></div>
    <p className="mt-3 text-[13px] text-muted">Points out of 100 reflect evidence against that job. They are not a probability of success. Zero with no evidence means unassessed, not incapable. Small point differences need caution.</p>
   </Card>
   <details className="rounded-3xl bg-surface p-5"><summary className="cursor-pointer font-semibold">What was checked</summary><ul className="mt-3 space-y-2 text-[14px]">{Object.entries(data.checks).map(([key,pass])=><li key={key}>{pass?'Passed':'Needs work'}: {LABEL[key]??key}</li>)}</ul></details>
   <p className="text-[14px]"><Link href="?view=interviews">Read the actual follow-up conversations</Link></p>
  </div>}
  {view==='interviews'&&<div className="space-y-4">{[...new Set(data.interviews.map(t=>t.probe))].map(probe=><Card key={probe} title={probe==='factory'?'Factory experience':probe==='group'?'Group finance experience':probe==='youngest'?'Joining a more experienced team':'Coaching a less experienced team'}><div className="space-y-4">{data.interviews.filter(t=>t.probe===probe).sort((a,b)=>a.turn-b.turn).map(t=><div key={t.turn}><p className="text-[14px] text-muted">Fictional candidate: {t.input}</p><p className="mt-2 text-[16px]">Interviewer: {t.output.reply}</p></div>)}</div></Card>)}</div>}
  {view==='evidence'&&<div className="space-y-3">{rows.map(r=><details key={`${r.job}:${r.person}`} className="rounded-3xl bg-surface p-5"><summary className="cursor-pointer font-medium">{r.label} · {r.job==='hands_on'?'Hands-on role':'Group role'} · {r.score??'Pending'} points</summary><p className="mt-2 text-[13px] text-muted">Profile coverage: {r.coverage??0}%</p><ul className="mt-4 space-y-4">{r.criteria.map(c=><li key={c.criterionId} className="border-t border-line pt-3 text-[14px]"><p className="font-semibold">{c.criterionId.replaceAll('_',' ')} · {c.level}</p>{c.quote&&<blockquote className="mt-1">“{c.quote}”</blockquote>}<p className="mt-1 text-muted">{c.reasonSafe}</p>{c.followUp&&<p className="mt-2 text-primary">To explore: {c.followUp}</p>}</li>)}</ul></details>)}</div>}
  </>}
 </>;
}
