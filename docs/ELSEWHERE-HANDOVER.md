> Latest release, 13 November 2026: web and worker are live at `d30e842bf7747f9814dbe47e642246c7a8d89c83`. Approved new jobs now have a 24-hour evidence cutoff, delivery due at 25 hours and versioned top-ten lists instead of an employer-facing live leaderboard. Missing evidence, never done it and explicitly not met are distinct. Strong incomplete contenders have a consultant review route; late evidence can enter scheduled updates. Screening now needs candidate consent for the particular job, with coupon reservation on acceptance and consultant pass/fail. All 219 automated tests and four desktop/phone browser checks passed. Five live AI state cases matched all ten expected criterion decisions and passed quote validation. Migrations completed without a live reset. Notifications are in-app only. Read `docs/SHORTLIST-DELIVERY.md` and `docs/evaluations/SHORTLIST-STATE-CHECK.md` for implementation details, deployment evidence and limitations. Existing jobs retain their delivered snapshot until a new approved cycle starts. The original handover below is historical, including its spend figures, subjective scores and unfinished-work descriptions.

# Elsewhere / BondMoran: complete handover

*Last updated 12 Nov 2026, about 23:40 UTC. This is the single source of truth for whoever continues the work (for example ChatGPT). Read all of it before changing anything. It covers what the product is, how to reach it, how the code is laid out, how to deploy, how every system works, the exact current state (including the AI and the first real quality results), how to fix and change things, a troubleshooting guide, the owner's rules, and a plan for the next 72 hours.*

**No secrets are in this document.** Passwords, API keys and database URLs are held by the owner, Louie Bond, or stored in Railway. Never print, paste or commit them.

---

> **13 Nov implementation update, pending deployment:** The repository now contains the evidence-based scoring framework and explicit job-checklist approval. The live state and old interview-scoring descriptions below describe the previous deployed version. Read `docs/SCORING-FRAMEWORK.md` for the new behaviour, verification and rollout requirements. Existing live jobs will require checklist approval after deployment; they are not automatically approved by the migration.

## 0. Status in one minute

- **Live site:** https://web-production-edd7e.up.railway.app (demo password screen first; Louie has the password).
- **Code:** GitHub `louiebond1/elsewhere-bm`, branch **`simple-hiring`**. Live web and worker run commit **`1637f11`** (web) and **`e58f6b6`** (worker) or later; the commits after these only change this file.
- **The real AI works on the live site,** since 12 Nov 23:17 UTC. Before that it had never worked:
  - first the API key was rejected ("auth");
  - then every reply was cut off ("unknown");
  - both are fixed (see §6.1).
- **Spend this month:** $0.49 of the $5 cap.
- **First real quality result (36 made-up people, one made-up job, live AI):**
  - **Order matches ours: 97/100.** 10 of our top 10 are in the AI's top 10.
  - **Same rating twice: pass.**
  - **Fair: pass.**
  - **Close to our rating: fail.** The AI's scale is stricter: our 99 is its 79.
  - Details are in §6.2.
- **Next most important job:** calibrate the AI's scoring scale so its numbers match ours, fix "Nothing shared" scoring 13, and never mix basic and AI interviews in one ranking. See the 72-hour plan in §10.

---

## 1. What Elsewhere is

**BondMoran** is a recruitment partnership. **Elsewhere** is the software behind it: a working prototype with fictional demo data plus a few real test accounts.

- **Candidates** build a **mini-me**, a profile of what they've told it about their work. They do this by talking to their own **ChatGPT or Claude** through the Elsewhere connector, or to the built-in chat if they have neither.
- **Everyone is visible from sign-up.** The more they add, the better they match. BondMoran does **not** screen each person by hand; the system must work for about 10,000 people.
- **Every eligible candidate's mini-me is interviewed for every live job.** The AI answers 11 or more interview and screening questions **as the candidate**, using **only** what's in their mini-me, and scores each answer. Candidates have **24 hours** to fill gaps or change answers, and the interview updates.
- **Clients (hiring managers)**:
  - post jobs;
  - see everyone ranked by their interview;
  - open any interview question by question;
  - can **dispute any score**;
  - can **teach their taste**;
  - pay in **credits** (simulated; no real payments).
- **BondMoran (consultants)** manage clients and credits, see screening requests, and run the **interview quality check**.

**Product feel the owner wants:** premium, upbeat, consumer-style, not an "AI dashboard". **Short pages that fit one screen, plain words, visual over wordy.** The owner strongly dislikes long, wordy pages and jargon (for example he found "strong above weak" confusing).

---

## 2. How to access it

| What | Where |
|---|---|
| Live site | https://web-production-edd7e.up.railway.app |
| Demo entry (after the password screen) | `/demo/personas`: three doors, **BondMoran**, **Candidate**, **Client** |
| Candidate picker | `/demo/candidates`: real test accounts (Louie Bond; Sam Okafor, fictional) and **Add new** |
| Client picker | `/demo/clients`: **New blank client** (10 credits) and clients made before |
| All fictional demo accounts, scenarios, demo reset | `/demo/tools` (**never press Reset demo**: it wipes real test accounts too) |
| Interview quality check (BondMoran only) | BondMoran door → **Interview quality** (`/consultant/quality`) |
| AI usage, failures and spend (BondMoran only) | BondMoran door → **Operations** (`/consultant/operations`) |
| Connector address for ChatGPT / Claude | `https://web-production-edd7e.up.railway.app/mcp` (OAuth; leave Client ID and Secret empty) |
| Health check | `/api/health` returns `{"status":"ok"}` |

- **Demo password:** every page is behind a demo password screen. **Louie has the password.** It's stored in Railway as `DEMO_ACCESS_PASSWORD`. Never write it down anywhere.
- **Switching accounts:** after the password screen, pick a door; one tap signs you in. The "Demo" button in the top bar comes back here.
- **Accounts that matter:**
  - **Louie Bond:** the owner's own candidate account.
    - His real ChatGPT is connected to it.
    - It was fully reset on 12 Nov for filming.
    - At 13:50 UTC on 12 Nov his ChatGPT saved 2 items **from its own memory** ("Founder's Associate at Fabled Labs, starting 17 Nov"; "Reports directly to the founder, team size not confirmed"). Louie planned to remove them with the **Remove** button on his Mini-me page. Check before filming.
  - **Sam Okafor:** a fictional filming account (assistant accountant, fictional CV). Its login is in `trailer-handover/LOGIN-sam-okafor.txt`, which is local only and not in git.
  - **Alex Morgan:** BondMoran consultant (fictional). The "BondMoran" door signs in as Alex.
  - **Emma (Alder):** a fictional seeded hiring manager.

---

## 3. Code, hosting and deploying

### Code
- **GitHub:** `louiebond1/elsewhere-bm` (GitHub says it moved to `louiebond1/Elsewhere-bm`; both work). **Not** `dobble-app`.
- **Branch:** `simple-hiring`. All recent work is here; push only to this branch.
- **Stack:** Next.js 16 (App Router), React 19, Tailwind 4, Drizzle ORM, PostgreSQL, zod 4, Anthropic SDK 1.6, Vitest, Playwright. Node 22 or later.

### Hosting (Railway)
- **Project:** `d20fc94b-fd65-4311-8c7f-54531b2a89e0`.
- **web service** `69918a99-4d46-4d95-a9af-ebfa64148997`:
  - runs the site;
  - its **pre-deploy step runs database migrations** (`npm run db:migrate`);
  - has a health check on `/api/health`;
  - config is in `railway.web.json`.
- **worker service** `bc89e373-1f20-49c0-8a86-bea8ff41f1c7`:
  - runs background jobs (`npm run worker`): interviews, AI jobs, emails, the quality check;
  - every 10 minutes it sweeps live jobs so everyone eligible gets interviewed;
  - config is in `railway.worker.json`.
- **Environment variable names** (values are in Railway; never print them): `AI_PROVIDER` (`live` turns on the real AI), `ANTHROPIC_API_KEY` (**must be set on both web and worker**), `APP_MODE`, `APP_URL`, `DATABASE_URL`, `DEMO_ACCESS_PASSWORD`, `DEMO_LOGIN_PASSWORD`, `LOG_LEVEL`, `NODE_ENV`, `PORT`, `PUBLIC_REF_SECRET`, `S3_*` (file storage), `SESSION_PEPPER`, `STORAGE_DRIVER`.
  - Optional: `AI_CHEAP_MODEL`, `AI_REVIEW_MODEL` (override the models) and `AI_MONTHLY_BUDGET_USD` (can only lower the cap).
- **Changing a variable** in Railway (for example a new API key) makes Railway restart that service. Values show as "redacted" after saving; that's normal.

### How to deploy (important)
1. Run the checks locally, and only commit if they pass. Chain the commands with `&&`, never `;` (once a broken commit got pushed because of `;`):
   ```
   npx tsc --noEmit -p . && npx eslint . && npx vitest run && git commit … && git push origin simple-hiring
   ```
2. **Deploy the web service pinned to the exact commit SHA.** In the Railway dashboard, or with the Railway tools, "connect service source": repo `louiebond1/elsewhere-bm`, branch `simple-hiring`, the commit SHA. The web pre-deploy applies any new migration.
3. **If the change includes a database migration, deploy the worker only after the web deploy shows SUCCESS.** Otherwise deploy both together.
4. Check: both deployments show SUCCESS; `/api/health` is ok; and if the AI was involved, **Operations** shows recent successful AI calls.

Other rules:
- **Never redeploy or restart the old snapshot `7e25bf9b`.**
- Railway's edge sometimes answers "rate limited" (HTTP 429) for a few minutes. Wait and retry.

### Run locally
```
npm install
# PostgreSQL running locally; copy .env.example to .env and fill in local values
npm run db:migrate && npm run db:seed
npm run build && npm run start      # site on :3000
npm run worker                      # background jobs (second terminal)
```
- **Tests:**
  - `npm run typecheck`
  - `npm run lint`: 7 old warnings, 0 errors
  - `npx vitest run`: **192 automated tests, all passing**
  - `npx playwright test --trace off`: **24 browser tests, all passing**; needs the site and worker running.
- **Local mode has no AI key.** AI features use fixture responses and interviews use the **basic** (no-AI) version. Local quality-check results are meaningless; only live results count.
- **Gotcha:** the local PostgreSQL in some sandboxes stops by itself (`ECONNREFUSED 5432`). Start it again.

---

## 4. Where things are in the code

| Area | Files |
|---|---|
| Pages | `app/candidate/(app)/…`, `app/client/…`, `app/consultant/…`, `app/demo/…` |
| API | `app/api/[...slug]/route.ts` (auth, demo) and `src/server/api-routes.ts` (all other routes) |
| Database schema / migrations | `src/server/db/schema.ts`, `src/server/db/migrations/` (create with `npx drizzle-kit generate --name …`; latest is 0017) |
| Settings, prices, AI limits | `src/config/prototype.ts` (including `aiPricesUsdPerMTok`, `aiCheapModel`, `aiDailyTokenLimit`, `aiMonthlyBudgetUsd`) |
| ChatGPT / Claude connector | `src/server/connectors/mcp.ts` (tools, instructions, account line), `src/server/connectors/oauth.ts` (sign-in) |
| Mini-me | `src/config/onboarding.ts` (50 guide questions), `src/server/services/onboarding.ts`, `src/server/services/mini-me.ts`, `src/server/services/mini-me-chat.ts` |
| Matching and eligibility | `src/server/lib/matching-rules.ts`, `src/server/services/matching.ts`, `src/server/policies/privacy.ts` |
| **Interviews** | `src/server/services/simulation.ts`: `interviewQuestions`, `runInterview` (AI and basic), `demoSimulation` (basic), `scoreCardFor`, `interviewTouched` (re-runs), `simulationTargets`, `requestSimulations`, `storeSimulation` |
| **AI scoring instructions** | `src/server/ai/prompts/index.ts` → `SIMULATION_SYSTEM`; `PROMPT_VERSION` is at the top of the same file |
| AI calls, limits, budget | `src/server/ai/providers/anthropic.ts` (`MAX_TOKENS`, error mapping and logging), `src/server/ai/index.ts` (`runAi`, daily limit, `EST_OUTPUT`), `src/server/ai/spend.ts` (monthly cap), `src/server/ai/schemas/index.ts` (output shapes) |
| Interview views | `src/components/client-interview.tsx` (client), `src/components/interview-feedback.tsx` (candidate), `src/components/clamp-text.tsx` |
| Ranking for clients | `src/server/views/client.ts` → `bestPeople` |
| Disputes and "teach it your taste" | `src/server/services/scoring-feedback.ts`, `src/components/taste-picker.tsx`, `app/client/settings/page.tsx` |
| **Quality check** | `src/server/eval/interview-set.ts` (the job and 36 people with our ratings), `src/server/eval/quality.ts` (plan, runner, report, `THRESHOLDS`), `src/components/quality-view.tsx`, `app/consultant/quality/page.tsx` |
| Background worker | `src/server/worker.ts` (loop and 10-minute sweep), `src/server/services/worker-handlers.ts` |
| Operations page | `app/consultant/operations/page.tsx` (AI usage, failures by error code, last success, spend) |
| Tests | `tests/unit`, `tests/integration`, `tests/e2e` |

---

## 5. How each system works

### 5.1 Sign-up and visibility
- **Sign-up** (`/candidate/start`) asks only for name, email, password and one tick. The account is **active and visible at once**, with an empty anonymous profile.
- **Job preferences** are "not set" until the person or their AI gives real ones.
- **Employer:** with no current employer given, the person is still visible, with a warning.
- **Full reset:** in the candidate's Privacy page. It clears the mini-me, chats, CV, examples, interviews, matches and preferences. It keeps the login, the name, the connected AI and blocked employers.

### 5.2 The mini-me and the connector
- **Storage:** answers are stored in `onboarding_answers`, as 50 checklist keys plus free "extra" items. No drafts: AI saves go straight into the profile. The AI never overwrites what the person wrote themselves.
- **Connector tools:**
  - `get_my_profile`, `get_my_onboarding_checklist`, `next_mini_me_questions`
  - `remember_for_my_mini_me`, `save_onboarding_answers`, `add_to_my_mini_me`
  - `get_my_cv`, `update_my_job_preferences`, `review_my_recent_interviews`
  - `get_my_unanswered_questions`, `save_draft_answer`
- **Memory-first (owner's choice):** ChatGPT may fill in answers from what it remembers.
- **Transparency rule:** after saving anything from memory, ChatGPT must say plainly what it saved, that it came from its memory, and that the person can remove it on the Mini-me page. It must never call something it just saved "already saved".
- **Every connector reply** starts `Account: {name}. Saved so far: N`. Every save starts `Saved just now: …`.
- **The linked account is whoever is signed in to Elsewhere when "Allow" is pressed.** To relink, disconnect and connect again while signed in as the right account.
- **ChatGPT caches the tool list.** After a connector change, use **refresh** on the Elsewhere connector in ChatGPT. Don't disconnect.
- **Built-in chat:** `/candidate/onboarding/chat`.
- **Mini-me page refresh:** every 15 seconds while visible, and as soon as its tab is shown again.

### 5.3 Who gets interviewed (hard rules only)
- **Location:** where they can work. A hard rule.
- **Age:** if a job requires 18 or over, people who said they're under 18 are ruled out. People who haven't said are still interviewed, marked "Age requirement to confirm". Age is private.
- **Type of job:** rules someone out only if they ticked it as a must.
- **Salary:** **never** rules anyone out.
- **Live jobs:** clients can only **add a must-have** (currently "18+"), with no re-interviews. An "Edit role" button still exists; whether to remove it for live jobs is an open decision.

### 5.4 The interview
- **Questions:**
  - up to 5 from the job's criteria;
  - 1 about the main goal;
  - general behaviour questions to make 7;
  - 4 screening questions (notice, salary, location / work mode, right to work).
- **AI interview:**
  - Claude (`claude-haiku-5-5`) answers as the candidate, **only from their mini-me**, and writes "I haven't shared an example of this yet" rather than inventing.
  - It scores **every question 0–10 with a reason**, and gives an overall **fit score out of 100**.
  - Questions answered word for word from the person's own mini-me ("fixed answers") keep their words: the AI returns an empty answer for those and only scores them.
- **Reply cap:** 4,000 output tokens (`MAX_TOKENS.simulate`). It was 1,200, which cut every reply off.
- **Basic interview:** the no-AI fallback, used if the AI fails or the budget runs out. It matches keywords; it's crude, never scores above 60, and is labelled "Basic interview".
- **Score card:** each interview stores the factors behind its score and its gaps.
- **When interviews run:**
  - when a job goes live;
  - when someone becomes eligible or signs up;
  - when a mini-me change touches the score card (within 24 hours);
  - when a human corrects a score (the whole job is re-scored);
  - plus a 10-minute worker sweep that catches anything missed.
- **Candidates** see their interviews one question at a time with **no score**, and have 24 hours to change answers.
- **Clients** see everyone ranked, and each interview one question at a time: coloured question buttons, answers folded to three lines, a score bar and a reason.

### 5.5 Human corrections and "teach it your taste"
- **Disputes:** "Disagree with this score?" on every question, for the client or BondMoran. They pick the right score and say why. It's shown on that answer, becomes guidance the AI must follow for that job, and **everyone for the job is re-scored**.
- **Taste:** Client → Settings → "Teach it your taste" (optional). Pick the better of two real anonymous answers; it becomes guidance for all their live jobs.

### 5.6 The interview quality check (internal; BondMoran only)
- **The test:** one made-up job (**Assistant Accountant**: reconciliations, clear reporting, process improvement) and **36 made-up people**. Each has **our rating out of 100**, spread from 99 to 2. **The ratings were set by the developer, not a recruiter.**
- **A run is 100 interviews through the real app code with the live AI:**
  - each of the 36 twice (72), to test that the rating repeats;
  - 4 people across the range × 6 one-change versions (24): age 58, caring break, moved from Nigeria, dyslexia, husband, wife;
  - 4 strong people with half their profile (4).
- **Running it:** BondMoran → Interview quality → **Run quality check**. It runs in chunks of 10, takes about 15 minutes, and the page updates itself. Only one run at a time.
- **Cost:** about $0.10 per run at the app's configured prices (not checked against Anthropic's real price list).
- **The page:**
  - opens on **"Order: AI vs ours"**: the AI's ranking 1–36, each person's place in our order and how many places apart, plus **top-10 match** and **how alike the orders are** (0–100, rank correlation);
  - the second view, **"Ratings out of 100"**, shows our rating (a ring) and the AI's (a dot) per person.
- **Pass rules** (`THRESHOLDS` in `src/server/eval/quality.ts`):
  - **Same order:** at least 90/100 and at least 8 of the top 10;
  - **Close:** within 15 points for 80% of people;
  - **Same twice:** within 10 points for 90%;
  - **Fair:** no change moves more than 10;
  - any basic interview makes the run not count.
- The report is recalculated from the stored results each time the page loads, so changing the rules re-judges old runs. Runs of an older test set are ignored.

### 5.7 Credits and clients
- **Credits are simulated.** A new blank client gets 10.
- **BondMoran adds credits** on a client's page ("Add demo credits"), and reverses a grant to take credits back.
- Pricing constants are in `src/config/prototype.ts`.

### 5.8 AI budget and limits
- **Monthly cap:** $5 (`aiMonthlyBudgetUsd`). A call that could exceed it is refused before sending. Failed calls count at their worst case.
- **Daily limit:** 2,000,000 tokens (`aiDailyTokenLimit`).
- **Configured prices** (`aiPricesUsdPerMTok`): Haiku 0.10 / 0.50, Sonnet 2.00 / 10.00 USD per million tokens. **Not checked against Anthropic's price list.**
- **Spend so far** (12 Nov 23:35 UTC): **$0.49**. 439 AI calls today: 100 succeeded, and 339 failed earlier (238 "auth", 99 "unknown", 2 "schema_contract") before the fixes.

---

## 6. Current state of the AI (in detail)

### 6.1 What went wrong and what fixed it (12 Nov)
1. **"auth" (22:08–22:33 UTC, 238 calls):** Anthropic rejected `ANTHROPIC_API_KEY`. Operations showed "Last successful AI call: never", so **the real AI had never worked live**. Every interview, mini-me chat reply and AI feature had silently used the fallback.
   - **Fix:** Louie put a new key in Railway; both services restarted.
2. **"unknown" (22:57–23:09 UTC, 99 calls):** the new key worked, but every interview reply was **cut off mid-JSON** ("Unterminated string in JSON", "Unexpected end of JSON input"). The 1,200-token cap was too short for 11+ answers, each with a score and a reason.
   - **Fix (commit `e58f6b6`):**
     - the cap was raised to 4,000 (`MAX_TOKENS.simulate` in `anthropic.ts`; daily estimate `EST_OUTPUT.simulate` 3,000 in `ai/index.ts`);
     - the AI no longer repeats fixed answers.
3. **Since 23:17 UTC every interview has succeeded.** The last successful call was 23:31 UTC.

To make failures findable:
- **Operations** lists failures by task and error code with times, and "Last successful AI call" (commit `cd0bea8`).
- The worker log shows the real error text for "unknown" and provider errors, as lines starting `[ai]` (commit `aeab364`). Read them in the Railway dashboard → worker → Logs.

### 6.2 First real quality result (live AI, 12 Nov, run finished about 23:31 UTC)
- **Same order as ours: PASS.** **10 of our top 10** are in the AI's top 10, and the orders are **97/100 alike**. Its #1 and #2 match ours; most people are within 1–2 places.
- **Same rating twice: PASS.** Only 1 of 36 moved more than 10 points between its two interviews.
- **Fair: PASS.** Age 58, a caring break, moved from Nigeria, dyslexia, and husband vs wife moved no rating by more than 10.
- **Close to our rating: FAIL** (on average 18 points apart). **Same order, stricter scale:** the AI uses about 5–80 where we used 2–99.
- **Overall verdict on the page:** "Not good enough yet", only because of "close".

**Every person, our rating → the AI's rating** (average of its two interviews):

| Our rating → AI | Person (note) |
|---|---|
| 99 → 79 | Owns reconciliations and the close, reports to the FD, automated the bank import |
| 97 → 72 | Runs the close and reconciliations, writes the board pack |
| 95 → 70 | Strong but brief: short, specific answers |
| 93 → 70 | Owns reconciliations and close, fixed a duplicate-payment problem |
| 90 → 55 | Intercompany reconciliations and the monthly board report |
| 88 → 62 | Career changer with clear reconciliation evidence |
| 85 → 55 | Strong reconciliations, some reporting, no improvements yet |
| 82 → 50 | Weekly reconciliations with a measured result |
| 78 → 45 | Month-end support with some ownership |
| 75 → 44 | Strong reporting and analysis, lighter on reconciliations |
| 72 → 40 | Bookkeeper for a small business |
| 68 → 39 | Purchase ledger clerk who reconciles supplier statements |
| 65 → 39 | Payroll administrator who reconciles payroll |
| 62 → 44 | Audit trainee (tested reconciliations, not owned) |
| 58 → 33 | Finance administrator, occasional reconciliations |
| 55 → 25 | Credit controller who allocates cash |
| 52 → 28 | Reporting analyst with no accounting |
| 48 → 38 | Accountancy student with a placement |
| 45 → 30 | Data entry at month-end |
| 42 → 22 | Bank cashier who balances the tills |
| 38 → 20 | Sales operations admin with spreadsheets |
| 35 → 13 | Wordy and general, no specifics |
| 32 → 15 | Shop manager who cashes up |
| 28 → 19 | Office manager who pays invoices |
| 25 → 18 | Economics graduate, no experience |
| 22 → 12 | Bank customer service |
| 18 → 14 | Warehouse supervisor |
| 15 → 8 | Receptionist |
| 12 → 8 | Sales rep who dislikes admin |
| 10 → 5 | Chef |
| 8 → 5 | Graphic designer |
| 6 → 7 | Student, nothing else shared |
| 4 → 8 | Wordy but nothing relevant |
| 3 → 5 | Laboratory technician |
| 2 → 5 | Says they don't like numbers |
| **2 → 13** | **Nothing shared ("Looking for work.")**: the AI scored an empty profile too high (9 places off) |

**Biggest place differences:**
- "Nothing shared": 9 places too high;
- "Chef" and "Wordy and general": 5 places too low;
- "Audit trainee": 4 places too high;
- "Graphic designer": 4 places.

**Caveats:**
- The ratings it's compared against are the developer's opinion, for **one** job. A recruiter should review them, and a second job should be added (see §10).
- **Thin profiles** (half a strong profile) are reported on the page but not judged yet.

---

## 7. How to fix and change things (exact steps)

**Make the AI's scores match our scale (the "close" failure):**
- **Recommended:** add a clear scoring scale to `SIMULATION_SYSTEM` in `src/server/ai/prompts/index.ts`. For example:
  - 90–100: would hire now, specific evidence with results on every main requirement;
  - 70–89: strong, specific evidence on most requirements;
  - 50–69: relevant but partial or vague evidence;
  - 20–49: some related experience;
  - 1–19: little relevant;
  - 0–5: nothing relevant or nothing shared.
- **Then:**
  1. bump `PROMPT_VERSION` (top of the same file; currently `'prompts-v1'`);
  2. deploy the worker (and web);
  3. run the quality check;
  4. aim for "close" to pass while "same order" stays at 90 or more.
- **Not recommended:** stretching the numbers after the fact (for example multiplying by 1.25). It hides the problem and breaks at the edges.

**"Nothing shared" scoring 13:**
- Same prompt: "If the examples contain nothing about work experience, the overall score is 0–5."
- Optionally in code, in `runInterview` (`src/server/services/simulation.ts`): if no example is relevant to any criterion, cap `fitScore` at 5.
- Re-check in the quality run (it should land at joint last).

**Never mix AI and basic scores in one ranking:**
- In `bestPeople` (`src/server/views/client.ts`), rank only interviews with `provider === 'anthropic'` when the live AI is on.
- List basic ones separately as "Interview pending" (and keep re-requesting them).
- Add a test in `tests/integration/interview-rules.test.ts`.

**Change who gets interviewed:** `eligibilityFor` in `src/server/lib/matching-rules.ts`, plus its tests in `tests/unit/matching-rules.test.ts`.

**Change the interview questions:** `interviewQuestions`, `GENERAL` and `SCREENING` in `src/server/services/simulation.ts`.

**Change the quality test people or ratings:** `src/server/eval/interview-set.ts`.
- Each person is `p(id, expectedRating, note, items)`.
- To add a second job, add another entry to `EVAL_JOBS`. The page shows job tabs automatically.
- Keep `BIAS_SAMPLE` and `THIN_SAMPLE` ids valid.
- Update the test in `tests/integration/quality-check.test.ts`, which checks the counts.

**Change the pass rules:** `THRESHOLDS` in `src/server/eval/quality.ts`.

**Change AI limits:**
- reply caps: `MAX_TOKENS` (`anthropic.ts`) and `EST_OUTPUT` (`ai/index.ts`);
- daily limit: `aiDailyTokenLimit`;
- monthly cap: `aiMonthlyBudgetUsd` (both in `src/config/prototype.ts`; **ask Louie before raising money limits**).

**Change the model:** `aiCheapModel` in `src/config/prototype.ts`, or `AI_CHEAP_MODEL` in Railway. The model must have a price in `aiPricesUsdPerMTok`, or live mode refuses it.

**Change connector wording:** `src/server/connectors/mcp.ts` (`INSTRUCTIONS`, `CHECKLIST_HOW`, `MEMORY_FIRST`, `TRANSPARENCY_RULE`, tool descriptions). Users must refresh the connector in ChatGPT after tool-description changes.

**Database change:** edit `src/server/db/schema.ts`, run `npx drizzle-kit generate --name <what>`, and commit the new SQL and snapshot. The web pre-deploy applies it; deploy the worker after the web.

---

## 8. Troubleshooting guide

| Symptom | Where to look | Fix |
|---|---|---|
| Interviews say "Basic interview" / quality run "doesn't count" | Operations → failures by error code, "Last successful AI call" | See the rows below |
| Error "auth" | — | `ANTHROPIC_API_KEY` wrong or inactive on web/worker. Louie updates it in Railway (and checks the Anthropic console for credit and model access). Services restart. |
| Error "unknown" | Railway → worker → Logs, lines starting `[ai]` | The real message is logged. "Unterminated string" or "Unexpected end of JSON" means the reply was cut off: raise `MAX_TOKENS` for that task. |
| Error "schema_contract" | Logs | The reply didn't match the expected shape; check `src/server/ai/schemas/index.ts` against the prompt. A few are normal; many are not. |
| Error "monthly_budget" / "daily_budget" | Operations → spend | The cap was reached; ask Louie. |
| Error "model_unavailable" | — | Model name wrong or not on the account. |
| Error "rate_limited" / "timeout" / "network" | — | Temporary; retried automatically. |
| Quality "Run" button missing | — | A run is already in progress; wait. Only one at a time. |
| Live site 429 "rate limited" from `railway-hikari` | — | Railway's edge; wait a few minutes. |
| ChatGPT says tools missing or old | — | Refresh the connector in ChatGPT. |
| ChatGPT reads the wrong account | First line of any tool reply (`Account: …`) | Disconnect, sign in to Elsewhere as the right person, connect again. |
| Local tests: `ECONNREFUSED 5432` | — | Local Postgres stopped; start it again. |

---

## 9. The owner's rules (follow these)

- **Never** print, paste, commit or share passwords, keys, tokens or database URLs.
- **Keep the demo password screen.** Never disable authentication.
- **No live data wipes** (demo reset, Full reset on someone's account) **without Louie's explicit OK.** Don't disconnect or re-authorise his ChatGPT without his OK.
- **No real payments, no real emails, no Sentry DSN.** Real AI only within the budget cap; **ask before raising money limits.**
- **Don't guess.** Say "I don't know" and find out. Louie will say when he wants a guess.
- **Pages:** short, one screen where possible, plain words, visual not wordy, no jargon. Long answers fold to three lines with "Read full answer".
- **Pushing to `simple-hiring` is fine; ask before deploying** anything that changes behaviour for real users. Testing deploys during this phase have been approved.
- **Before pushing:** typecheck, lint and tests, chained with `&&`.
- **Commit messages** describe what changed and why. Never put AI model names in commits or code comments.

---

## 10. Plan for the next 72 hours

Each step says what "done" means. Do them in order.

### Day 1 (0–24 hours): make the scores right and the ranking honest
1. **Calibrate the AI's scale** (§7, first item).
   - **Done when:** a new quality run shows "Close to our rating" passing (≥80% within 15 points) **and** "Same order" still ≥90/100 with ≥8 of the top 10. Record the numbers in §6.2.
2. **Fix "Nothing shared"** (§7). **Done when:** it ranks joint last in the run.
3. **Never mix AI and basic interviews in the client ranking** (§7). **Done when:** a test proves basic interviews aren't ranked, and the client page shows them as "Interview pending".
4. **Re-run any basic interviews on live jobs.** Interviews stored as basic while the AI was broken stay basic until something changes, so make `simulationTargets` (`src/server/services/simulation.ts`) treat `provider !== 'anthropic'` as not fresh while live AI is on.
   - **Done when:** real candidates' interviews on live jobs show AI scores, not "Basic interview". Check Louie's and test clients' jobs.
5. **Update this handover** with the new results.

### Day 2 (24–48 hours): make the test trustworthy
6. **Have a human review the 36 ratings.** Send Louie (or a BondMoran recruiter) the table in §6.2 and ask them to correct "our rating" where they disagree. Edit `src/server/eval/interview-set.ts` and run again.
   - **Done when:** the ratings are signed off by a person, not the developer.
7. **Add a second job** to the test (for example "Operations Coordinator", with 24–36 people across the range). **Done when:** both jobs pass "same order" and "close".
8. **Thin profiles:** add a "Not enough to judge yet" flag when a mini-me has too little, so a strong person with a thin profile isn't ranked as weak. Show it to clients. Optionally make it a pass/fail check.
9. **Decide "Edit role" on live jobs** with Louie: remove it and keep only "Add must-have", or keep it.

### Day 3 (48–72 hours): real-use readiness
10. **Budget:**
    - Check the configured AI prices against Anthropic's current list.
    - Work out cost per interview from Operations (about $0.001 per interview at configured prices).
    - Ask Louie for a monthly cap that covers everyone getting AI interviews.
11. **Legal brief:** write a plain-English document for a UK employment and data lawyer covering how the system decides, what data it uses, where humans step in (disputes), what candidates see and can challenge, and the fairness test. **Don't give legal advice;** Louie engages the lawyer.
12. **"Teach it your taste" pairs:** check they're sensible now that AI interviews exist (before, they came from basic interviews and could be odd).
13. **Trailer filming:**
    - check Louie's Mini-me (remove the 2 memory items if he still wants a clean start);
    - make sure his ChatGPT connector is refreshed;
    - Grok's filming prompt is in `trailer-handover/GROK-PROMPT.md` (local, not in git).
14. **Run the full test suites and a final quality run;** update this file.

### Decisions only Louie can make
- the monthly AI budget;
- who reviews the test ratings;
- "Edit role" on live jobs;
- the lawyer;
- whether candidates should ever see their own scores or dispute them (today they can't, by design).

---

## 11. Recent history (newest first)
- `52ad914` Handover: AI works live; first real quality result.
- `1637f11` Fix: quality page variable order (the commit before it, `5be326c`, didn't typecheck and was never deployed).
- `5be326c` Quality page: AI's order of all 36 vs ours, top-10 match and order score.
- `e58f6b6` **AI interviews: replies were cut off; cap 1,200 → 4,000; fixed answers not repeated.**
- `aeab364` Log the real AI error text.
- `cd0bea8` Operations: failures by error code and last successful call.
- `1588195` Quality check: one made-up job, 36 people rated 2–99.
- `f91ac5b` Our rating vs the AI's.
- `dd6ea45` Short visual quality page.
- `d6f33a9` Disputes and "Teach it your taste".
- `c28fb3b` Interview quality check (first version).
- `98cf897` Worker sweep every 10 minutes.
- `2040a9a`, `56b1b93` Interview view: one question at a time, folded answers.
- `2e24935` Everyone eligible interviewed for every live job; hard rules; score card; smart re-runs; ranking.
- `c756e9c` Connector: memory-first plus transparency rule; account line.
- `cf37619` Mini-me feeds matching; visible from sign-up; three-door demo entry; Full reset.

`trailer-handover/` (local only, not in git) holds the trailer footage, screenshots, brand assets, the Grok filming prompt and the Sam Okafor login.
