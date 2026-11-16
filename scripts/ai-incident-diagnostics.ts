import pg from 'pg';

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
