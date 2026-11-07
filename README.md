# BondMoran Hiring Partnership prototype (powered by Elsewhere)

A working prototype built from the *BondMoran and Elsewhere prototype build specification* (Version 1, 6 November 2026). **Fictional data only.** It is not production ready. Every commercial value is a provisional prototype setting, not an agreement by BondMoran.

- Web: Next.js 16 App Router, React 19, Tailwind CSS 4, TypeScript
- Data: PostgreSQL 16 with Drizzle ORM (node-postgres)
- Worker: a separate Node process (`npm run worker`) that claims jobs with `FOR UPDATE SKIP LOCKED`
- Files: private S3-compatible bucket (Railway bucket or MinIO), or PostgreSQL storage for local and test runs
- AI: `fixture` mode by default (labelled "Demo responses", no network calls); `live` mode uses the Anthropic Messages API with `claude-haiku-5-5` for routine tasks and `claude-sonnet-5-5` for consultant review

## Quick start (local)

1. Node 22.14+ (Node 24 LTS in Docker), PostgreSQL 16. Optionally `docker compose up -d` for PostgreSQL and MinIO.
2. `cp .env.example .env.local` and set private values. Generate secrets with `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`. For a throwaway local run without MinIO set `STORAGE_DRIVER=database`.
3. `npm ci`
4. `npm run check:env`
5. `npm run db:migrate`
6. `npm run db:seed` (refuses to replace an existing dataset)
7. `npm run dev` and, in another terminal, `npm run worker:dev`
8. Open http://localhost:3000, enter `DEMO_ACCESS_PASSWORD`, then pick a fictional account. All fictional accounts use `DEMO_LOGIN_PASSWORD`.

Start from nothing: `npm run demo:reset -- --confirm RESET --scenario EMPTY` (or "Start empty workspace" on `/demo/personas`). Only the two consultants exist; clients you create get a login with `DEMO_LOGIN_PASSWORD`.

Reset to the baseline: `npm run demo:reset -- --confirm RESET` (or the Reset demo button on `/demo/personas`). Load a scenario from the command line: `npm run demo:reset -- --confirm RESET --scenario S02`.

## Commands

| Command | Purpose |
|---|---|
| `npm run dev` / `npm run worker:dev` | Dev server and worker watcher |
| `npm run build` / `npm run start` | Production build; start binds `0.0.0.0:$PORT` through `scripts/start.mjs` |
| `npm run worker` | Production worker |
| `npm run db:generate` | Generate a Drizzle migration for review |
| `npm run db:migrate` | Apply migrations (Railway pre-deploy command) |
| `npm run db:seed` / `npm run check:seed` | Initial seed and seed check |
| `npm run demo:reset -- --confirm RESET` | Explicit reset |
| `npm run typecheck` / `npm run lint` | Static checks |
| `npm run test:unit` | Pricing, dates, ranking rules |
| `npm run test:integration` | Real PostgreSQL: ledger, locks, concurrency, privacy, jobs. Uses `TEST_DATABASE_URL` (default `postgres://bm:bm@localhost:5432/bondmoran_test`) |
| `npm run test:e2e` | Playwright against a running server in fixture mode (see `playwright.config.ts`) |
| `npm test` | Unit and integration suites (no live AI) |

## Environment variables

See `.env.example`. Secrets are read only on the server and never exposed to the browser. The env loader (`src/server/env.ts`) reports variable names only. Additions beyond the specification table: `STORAGE_DRIVER` (`s3` or `database`), `PUBLIC_REF_SECRET` (role-scoped references), `TEST_DATABASE_URL`, `PG_POOL_MAX`.

## Railway deployment

Settings controlled by files: `railway.web.json` (Dockerfile build, `npm run start`, pre-deploy `npm run db:migrate`, healthcheck `/api/health`) and `railway.worker.json` (Dockerfile build, `npm run worker`, no healthcheck, no domain). Select the matching config path for each service. Set the service root directory to `bondmoran` because this app lives in a subfolder of the repository.

Configured in Railway (never committed): all variables in `.env.example`, `DATABASE_URL` as a reference to the PostgreSQL service, bucket credentials copied exactly from the Railway bucket, and `APP_URL` set to the web service's generated HTTPS domain.

First deploy: deploy web (migrations run), then worker. Then `railway ssh --service web` and run `npm run db:seed && npm run check:seed`. Startup never seeds or resets automatically. Pin the Node image digest in the Dockerfile after testing.

## What is where

- `src/config/prototype.ts` frozen provisional configuration (pricing version `half-steps-v1`)
- `src/server/lib/pricing.ts` pure BigInt pricing; `src/server/lib/matching-rules.ts` eligibility, scoring, auto-picks
- `src/server/services/*` transactional commands (roles, intros, hires, replacements, ledger, screenings, candidates, conversations, files, demo seed and scenarios)
- `src/server/policies/privacy.ts` discovery, blocks (with organisation groups) and identity grants
- `src/server/dto/*` explicit allow-list serializers; clients use role-scoped HMAC references
- `src/server/ai/*` versioned prompts, Zod schemas, fixture and Anthropic providers, provenance validation, token admission
- `src/server/api-routes.ts` + `app/api/[...slug]/route.ts` command and query endpoints
- `fixtures/candidates.ts` the 40 fictional candidates
- `docs/HANDOVER.md` test results, decisions and known limitations
