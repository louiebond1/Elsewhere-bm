import { z } from 'zod';

const placeholder = 'choose-a-private-demo-password';

const schema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  APP_MODE: z.literal('demo'),
  APP_URL: z.string().url(),
  DATABASE_URL: z.string().min(1),
  PORT: z.coerce.number().int().positive().default(3000),
  ANTHROPIC_API_KEY: z.string().optional(),
  AI_PROVIDER: z.enum(['fixture', 'live']).default('fixture'),
  AI_CHEAP_MODEL: z.string().optional(),
  AI_REVIEW_MODEL: z.string().optional(),
  STORAGE_DRIVER: z.enum(['s3', 'database']).default('s3'),
  S3_ENDPOINT: z.string().optional(),
  S3_REGION: z.string().optional(),
  S3_BUCKET: z.string().optional(),
  S3_ACCESS_KEY_ID: z.string().optional(),
  S3_SECRET_ACCESS_KEY: z.string().optional(),
  S3_FORCE_PATH_STYLE: z.enum(['true', 'false']).default('false'),
  DEMO_ACCESS_PASSWORD: z.string().min(10).refine((v) => v !== placeholder, 'must be changed from the placeholder'),
  DEMO_LOGIN_PASSWORD: z.string().min(10).refine((v) => v !== placeholder, 'must be changed from the placeholder'),
  SESSION_PEPPER: z.string().min(64, 'must be at least 32 random bytes as hex'),
  PUBLIC_REF_SECRET: z.string().min(64, 'must be at least 32 random bytes as hex'),
  LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error']).default('info'),
}).superRefine((v, ctx) => {
  if (v.SESSION_PEPPER === v.PUBLIC_REF_SECRET) ctx.addIssue({ code: 'custom', path: ['PUBLIC_REF_SECRET'], message: 'must differ from SESSION_PEPPER' });
  if (v.DEMO_ACCESS_PASSWORD === v.DEMO_LOGIN_PASSWORD) ctx.addIssue({ code: 'custom', path: ['DEMO_ACCESS_PASSWORD'], message: 'must differ from DEMO_LOGIN_PASSWORD' });
  if (v.AI_PROVIDER === 'live' && !v.ANTHROPIC_API_KEY) ctx.addIssue({ code: 'custom', path: ['ANTHROPIC_API_KEY'], message: 'required when AI_PROVIDER=live' });
  if (v.STORAGE_DRIVER === 's3') {
    for (const k of ['S3_ENDPOINT', 'S3_REGION', 'S3_BUCKET', 'S3_ACCESS_KEY_ID', 'S3_SECRET_ACCESS_KEY'] as const) {
      if (!v[k]) ctx.addIssue({ code: 'custom', path: [k], message: 'required when STORAGE_DRIVER=s3' });
    }
  }
});

export type Env = z.infer<typeof schema>;

let cached: Env | null = null;

/** Validates lazily at first use (never at build time). Reports variable names only, never values. */
export function env(): Env {
  if (cached) return cached;
  const parsed = schema.safeParse(process.env);
  if (!parsed.success) {
    const names = [...new Set(parsed.error.issues.map((i) => `${String(i.path[0])}: ${i.message}`))];
    throw new Error(`Invalid environment configuration:\n  ${names.join('\n  ')}`);
  }
  cached = parsed.data;
  return cached;
}

export function resetEnvCacheForTests() {
  cached = null;
}
