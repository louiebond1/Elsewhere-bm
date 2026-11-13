import { readFileSync, writeFileSync } from 'node:fs';
import {miniMeChatOutput} from '../src/server/ai/schemas';
import { contextReport, type ContextResult } from '../src/server/eval/context-report';
const events=JSON.parse(readFileSync(process.argv[2],'utf8')) as Record<string,unknown>[];
const rows=new Map<string,ContextResult>();
for(const e of events){
 const key=`${e.job}:${e.person}:${e.repeat}`;
 if(e.event==='context_eval_case') rows.set(key,{job:String(e.job),person:String(e.person),repeat:!!e.repeat,provider:String(e.provider),output:{criteria:[]}});
 if(e.event==='context_eval_result') rows.set(key,{job:String(e.job),person:String(e.person),repeat:!!e.repeat,provider:String(e.provider),output:e.output});

}
// Railway can deliver log entries out of order. Create cases before attaching criterion fragments.
for(const e of events) if(e.event==='context_eval_criterion') {
 const r=rows.get(`${e.job}:${e.person}:${e.repeat}`);if(r)(r.output as {criteria:unknown[]}).criteria[Number(e.index)]=e.value;
}
const report=contextReport([...rows.values()]);
const interviews=events.filter(e=>e.event==='context_interview_turn').map(e=>({probe:String(e.probe),turn:Number(e.turn),input:String(e.input),output:e.output as {reply:string;save:{detail:string}[]},valid:miniMeChatOutput.safeParse(e.output).success}));
const probes=['factory','youngest','oldest','group'];
const first=(id:string)=>interviews.find(t=>t.probe===id&&t.turn===0);
const next=(id:string)=>interviews.find(t=>t.probe===id&&t.turn===1);
const interviewChecks={
 conversationalOutputValid:interviews.length===8&&interviews.every(t=>t.valid),
 followsAnswers:probes.every(id=>!!first(id)&&!!next(id)&&first(id)!.output.reply!==next(id)!.output.reply&&next(id)!.output.reply.includes('?')),
 conditionsExplored:!!first('factory')&&/condition|personally|responsib|direct|situation/i.test(first('factory')!.output.reply),
 noFirstJobAssumption:interviews.filter(t=>t.probe==='youngest').every(t=>!/\bfirst job\b/i.test(JSON.stringify(t.output))),
 noInventedCharacterFacts:interviews.every(t=>t.valid&&!t.output.save.some(s=>/\b(resilient|gritty|hard.working|courageous|fearless|treated well)\b/i.test(s.detail))),
};
const configuredCostUsd=events.filter(e=>e.event==='context_eval_case'||e.event==='context_interview_turn').reduce((s,e)=>s+Number(e.configuredCostUsd??0),0);
const output={...report,checks:{...report.checks,...interviewChecks},interviews,pass:report.pass&&Object.values(interviewChecks).every(Boolean),configuredCostUsd,completed:events.some(e=>e.event==='context_eval_done'),generatedAt:new Date().toISOString()};
writeFileSync(process.argv[3],JSON.stringify(output,null,2));
console.log(JSON.stringify({completed:output.completed,checks:output.checks,cost:configuredCostUsd,rows:report.rows.filter(r=>!r.repeat).map(r=>({job:r.job,person:r.person,score:r.score,coverage:r.coverage,valid:r.valid,error:r.validationError}))},null,2));
