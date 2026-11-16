import pg from 'pg';
import { runAi, aiMode, AiFailure } from '../src/server/ai';
import { closeDb } from '../src/server/db/client';
import { EMPTY, sanitise } from '../src/lib/hiring';

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 1, statement_timeout: 10000 });
try {
  // Read only aggregate operational metadata. Never log prompts, personal data or credentials.
  const spend = await pool.query("select utc_month, state, count(*)::int as calls, sum(case when state='settled' then actual_micro_usd else reserved_micro_usd end)::text as micro_usd from ai_spend where utc_month=to_char(now() at time zone 'UTC','YYYY-MM') group by utc_month,state");
  const runs = await pool.query("select task,outcome,error_code,count(*)::int as calls,max(created_at) as latest from ai_runs where created_at>now()-interval '7 days' group by task,outcome,error_code order by latest desc");
  const conversationProviders = await pool.query("select provider,count(*)::int as conversations from hiring_conversations group by provider");
  console.log(JSON.stringify({ event: 'ai_incident_diagnostics', spend: spend.rows, runs: runs.rows, conversationProviders: conversationProviders.rows, provider: process.env.AI_PROVIDER, configuredMonthlyLimit: Math.min(10, Number(process.env.AI_MONTHLY_BUDGET_USD ?? 10)) }));
} finally {
  await pool.end();
}

try {
  if (aiMode() === 'live') {
    const input = {
      messages: [
        { role: 'user' as const, text: 'leadership' },
        { role: 'assistant' as const, text: 'What else matters for this job? I have 2 so far and need at least 3.' },
        { role: 'user' as const, text: 'Three qualities a CFO might need are strong financial reporting skills, experience managing budgets and cash flow, and the ability to communicate financial results to non-finance leaders.' },
      ],
      understanding: { ...structuredClone(EMPTY), title: 'CFO', roleFamily: 'finance' as const, salaryPounds: 100000, locationRegion: 'london' as const, workMode: 'hybrid' as const, outcomes: ['Oversee the finance team'], askedTeachable: true, mustHaves: [{ label: 'Reporting', tags: ['reporting'] }, { label: 'Budgeting', tags: ['budgeting'] }] },
      memory: [],
      missing: ['skills'],
    };
    const result = await runAi({ task: 'hiring', input }, p => p.hiringTurn(input));
    const captured = sanitise(result.output.understanding, input.understanding);
    console.log(JSON.stringify({ event: 'hiring_incident_live_check', provider: result.provider, requirementCount: captured.mustHaves.length + captured.niceToHaves.length, requirements: [...captured.mustHaves, ...captured.niceToHaves].map(i => i.label) }));
  }
} catch (e) {
  console.log(JSON.stringify({ event: 'hiring_incident_live_check_failed', code: e instanceof AiFailure ? e.code : 'unknown' }));
} finally {
  await closeDb();
}
