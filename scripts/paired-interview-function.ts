/** Isolated, one-shot Railway evaluation. No candidate records or application settings are changed. */
import pg from 'pg';
import { CONTEXT_JOBS, CONTEXT_PEOPLE } from '../src/server/eval/context-set';
import schemas from '../src/server/eval/context-output-schemas.json';
import { ONBOARDING_QUESTIONS } from '../src/config/onboarding';
import { MATCHING_SYSTEM, MINIME_SYSTEM, SIMULATION_SYSTEM } from '../src/server/ai/prompts';
import { prototype } from '../src/config/prototype';
import { PAIRED_EXPECTATIONS, PAIRED_ACCEPTANCE } from '../src/server/eval/paired-expectations';
import simulationSchema from '../src/server/eval/paired-simulation-schema.json';
const runId = 'context-bench-v3-20261113-pair3';
const env = process.env;
async function main() {
  if (!env.ANTHROPIC_API_KEY || !env.DATABASE_URL) { console.log('context_eval_waiting_for_environment'); return; }
  const apiKey=env.ANTHROPIC_API_KEY;
  const pool = new pg.Pool({ connectionString: env.DATABASE_URL, max: 1, connectionTimeoutMillis: 10000 });
  const model = env.AI_CHEAP_MODEL || prototype.aiCheapModel;
  const price = prototype.aiPricesUsdPerMTok[model];
  if (!price) throw new Error('model_unpriced');
  const month = new Date().toISOString().slice(0,7), today = new Date().toISOString().slice(0,10);
  const cap = Math.floor(Math.min(5, Number(env.AI_MONTHLY_BUDGET_USD || 5)) * 1e6);
  const schema = schemas.assessment.schema;

  async function paidCall(key:string, task:string, input:unknown, user:string, system:string, schema:unknown, maxTokens:number) {
      const chars=JSON.stringify(input).length;
      const worst=Math.ceil((Math.ceil(chars/2)+3000)*price[0]*1.25+maxTokens*price[1]);
      const est=Math.ceil(chars/3)+600+maxTokens;
      const client=await pool.connect();
      let booked=false;
      try {
        await client.query('begin');
        await client.query('select pg_advisory_xact_lock(hashtextextended($1,0))',['ai_spend:'+month]);
        const previous=await client.query('select 1 from ai_spend where request_key=$1',[key]);
        if(previous.rowCount) {await client.query('rollback');throw new Error('already_attempted');}
        const used=Number((await client.query("select coalesce(sum(case when state='settled' then actual_micro_usd else reserved_micro_usd end),0)::text as used from ai_spend where utc_month=$1",[month])).rows[0].used);
        const runUsed=Number((await client.query("select coalesce(sum(case when state='settled' then actual_micro_usd else reserved_micro_usd end),0)::text as used from ai_spend where request_key like $1",['context-bench-v3-20261113%'])).rows[0].used);
        if(used+worst>cap || runUsed+worst>500000) throw new Error('budget_cap');
        await client.query('select pg_advisory_xact_lock(hashtextextended($1,0))',['ai_budget:'+today]);
        const daily=Number((await client.query("select coalesce(sum(case when state='reconciled' then actual_tokens when state='reserved' and expires_at>now() then reserved_tokens else 0 end),0)::text as used from ai_budget_reservations where utc_date=$1",[today])).rows[0].used);
        if(daily+est>prototype.aiDailyTokenLimit) throw new Error('daily_budget');
        await client.query('insert into ai_spend(request_key,utc_month,task,model_id,reserved_micro_usd) values($1,$2,$3,$4,$5)',[key,month,task,model,worst]);
        await client.query("insert into ai_budget_reservations(request_key,utc_date,reserved_tokens,expires_at) values($1,$2,$3,now()+interval '1 hour')",[key,today,est]);
        await client.query('commit');booked=true;
      } catch(e) {await client.query('rollback');throw e;} finally {client.release();}
      if(!booked) throw new Error('not_booked');
      const response=await fetch('https://api.anthropic.com/v1/messages',{method:'POST',headers:{'x-api-key':apiKey,'anthropic-version':'2023-06-01','content-type':'application/json'},body:JSON.stringify({model,max_tokens:maxTokens,system:[{type:'text',text:system,cache_control:{type:'ephemeral'}}],messages:[{role:'user',content:user}],output_config:{format:{type:'json_schema',schema}}}),signal:AbortSignal.timeout(45000)});
      if(!response.ok){await pool.query("update ai_spend set state='unsettled',updated_at=now() where request_key=$1",[key]);const failure=await response.json().catch(()=>({})) as {error?:{message?:string}}; throw new Error(`provider_http_${response.status}:`+String(failure.error?.message??'unknown').replaceAll(apiKey,'[redacted]').slice(0,600));}
      const body=await response.json() as {stop_reason:string;content:{type:string;text?:string}[];usage:{input_tokens:number;output_tokens:number;cache_creation_input_tokens?:number;cache_read_input_tokens?:number}};
      const u=body.usage;
      const actual=Math.ceil(u.input_tokens*price[0])+Math.ceil((u.cache_creation_input_tokens??0)*price[0]*1.25)+Math.ceil((u.cache_read_input_tokens??0)*price[0]*.1)+Math.ceil(u.output_tokens*price[1]);
      await pool.query("update ai_spend set state='settled',actual_micro_usd=$2,updated_at=now() where request_key=$1",[key,actual]);
      await pool.query("update ai_budget_reservations set state='reconciled',actual_tokens=$2,updated_at=now() where request_key=$1",[key,u.input_tokens+u.output_tokens]);
      if(body.stop_reason==='max_tokens') throw new Error('truncated_output');
      const output=JSON.parse(body.content.filter(c=>c.type==='text').map(c=>c.text??'').join('')) as Record<string,unknown>;

      return {output,actual};
  }
  console.log(JSON.stringify({event:'pair_started',runId,model,cases:4,runLimitUsd:0.50,monthlyLimitUsd:cap/1e6}));
  try {
    console.log(JSON.stringify({event:'pair_expectations',runId,expected:PAIRED_EXPECTATIONS,acceptance:PAIRED_ACCEPTANCE,profiles:CONTEXT_PEOPLE.filter(p=>['p01','p02'].includes(p.id)),jobs:CONTEXT_JOBS}));
    for(const person of CONTEXT_PEOPLE.filter(p=>['p01','p02'].includes(p.id))){
      const messages:{role:string;text:string}[]=[{role:'user',text:person.evidence[0].safeClaim}];
      const used=new Set([person.evidence[0].id]);
      for(let turn=0;turn<4;turn++){
        const input={cv:null,preferencesSet:true,known:person.evidence.filter(e=>used.has(e.id)).map(e=>({topic:'Approved fictional work experience',answer:e.safeClaim})),missing:[],allTopics:ONBOARDING_QUESTIONS.map(q=>({key:q.key,topic:q.text})),messages,interviewAgenda:[]};
        const wrap=(label:string,value:unknown)=>`<${label}>\n${JSON.stringify(value)}\n</${label}>`;
        const user=`job_preferences: set\n${wrap('cv','none uploaded')}\n${wrap('already_known',input.known)}\n${wrap('interview_agenda',input.interviewAgenda)}\n${wrap('missing_topics',input.missing)}\n${wrap('all_topics',input.allTopics)}\n${wrap('conversation',messages.slice(-14))}`;
        const chat=await paidCall(`${runId}:${person.id}:chat:${turn}`,'paired_interview',input,user,MINIME_SYSTEM,schemas.interview.schema,3000);
        console.log(JSON.stringify({event:'pair_adaptive_turn',person:person.id,turn,answer:messages.at(-1)?.text,output:chat.output,configuredCostUsd:chat.actual/1e6}));
        if(turn===3)break;
        messages.push({role:'assistant',text:String(chat.output.reply)});
        const available=person.evidence.filter(e=>!used.has(e.id));
        const selection=await paidCall(`${runId}:${person.id}:select:${turn}`,'paired_script_selection',{question:chat.output.reply,available},JSON.stringify({question:chat.output.reply,available}),'Select up to two supplied evidence IDs which directly answer the interviewer question. Return none if no item answers it. Do not invent facts. You are selecting a prewritten fictional answer, not assessing capability.',{type:'object',properties:{ids:{type:'array',items:{type:'string'}}},required:['ids'],additionalProperties:false},1500);
        const ids=selection.output.ids as string[];
        if(!Array.isArray(ids)||ids.length>2||ids.some(id=>!available.some(e=>e.id===id)))throw new Error('script_selection_invalid');
        const answer=ids.length?ids.map(id=>available.find(e=>e.id===id)!.safeClaim).join(' '):"I haven't shared an example of this yet.";
        ids.forEach(id=>used.add(id));messages.push({role:'user',text:answer});
        console.log(JSON.stringify({event:'pair_script_selection',person:person.id,turn,ids,configuredCostUsd:selection.actual/1e6}));
      }
      for(const job of CONTEXT_JOBS){
        const input={criteria:job.criteria.map(({criterionId,label,description,evidenceTags})=>({criterionId,label,description,evidenceTags})),evidence:person.evidence};
        const output:{criteria:unknown[]}={criteria:[]};let actual=0;
        for(let start=0;start<input.criteria.length;start+=4){
          const part={...input,criteria:input.criteria.slice(start,start+4)};
          const user=`<role_criteria>\n${JSON.stringify(part.criteria)}\n</role_criteria>\n<approved_evidence>\n${JSON.stringify(part.evidence)}\n</approved_evidence>`;
          const r=await paidCall(`${runId}:${job.id}:${person.id}:assessment:${start}`,'paired_assessment',part,user,MATCHING_SYSTEM,schema,4000);
          output.criteria.push(...r.output.criteria as unknown[]);actual+=r.actual;
        }
        console.log(JSON.stringify({event:'pair_assessment',person:person.id,job:job.id,output,configuredCostUsd:actual/1e6}));
        const questions=job.criteria.map(c=>({question:`Tell me about a time you worked on ${c.label.toLowerCase()}. What did you do, and what happened?`,screening:false}));
        const sim={role:{title:job.title,outcomes:[]},questions,examples:person.evidence.map(e=>({id:e.id,text:e.safeClaim,tags:e.tags}))};
        const wrap=(label:string,value:unknown)=>`<${label}>\n${JSON.stringify(value)}\n</${label}>`;
        const user=`${wrap('role',sim.role)}\n${wrap('interview_questions',questions.map((q,index)=>({index,...q})))}\n${wrap('approved_examples',sim.examples)}`;
        const r=await paidCall(`${runId}:${job.id}:${person.id}:simulation`,'paired_simulation',sim,user,SIMULATION_SYSTEM,simulationSchema,6000);
        console.log(JSON.stringify({event:'pair_job_interview',person:person.id,job:job.id,questions,output:r.output,configuredCostUsd:r.actual/1e6}));
      }
    }
    console.log(JSON.stringify({event:'pair_done',runId}));
  } finally {await pool.end();}
}
main().catch(e=>{console.log(JSON.stringify({event:'pair_failed',code:e instanceof Error?e.message:'unknown'}));process.exitCode=1;});
