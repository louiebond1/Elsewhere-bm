import {it,expect} from 'vitest';
import {CONTEXT_JOBS,CONTEXT_PEOPLE} from '../../src/server/eval/context-set';
import {contextReport,type ContextResult} from '../../src/server/eval/context-report';
it('does not claim real-model success for deterministic mock scores',()=>{
 const rows:ContextResult[]=CONTEXT_JOBS.flatMap(j=>CONTEXT_PEOPLE.map(p=>({job:j.id,person:p.id,provider:'fixture',output:{criteria:j.criteria.map(c=>({criterionId:c.criterionId,level:'unknown',evidenceIds:[],quote:'',reasonSafe:'Not enough evidence.',followUp:'What did you personally do?'}))}})));
 const report=contextReport(rows);
 expect(report.checks.complete).toBe(true);
 expect(report.checks.liveAi).toBe(false);
 expect(report.checks.roleReversal).toBe(false);
 expect(report.checks.repeatability).toBe(false);
 expect(report.pass).toBe(false);
});
it('the comparison changes job needs while holding the two people fixed',()=>{
 expect(CONTEXT_JOBS).toHaveLength(2);
 expect(CONTEXT_JOBS.every(j=>j.criteria.length===10)).toBe(true);
 expect(CONTEXT_PEOPLE.find(p=>p.id==='p01')!.evidence.some(e=>e.safeClaim.includes('China'))).toBe(true);
 expect(CONTEXT_PEOPLE.find(p=>p.id==='p02')!.evidence.some(e=>e.safeClaim.includes('$180 million'))).toBe(true);
 expect(CONTEXT_JOBS[0].criteria.find(c=>c.criterionId==='constraints')?.weight).toBe(5);
 expect(CONTEXT_JOBS[1].criteria.find(c=>c.criterionId==='consolidation')?.weight).toBe(5);
});
