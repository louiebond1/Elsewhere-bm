import {readFileSync,writeFileSync} from 'node:fs';
import {assessmentOutput,miniMeChatOutput,simulationOutput} from '../src/server/ai/schemas';
import {validateAssessment} from '../src/server/ai/validate';
import {CONTEXT_JOBS,CONTEXT_PEOPLE} from '../src/server/eval/context-set';
import {PAIRED_EXPECTATIONS,PAIRED_ACCEPTANCE} from '../src/server/eval/paired-expectations';
import {weightedScore,LEVEL_VALUE,type Level} from '../src/server/lib/matching-rules';
type Event=Record<string,unknown>;
const events=JSON.parse(readFileSync(process.argv[2],'utf8')) as Event[];
const assessments=events.filter(e=>e.event==='pair_assessment').map(e=>{
 const job=CONTEXT_JOBS.find(j=>j.id===e.job)!,person=CONTEXT_PEOPLE.find(p=>p.id===e.person)!;
 const parsed=assessmentOutput.safeParse(e.output);
 const validation=parsed.success?validateAssessment(parsed.data,job.criteria.map(c=>c.criterionId),person.evidence.map(i=>i.id),person.evidence):{ok:false,reason:'schema'};
 const expected=PAIRED_EXPECTATIONS[e.job as keyof typeof PAIRED_EXPECTATIONS][e.person as 'p01'|'p02'] as Record<string,Level>;
 const actual=new Map(parsed.success?parsed.data.criteria.map(c=>[c.criterionId,c.level as Level]):[]);
 const expectedScore=Math.round(weightedScore(job.criteria,new Map(Object.entries(expected))));
 const actualScore=validation.ok?Math.round(weightedScore(job.criteria,actual)):null;
 const criteria=job.criteria.map(c=>{const result=parsed.success?parsed.data.criteria.find(x=>x.criterionId===c.criterionId):null;const expectedLevel=expected[c.criterionId];return {id:c.criterionId,label:c.label,weight:c.weight,expectedLevel,actualLevel:result?.level??null,delta:result?(LEVEL_VALUE[result.level as Level]-LEVEL_VALUE[expectedLevel])/25:null,quote:result?.quote??'',reason:result?.reasonSafe??''};});
 return {person:person.id,label:person.label,job:job.id,title:job.title,valid:validation.ok,expectedScore,actualScore,delta:actualScore===null?null:actualScore-expectedScore,criteria};
});
const interviews=events.filter(e=>e.event==='pair_job_interview').map(e=>{
 const parsed=simulationOutput.safeParse(e.output),person=CONTEXT_PEOPLE.find(p=>p.id===e.person)!;
 const questions=e.questions as {question:string}[];
 const valid=parsed.success&&parsed.data.answers.length===questions.length&&new Set(parsed.data.answers.map(a=>a.questionIndex)).size===questions.length&&parsed.data.answers.every(a=>a.questionIndex<questions.length&&a.evidenceIds.every(id=>person.evidence.some(x=>x.id===id)));
 return {person:e.person,job:e.job,valid,summary:parsed.success?parsed.data.summary:null,questions:questions.map((q,i)=>({question:q.question,...(parsed.success?parsed.data.answers.find(a=>a.questionIndex===i):{})}))};
});
const adaptive:(Event&{valid:boolean})[]=events.filter(e=>e.event==='pair_adaptive_turn').map(e=>({...e,valid:miniMeChatOutput.safeParse(e.output).success}));
const get=(job:string,person:string)=>assessments.find(a=>a.job===job&&a.person===person)?.actualScore??-1;
const checks={completed:events.some(e=>e.event==='pair_done'),fourAssessments:assessments.length===4&&assessments.every(a=>a.valid),expectedWinners:get('hands_on','p01')>get('hands_on','p02')&&get('group','p02')>get('group','p01'),aggregateWithinTen:assessments.length===4&&assessments.every(a=>a.delta!==null&&Math.abs(a.delta)<=PAIRED_ACCEPTANCE.aggregateTolerance),criteriaWithinOneLevel:assessments.length===4&&assessments.every(a=>a.criteria.every(c=>c.delta!==null&&Math.abs(c.delta)<=PAIRED_ACCEPTANCE.criterionLevelTolerance)),allFortyInterviewAnswersValid:interviews.length===4&&interviews.every(i=>i.valid),eightAdaptiveTurnsValid:adaptive.length===8&&adaptive.every(t=>t.valid),factoryCommentaryUsesItsOwnRole:interviews.some(i=>i.person==='p01'&&i.job==='hands_on')&&interviews.filter(i=>i.person==='p01'&&i.job==='hands_on').every(i=>i.questions.every(q=>!/no group.level|lacks? group|no group reporting/i.test(q.reason??'')))};
const configuredCostUsd=events.reduce((sum,e)=>sum+Number(e.configuredCostUsd??0),0);
const result={generatedAt:new Date().toISOString(),checks,pass:Object.values(checks).every(Boolean),configuredCostUsd,expectations:PAIRED_EXPECTATIONS,acceptance:PAIRED_ACCEPTANCE,assessments,interviews,adaptive,scriptSelections:events.filter(e=>e.event==='pair_script_selection'),run:events.find(e=>e.event==='pair_expectations'),caveat:'Fictional regression profiles with developer-set expectations, not independent recruiter-approved validation. Job-interview answers are AI paraphrases of approved profile facts and never new scoring evidence.'};
writeFileSync(process.argv[3],JSON.stringify(result,null,2)+'\n');
const levelName=(level:string|null)=>({strong:'Strong (100)',clear:'Clear (75)',partial:'Some (50)',related:'Related (25)',contradictory:'Does not meet (0)',unknown:'No evidence yet'}[level??'unknown']??level);
const esc=(s:unknown)=>String(s??'').replaceAll('|','\\|').replaceAll('\n',' ');
let md='# Two fictional people: post-release interview comparison\n\n'+result.caveat+'\n\nExpected levels were logged before the first fresh AI call. Both people were assessed against both ten-requirement jobs. Ratings use their full prewritten approved profiles; the adaptive profile-building conversations demonstrate follow-up behaviour, not a second source of invented facts.\n\n';
md+='| Person | Job | Expected | AI | Difference |\n|---|---|---:|---:|---:|\n'+assessments.map(a=>`| ${a.label} | ${a.title} | ${a.expectedScore} | ${a.actualScore} | ${a.delta} |`).join('\n')+'\n\n';
md+='## Checks\n\n'+Object.entries(checks).map(([k,v])=>`- ${k}: ${v?'PASS':'FAIL'}`).join('\n')+'\n\n';
md+='## Actual adaptive conversations\n\nEach sample stops after four interviewer replies, leaving the final follow-up open. The full job interviews later in this report contain ten answered questions each.\n\n';
for(const id of ['p01','p02']){md+=`### ${CONTEXT_PEOPLE.find(p=>p.id===id)!.label}\n\n`;for(const t of adaptive.filter(t=>t.person===id).sort((a,b)=>Number(a.turn)-Number(b.turn))){md+=`Candidate: ${t.answer}\n\nInterviewer: ${(t.output as {reply:string}).reply}\n\n`;}}
for(const assessment of assessments){md+=`## ${assessment.label}: ${assessment.title}\n\nExpected ${assessment.expectedScore}/100. Actual ${assessment.actualScore}/100.\n\n| Requirement | Expected level | AI level | AI reason |\n|---|---|---|---|\n`+assessment.criteria.map(c=>`| ${esc(c.label)} | ${levelName(c.expectedLevel)} | ${levelName(c.actualLevel)} | ${esc(c.reason)} |`).join('\n')+'\n\n';const interview=interviews.find(i=>i.person===assessment.person&&i.job===assessment.job);md+='### Every job interview question and answer\n\nThese are the employer-facing simulated answers from the approved mini-me. Per-answer marks out of ten are explanatory; the ranking uses the fixed criterion calculation above.\n\n';for(const q of interview?.questions??[]){md+=`Question: ${q.question}\n\nAnswer: ${q.answer}\n\nAnswer mark: ${q.score}/10. ${q.reason}\n\n`;}}
md+=`Configured request cost: $${configuredCostUsd.toFixed(6)}. This is the repository price table calculation, not an independently checked invoice.\n`;
writeFileSync(process.argv[4],md);
console.log(JSON.stringify({checks,pass:result.pass,cost:configuredCostUsd,assessments:assessments.map(({person,job,expectedScore,actualScore,delta,criteria})=>({person,job,expectedScore,actualScore,delta,disagreements:criteria.filter(c=>c.delta!==0)}))},null,2));
