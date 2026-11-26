/**
 * One-off admin scripts use a direct Postgres session when one is configured.
 * The running app keeps DATABASE_URL (Neon's pooled host). The value is never logged.
 */
export function preferDirectDatabaseUrl() {
  const direct = process.env.DATABASE_URL_UNPOOLED || process.env.DIRECT_URL;
  if (direct) process.env.DATABASE_URL = direct;
  return Boolean(direct);
}
