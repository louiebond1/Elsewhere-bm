# Deploy on Vercel Hobby + Neon

Zero-cost target: one Next.js app on Vercel Hobby, Neon free Postgres, files in Postgres, no worker service and no object storage. Fixture AI is the default, so a deploy does not call Anthropic.

Railway (Dockerfile, separate worker, S3) is unchanged. Locally, `npm run worker` / `npm run worker:dev` still runs the polling loop.

## Which branch

Deploy **`simple-hiring`**, the branch Railway runs. `main` is many commits behind: it lacks the Mini Me globe, versioned shortlists, the interview rules and migrations up to 0022. The Neon copy of the Railway database already has that newer schema. Set Vercel's Production Branch to `simple-hiring`, or merge `simple-hiring` into `main` first. Scheduled GitHub workflows only run from the default branch, so `drain-jobs.yml` must also be on `main`.

## Vercel project

| Setting | Value |
|---|---|
| Framework Preset | Next.js |
| Root Directory | repository root (leave empty) |
| Node.js Version | 22.x |
| Install Command | `npm ci` |
| Build Command | `npm run vercel-build` |
| Output Directory | leave empty (Next.js default) |

`npm run vercel-build` runs `npm run db:migrate` and then `next build`. `DATABASE_URL` and `DATABASE_URL_UNPOOLED` must be available to the **build**, not only at runtime. Migrations use the direct URL when `DATABASE_URL_UNPOOLED` or `DIRECT_URL` is set.

If those URLs are runtime-only, set the Build Command to `npm run build` and apply migrations once from a laptop (below).

Set the project region to the same region as the Neon database. Do not add a Vercel Cron: Hobby crons run daily. Expiry and leftover jobs are handled by the GitHub Actions workflow below, and by a short drain after each request that queues work.

There is no second service and no bucket.

## Neon

Create a free Postgres database. Copy both connection strings:

- `DATABASE_URL` — pooled host (the hostname contains `-pooler`). The app uses this.
- `DATABASE_URL_UNPOOLED` — direct host (no `-pooler`). Migrations, seed and reset use this when it is set.

Set `PG_POOL_MAX` to `1`. On Vercel the pool already defaults to 1 when that variable is missing; set it anyway. Neon multiplexes those client connections. Do not point the running app at the direct host.

The free compute sleeps when idle. The first query after sleep can take a few seconds; the serverless pool waits up to 15 seconds to connect.

## Environment variables

Set these on Vercel for Production (and Preview, if you want preview builds to migrate the same database). Names only. Generate the secrets locally and do not commit them:

`node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`

Required:

| Name | Value |
|---|---|
| `APP_MODE` | `demo` |
| `APP_URL` | `https://<your-deployment-host>` with no trailing slash |
| `DATABASE_URL` | Neon pooled URL |
| `DATABASE_URL_UNPOOLED` | Neon direct URL |
| `STORAGE_DRIVER` | `database` |
| `PG_POOL_MAX` | `1` |
| `DEMO_ACCESS_PASSWORD` | private, at least 10 characters, different from the login password |
| `DEMO_LOGIN_PASSWORD` | private, at least 10 characters |
| `SESSION_PEPPER` | 32 random bytes as hex (64 characters) |
| `PUBLIC_REF_SECRET` | another 32 random bytes as hex, different from `SESSION_PEPPER` |
| `CRON_SECRET` | private, at least 16 characters. Same value as the GitHub Actions secret |

`AI_PROVIDER` defaults to `fixture` (no model calls). Leave it unset, or set `fixture`. Live mode is still supported: set `AI_PROVIDER` to `live` and set `ANTHROPIC_API_KEY`. Optional model overrides: `AI_CHEAP_MODEL`, `AI_REVIEW_MODEL`.

Leave `EMAIL_DRIVER` unset (`fixture`) unless you configure Resend (`RESEND_API_KEY`, `EMAIL_FROM`, `EMAIL_REPLY_TO`, `EMAIL_ALLOWLIST`). Optional: `SENTRY_DSN`, `SENTRY_ENVIRONMENT`, `LOG_LEVEL`.

Do **not** set `S3_ENDPOINT`, `S3_REGION`, `S3_BUCKET`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY` or `S3_FORCE_PATH_STYLE`. Those are required only when `STORAGE_DRIVER=s3`.

## Jobs

`src/server/worker.ts` is the local and Railway loop. About once a minute it queues the housekeeping, then drains the queue. The housekeeping is:
- introduction and contract expiry, every minute;
- the shortlist tick (delivering shortlists when their window closes, expiring screening invitations), every minute;
- the interview sweep, every 10 minutes.

Each item has a dedupe key per period, so the worker, the post-request drain and the cron drain never queue it twice.

On Vercel the same drain runs in two places:

- After a request queues a job, `after()` drains for up to 20 seconds (expiry tick included). Fixture jobs (CV text, profile build, email, deletion) finish there. The API route allows 60 seconds for the handler plus that drain.
- `POST /api/cron/drain` (GET works too) drains for up to 50 seconds. It requires `Authorization: Bearer <CRON_SECRET>`. A missing or wrong secret returns 401 and does not run work.

Live `assess_match` can be many model calls. The drain stops before the time budget and puts that job back on the queue **without** using up its three failures. Later drains continue it. One model call fits in the 60 second route cap. Hobby allows up to 300 seconds; these routes stay at 60 so a stuck call cannot hold a function for five minutes. The job lease is 2 minutes, longer than either drain, so a killed invocation can be claimed again.

While someone is using the demo, the housekeeping runs on the post-response drain (about a minute). When the app is idle, it waits for the GitHub Actions run, about every 10 minutes. GitHub may start a scheduled workflow later than the clock. A shortlist can therefore be delivered up to about 10 minutes after its window closes when nobody is using the demo.

With `AI_PROVIDER=fixture`, interviews, Mini Me answers and the hiring assistant all use the built-in basic versions (Mini Me says "Basic mode"). Railway currently runs the live AI. To keep it on Vercel, set `AI_PROVIDER=live` and `ANTHROPIC_API_KEY`. The $10 monthly cap still applies. Live interview jobs are long; each drain stops before its time limit and resumes on the next one.

## GitHub Actions

Workflow: `.github/workflows/drain-jobs.yml`. It runs on the default branch after this file is merged. Schedule: `*/10 * * * *`, plus “Run workflow” under Actions → Drain job queue.

Repository secrets (Settings → Secrets and variables → Actions). Not committed:

| Secret | Value |
|---|---|
| `APP_URL` | same origin as Vercel `APP_URL`, no path and no trailing slash |
| `CRON_SECRET` | the same string as Vercel `CRON_SECRET` |

The workflow POSTs `APP_URL/api/cron/drain` with `Authorization: Bearer <CRON_SECRET>`. If either secret is missing, the run skips and exits 0.

## Seed and reset

Do this from a laptop after the first successful deploy. `vercel env pull .env.local` writes a gitignored file. Admin scripts (`db:migrate`, `db:seed`, `check:seed`, `demo:reset`) use `DATABASE_URL_UNPOOLED` when that variable is present.

```bash
vercel env pull .env.local
npm run db:seed
npm run check:seed
```

Seed refuses to replace an existing dataset.

**Files after the Railway move:** the Neon copy has the `files` rows but not the bytes, which were in Railway's bucket. Downloading or re-reading those old CVs fails until a reset. `demo:reset` recreates every demo CV and the screening recording as bytes in Postgres; this was checked with `STORAGE_DRIVER=database` (39 of 39 CVs and 1 of 1 recordings have stored bytes after a reset). A reset **wipes the whole demo dataset**, including accounts made by hand on the live demo, so only run it with the owner's OK.

To wipe and load the baseline again:

```bash
npm run demo:reset -- --confirm RESET
```

Empty workspace: `npm run demo:reset -- --confirm RESET --scenario EMPTY`.

If migrations did not run during the Vercel build:

```bash
npm run db:migrate
npm run db:seed
npm run check:seed
```

Do not commit `.env.local` or any connection string.

## Runtime notes

Checked on Node 22:

- `argon2` ships a glibc prebuild for linux-x64 (Vercel’s Node runtime). It stays external, and `outputFileTracingIncludes` keeps `prebuilds/`. Passwords stay Argon2id. No swap.
- CV text uses `pdfjs-dist` legacy build and `getTextContent` only. Standard font files are loaded from the package on disk and are included in the trace. `useWasm` is off. Extraction does not render pages, so it still works when the optional `@napi-rs/canvas` package is absent. `mammoth` (DOCX) is plain JavaScript.
- `pg` uses the pooled Neon URL with `max: 1` on Vercel. `node-postgres` ignores a `channel_binding` query parameter if Neon includes one; leave the URL as issued unless a connection error names that parameter.
