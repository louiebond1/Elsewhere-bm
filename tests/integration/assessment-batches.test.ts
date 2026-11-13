import {it,expect,afterEach} from 'vitest';
import {load} from './helpers';
import {assessWithEvidence} from '../../src/server/ai/assess';
import {setProviderForTests} from '../../src/server/ai';
import {fixtureProvider} from '../../src/server/ai/providers/fixture';
afterEach(()=>setProviderForTests(null));
it('assesses a deep rubric in bounded groups and rejects an incomplete or foreign-evidence group',async()=>{
 const w=await load();const sizes:number[]=[];let bad=false;
 const input={criteria:Array.from({length:10},(_,n)=>({criterionId:`criterion_${n}`,label:'Relevant responsibility',description:'Specific personal action at the required scope.',evidenceTags:[]})),evidence:[{id:'own',safeClaim:'I personally maintained the weekly ledger checks.',tags:[],strength:'specific',uncertainty:null}]};
 setProviderForTests({...fixtureProvider,name:'anthropic',assessCriteria:async i=>{
  sizes.push(i.criteria.length);
  return {provider:'anthropic',usage:{inputTokens:100,outputTokens:100,cacheReadTokens:0,cacheWriteTokens:0,modelId:'stand-in'},output:{criteria:i.criteria.map(c=>({criterionId:c.criterionId,level:'clear' as const,evidenceIds:[bad&&sizes.length===2?'foreign':'own'],quote:input.evidence[0].safeClaim,reasonSafe:'Direct personal example.',followUp:null}))}};
 }});
 const result=await assessWithEvidence(input,{datasetId:w.ids.datasetId});
 expect(sizes).toEqual([4,4,2]);expect(result.output.criteria).toHaveLength(10);
 sizes.length=0;bad=true;
 await expect(assessWithEvidence(input,{datasetId:w.ids.datasetId})).rejects.toMatchObject({code:'schema_contract'});
 expect(sizes).toEqual([4,4]);
});
