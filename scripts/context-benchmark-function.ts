/** Isolated, one-shot Railway evaluation. No candidate records or application settings are changed. */
import pg from 'pg';
import { CONTEXT_JOBS, CONTEXT_PEOPLE } from '../src/server/eval/context-set';
import schemas from '../src/server/eval/context-output-schemas.json';
import { ONBOARDING_QUESTIONS } from '../src/config/onboarding';
import { MATCHING_SYSTEM, MINIME_SYSTEM } from '../src/server/ai/prompts';
import { prototype } from '../src/config/prototype';
const runId = 'context-bench-v3-20261113-h';
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
  const cases = CONTEXT_JOBS.flatMap(job => [...CONTEXT_PEOPLE.map(person => ({job,person,repeat:false})), ...CONTEXT_PEOPLE.filter(p=>['p01','p02'].includes(p.id)).map(person=>({job,person,repeat:true}))]);
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
  console.log(JSON.stringify({event:'context_eval_started',runId,model,cases:env.CONTEXT_INTERVIEW_ONLY==='1'?0:cases.length,runLimitUsd:0.50,monthlyLimitUsd:cap/1e6}));
  try {
    for (const row of env.CONTEXT_INTERVIEW_ONLY==='1'?[]:cases) {
      const key=`${runId}:${row.job.id}:${row.person.id}:${row.repeat?'repeat':'base'}`;
      const fields={job:row.job.id,person:row.person.id,repeat:row.repeat};
      if (!row.person.evidence.length) { console.log(JSON.stringify({event:'context_eval_result',...fields,provider:'no_evidence',output:{criteria:row.job.criteria.map(c=>({criterionId:c.criterionId,level:'unknown',evidenceIds:[],quote:'',reasonSafe:'No information shared.',followUp:`Tell me about your experience with ${c.label.toLowerCase()}.`}))}})); continue; }
      // Exactly the production assessment input shape and matching instructions.
      const input={criteria:row.job.criteria.map(({criterionId,label,description,evidenceTags})=>({criterionId,label,description,evidenceTags})),evidence:row.person.evidence};
      const output:{criteria:unknown[]}={criteria:[]}; let actual=0;
      for(let start=0;start<input.criteria.length;start+=4){
        const part={...input,criteria:input.criteria.slice(start,start+4)};
        const partUser=`<role_criteria>\n${JSON.stringify(part.criteria)}\n</role_criteria>\n<approved_evidence>\n${JSON.stringify(part.evidence)}\n</approved_evidence>`;
        const r=await paidCall(`${key}:part:${start}`,'context_eval',part,partUser,MATCHING_SYSTEM,schema,4000);
        output.criteria.push(...r.output.criteria as unknown[]);actual+=r.actual;
      }
      console.log(JSON.stringify({event:'context_eval_case',...fields,provider:'anthropic',count:(output.criteria as unknown[]).length,configuredCostUsd:actual/1e6}));
      (output.criteria as unknown[]).forEach((value,index)=>console.log(JSON.stringify({event:'context_eval_criterion',...fields,index,value})));
    }
    const probes=[
      {id:'factory',claim:'I was CFO in a factory in China described as a sweatshop.',answer:'We had two finance staff and no ERP. When cash was short I checked stock on the floor, negotiated staged supplier payments and challenged a proposal to delay wages. I could not change every factory condition.'},
      {id:'youngest',claim:'I was the youngest colleague at EX3. This was my third job. I proposed a new testing approach to colleagues with much more experience.',answer:'I built a small prototype, asked two experienced colleagues to challenge it and changed the design after their feedback. They helped me demonstrate it to the team. I did not manage them.'},
      {id:'oldest',claim:'I was the oldest person in a startup finance team and coached five colleagues who were new to month-end work.',answer:'I first asked each person which steps they found confusing, then paired with them on reconciliations and made a short checklist. I checked the first close and gradually handed over responsibility.'},
      {id:'group',claim:'I was CFO at McDonald’s. This is an invented profile for an interview test.',answer:'I coordinated twelve entity controllers through an acquisition close, challenged misleading revenue reporting and obtained an independent review before sign-off. I am describing my own decisions, not claiming all staff had an easy working life.'},
    ];
    for(const probe of probes){
      const messages:{role:string;text:string}[]=[];
      for(let turn=0;turn<2;turn++){
        messages.push({role:'user',text:turn===0?probe.claim:probe.answer});
        const input={cv:null,preferencesSet:true,known:turn===0?[]:[{topic:'Work experience',answer:probe.claim}],missing:[],allTopics:ONBOARDING_QUESTIONS.map(q=>({key:q.key,topic:q.text})),messages,interviewAgenda:[]};
        const {output,actual}=await paidCall(`${runId}:interview:${probe.id}:${turn}`,'context_interview_eval',input,JSON.stringify(input),MINIME_SYSTEM,schemas.interview.schema,3000);
        console.log(JSON.stringify({event:'context_interview_turn',probe:probe.id,turn,input:messages.at(-1)?.text,output,configuredCostUsd:actual/1e6}));
        messages.push({role:'assistant',text:String(output.reply)});
      }
    }
    console.log(JSON.stringify({event:'context_eval_done',runId}));
  } finally {await pool.end();}
}
main().catch(e=>{console.log(JSON.stringify({event:'context_eval_failed',code:e instanceof Error?e.message:'unknown'}));process.exitCode=1;});
