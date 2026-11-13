import 'server-only';
import { runAi, type RunMeta, AiFailure } from './index';
import type { AssessInput, AiResult } from './providers/types';
import type { AssessmentOutput } from './schemas';
import { validateAssessment } from './validate';
/** Deep rubrics are assessed in bounded groups. Every billable group passes the shared budget gate. */
export const ASSESSMENT_BATCH_SIZE = 4;
export async function assessWithEvidence(input: AssessInput, meta: Omit<RunMeta, 'task' | 'input'>): Promise<AiResult<AssessmentOutput>> {
  const criteria: AssessmentOutput['criteria'] = [];
  const usage = {inputTokens:0,outputTokens:0,cacheReadTokens:0,cacheWriteTokens:0,modelId:''};
  let provider: AiResult<AssessmentOutput>['provider'] = 'fixture';
  for(let start=0;start<input.criteria.length;start+=ASSESSMENT_BATCH_SIZE){
    const part={...input,criteria:input.criteria.slice(start,start+ASSESSMENT_BATCH_SIZE)};
    const result=await runAi({...meta,task:'assess',input:part},p=>p.assessCriteria(part,{review:meta.model==='review'}));
    const valid=validateAssessment(result.output,part.criteria.map(c=>c.criterionId),input.evidence.map(e=>e.id),input.evidence);
    if(!valid.ok) throw new AiFailure('schema_contract',`Assessment did not pass validation: ${valid.reason}`,true);
    if(start && result.provider!==provider) throw new AiFailure('schema_contract','Mixed assessment providers.',true);
    provider=result.provider;criteria.push(...result.output.criteria);
    usage.inputTokens+=result.usage.inputTokens;usage.outputTokens+=result.usage.outputTokens;
    usage.cacheReadTokens+=result.usage.cacheReadTokens;usage.cacheWriteTokens+=result.usage.cacheWriteTokens;usage.modelId=result.usage.modelId;
  }
  return {output:{criteria},provider,usage};
}
