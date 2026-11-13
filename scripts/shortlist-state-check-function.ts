/** Isolated, one-shot Railway evaluation. No candidate records or application settings are changed. */
import pg from 'pg';
import { MATCHING_SYSTEM } from '../src/server/ai/prompts';
import { prototype } from '../src/config/prototype';
import schemas from '../src/server/eval/context-output-schemas.json';
const runId = 'context-bench-v3-20261113-shortlist-states';
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
  console.log(JSON.stringify({event:'state_check_started',runId,model,cases:5,runLimitUsd:0.50,monthlyLimitUsd:cap/1e6}));
  const criteria=[
   {criterionId:'recs',label:'Own bank reconciliations',description:'Related: neighbouring ledger checks. Some: supports bank reconciliations. Clear: personally reconciles bank accounts. Strong: does it regularly and investigates exceptions. Numerical totals are optional.',evidenceTags:[]},
   {criterionId:'process',label:'Build a maintainable simple process',description:'Related: nearby process work. Some: supports a change. Clear: personally makes a practical improvement. Strong: also trains colleagues so they can maintain it. Numerical results are optional.',evidenceTags:[]},
  ];
  const cases=[
   {id:'unknown',claims:['I play football at weekends.'],expected:{recs:['unknown'],process:['unknown']}},
   {id:'none_stated',claims:['I have never reconciled bank or supplier accounts. I have no related finance experience.','I have never improved a work process and have no related examples.'],expected:{recs:['none_stated'],process:['none_stated']}},
   {id:'related',claims:['I have never owned bank reconciliations. I compared supplier statements with ledger entries, identified discrepancies and passed them to the accountant.'],expected:{recs:['related'],process:['unknown']}},
   {id:'not_met',claims:['I will not do bank reconciliations or process improvement.'],expected:{recs:['not_met'],process:['not_met']}},
   {id:'missing_number',claims:['Every week I personally reconcile the bank, investigate exceptions and correct duplicated postings. I cannot remember how many transactions were involved.','I built a shared checklist, trained two colleagues to use it and handed over responsibility. They still maintain it. I cannot remember the exact hours saved.'],expected:{recs:['strong'],process:['strong']}},
  ];
  try {
   console.log(JSON.stringify({event:'state_expectations',criteria,cases}));
   for(const test of cases){const evidence=test.claims.map((safeClaim,i)=>({id:`${test.id}:${i}`,safeClaim,tags:[],strength:'specific',uncertainty:null}));const input={criteria,evidence};const user=`<role_criteria>\n${JSON.stringify(criteria)}\n</role_criteria>\n<approved_evidence>\n${JSON.stringify(evidence)}\n</approved_evidence>`;const r=await paidCall(`${runId}:${test.id}`,'shortlist_state_eval',input,user,MATCHING_SYSTEM,schemas.assessment.schema,4000);console.log(JSON.stringify({event:'state_result',id:test.id,input,expected:test.expected,output:r.output,configuredCostUsd:r.actual/1e6}));}
   console.log(JSON.stringify({event:'state_check_done',runId}));
  }finally{await pool.end();}
}
main().catch(e=>{console.log(JSON.stringify({event:'state_check_failed',code:e instanceof Error?e.message:'unknown'}));process.exitCode=1;});
