# Elsewhere / BondMoran: complete handover

*Written 12 November 2026 for whoever continues the work (for example ChatGPT). Read this first. It covers what the product is, how to reach it, how the code is laid out, how to deploy, what every major system does, the rules the owner has set, and what's still open.*

**No secrets are in this document.** Passwords, API keys and database URLs are held by the owner (Louie Bond) or stored in Railway. Never print, paste or commit them.

---

## 1. What Elsewhere is

**BondMoran** is a recruitment partnership. **Elsewhere** is the software behind it. It's a working prototype that uses fictional demo data, plus a few real test accounts.

- **Candidates** build a **mini-me**: a profile made of what they've told it about their work. They build it by talking to their own **ChatGPT or Claude** through the Elsewhere connector, or to the built-in chat if they have neither.
- **Everyone is visible from sign-up.** The more they add, the better they match. BondMoran doesn't screen each person by hand; the system has to work for about 10,000 people.
- **Every eligible candidate's mini-me is interviewed for every live job.** The AI answers 11 or more interview and screening questions *as the candidate*, using only what's in their mini-me, and scores each answer. Candidates then have **24 hours** to fill gaps or change answers, and the interview updates.
- **Clients (hiring managers)** post jobs, see everyone ranked by their interview, open any interview question by question, and can **dispute a score**. They pay in **credits** (simulated; there are no real payments).
- **BondMoran (consultants)** manage clients and credits, see screening requests, and run the **interview quality check**.

The product feel the owner wants: **premium, upbeat, consumer-style**, not an "AI dashboard". **Short pages that fit one screen, plain words, visual over wordy.** The owner strongly dislikes long, wordy pages.

---

## 2. How to access it

| What | Where |
|---|---|
| Live site | https://web-production-edd7e.up.railway.app |
| Demo entry (after the password screen) | `/demo/personas`: three doors, **BondMoran**, **Candidate**, **Client** |
| Candidate picker | `/demo/candidates`: real test accounts (Louie Bond; Sam Okafor, fictional) and **Add new** |
| Client picker | `/demo/clients`: **New blank client** (10 credits) and clients made before |
| All fictional demo accounts, scenarios, demo reset | `/demo/tools` (**do not press Reset demo**: it wipes real test accounts too) |
| Connector address for ChatGPT / Claude | `https://web-production-edd7e.up.railway.app/mcp` (OAuth; leave Client ID and Secret empty) |
| Health check | `/api/health` returns `{"status":"ok"}` |

- **Demo password:** every page sits behind a demo access password screen. **Louie has the password.** It's stored in Railway as `DEMO_ACCESS_PASSWORD`. Don't write it anywhere.
- **Switching accounts:** after the password screen, pick a door. One tap signs you in as that account. The "Demo" button in the top bar comes back here.
- **Accounts that matter:**
  - **Louie Bond:** the owner's own candidate account. His real ChatGPT is connected to it. It was fully reset on 10 Nov for filming.
  - **Sam Okafor:** a fictional filming account (assistant accountant, fictional CV). Its login is in `trailer-handover/LOGIN-sam-okafor.txt`, which is kept out of git.
  - **Alex Morgan:** BondMoran consultant (fictional). The "BondMoran" door signs in as Alex.
  - **Emma (Alder):** a fictional seeded hiring manager.

---

## 3. Code, hosting and deploying

### Code
- **GitHub:** `louiebond1/elsewhere-bm` (GitHub says it moved to `louiebond1/Elsewhere-bm`; both work). **Not** `dobble-app`.
- **Branch:** `simple-hiring`. All recent work is here.
- **Latest commit at writing:** `1588195` (see `git log`).
- **Stack:** Next.js 16 (App Router), React 19, Tailwind 4, Drizzle ORM, PostgreSQL, zod 4, Vitest, Playwright. Node 22 or later.

### Hosting (Railway)
- **Project:** `d20fc94b-fd65-4311-8c7f-54531b2a89e0`.
- **web service** `69918a99-4d46-4d95-a9af-ebfa64148997`: runs the site.
  - Its **pre-deploy step runs database migrations** (`npm run db:migrate`).
  - It has a health check on `/api/health`.
  - Config is in `railway.web.json`.
- **worker service** `bc89e373-1f20-49c0-8a86-bea8ff41f1c7`: runs background jobs (`npm run worker`).
  - It runs interviews, AI jobs, emails and the quality check.
  - Every 10 minutes it sweeps live jobs so everyone eligible gets interviewed.
  - Config is in `railway.worker.json`.
- **Environment variable names** (values are in Railway; never print them): `AI_PROVIDER`, `ANTHROPIC_API_KEY`, `APP_MODE`, `APP_URL`, `DATABASE_URL`, `DEMO_ACCESS_PASSWORD`, `DEMO_LOGIN_PASSWORD`, `LOG_LEVEL`, `NODE_ENV`, `PORT`, `PUBLIC_REF_SECRET`, `S3_*` (file storage), `SESSION_PEPPER`, `STORAGE_DRIVER`.

### How we deploy (important)
1. Commit and push to `simple-hiring`.
2. **Deploy the web service pinned to the exact commit.** In Railway this is "connect service source" with the repo, the branch and the **commit SHA**. The web pre-deploy applies any new migration.
3. **If the change includes a migration, deploy the worker only after the web deploy succeeds**, so the worker never runs against an old database. Otherwise deploy both together.
4. Check that the deployment shows SUCCESS and that `/api/health` is ok.

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
  - `npm run lint`
  - `npx vitest run`: **191 automated tests, all passing at writing**
  - `npx playwright test --trace off`: **24 browser tests, all passing**; needs the site and worker running locally.
- **Local mode has no AI key.** AI features use "fixture" (demo) responses, and interviews use the **basic** (no-AI) version.
- **Gotcha:** the local PostgreSQL in some sandboxes stops by itself. If anything fails with `ECONNREFUSED 5432`, start it again.

---

## 4. Where things are in the code

| Area | Files |
|---|---|
| Pages | `app/candidate/(app)/…`, `app/client/…`, `app/consultant/…`, `app/demo/…` |
| One API for everything | `app/api/[...slug]/route.ts` (auth, demo) and `src/server/api-routes.ts` (all other routes) |
| Database schema / migrations | `src/server/db/schema.ts`, `src/server/db/migrations/` (generate with `npx drizzle-kit generate --name …`) |
| Settings, prices, AI limits | `src/config/prototype.ts` |
| ChatGPT / Claude connector | `src/server/connectors/mcp.ts` (tools and instructions), `src/server/connectors/oauth.ts` (sign-in) |
| Mini-me | `src/config/onboarding.ts` (50 guide questions), `src/server/services/onboarding.ts`, `src/server/services/mini-me.ts`, `src/server/services/mini-me-chat.ts` |
| Matching and eligibility | `src/server/lib/matching-rules.ts`, `src/server/services/matching.ts`, `src/server/policies/privacy.ts` |
| Interviews | `src/server/services/simulation.ts` (questions, AI and basic interview, score card, re-runs) |
| Interview views | `src/components/client-interview.tsx` (client), `src/components/interview-feedback.tsx` (candidate) |
| Disputes and "teach it your taste" | `src/server/services/scoring-feedback.ts`, `src/components/taste-picker.tsx`, `app/client/settings/page.tsx` |
| Quality check | `src/server/eval/interview-set.ts` (36 test people), `src/server/eval/quality.ts`, `app/consultant/quality/page.tsx` |
| AI calls, budget, prompts | `src/server/ai/index.ts` (`runAi`, budget), `src/server/ai/prompts/index.ts`, `src/server/ai/schemas/index.ts`, `src/server/ai/providers/` |
| Background worker | `src/server/worker.ts`, `src/server/services/worker-handlers.ts` |
| Tests | `tests/unit`, `tests/integration`, `tests/e2e` |

---

## 5. How each system works

### 5.1 Sign-up and visibility
- **Sign-up** (`/candidate/start`) asks only for name, email, password and one tick. The account is **active and visible at once**, with an empty anonymous profile.
- **Job preferences** are "not set" until the person or their AI gives real ones.
- **Employer:** if no current employer is given, the person is still visible, with a warning ("we can't hide you from your employer until you tell us who it is").
- **Full reset:** in the candidate's Privacy page. It clears the mini-me, chats, CV, examples, interviews, matches and preferences. It keeps the login, the name, the connected AI and blocked employers.

### 5.2 The mini-me and the connector
- **Storage:** answers are stored in `onboarding_answers`, as 50 checklist keys plus free "extra" items. **There are no drafts:** AI saves go straight into the profile. The AI never overwrites what the person wrote themselves.
- **Connector tools:**
  - `get_my_profile`, `get_my_onboarding_checklist`, `next_mini_me_questions`
  - `remember_for_my_mini_me`, `save_onboarding_answers`, `add_to_my_mini_me`
  - `get_my_cv`, `update_my_job_preferences`, `review_my_recent_interviews`
  - `get_my_unanswered_questions`, `save_draft_answer`
- **Memory-first (owner's choice):** ChatGPT may fill in answers from what it remembers about the person.
- **Transparency rule:** after saving anything from memory, ChatGPT must say plainly what it saved, that it came from its memory, and that the person can remove it on the Mini-me page. It must never call something it just saved "already saved".
- **Every connector reply** starts `Account: {name}. Saved so far: N`. Every save starts `Saved just now: …`.
- **The linked account is whoever is signed in to Elsewhere when "Allow" is pressed.** To link ChatGPT to a different account, disconnect it and connect again while signed in as that account.
- **ChatGPT caches the tool list.** After a connector change, use **refresh** on the Elsewhere connector in ChatGPT. Don't disconnect.
- **Built-in chat:** `/candidate/onboarding/chat`, for people without ChatGPT or Claude.
- **Mini-me page refresh:** the page updates every 15 seconds while visible, and again as soon as its tab is shown.

### 5.3 Who gets interviewed (eligibility: hard rules only)
- **Location:** where they can work. This is a hard rule (`src/server/lib/matching-rules.ts`).
- **Age:** if a job requires 18 or over, people who said they're under 18 are ruled out. People who haven't said are still interviewed, marked "Age requirement to confirm". Age is private and never shown to employers.
- **Type of job:** rules someone out **only if they ticked it as a must** ("Only these types of job").
- **Salary:** **never** rules anyone out.
- **Clients can't edit a live job's requirements;** they can only **add a must-have** (currently "18+"). That rules people in or out without re-interviewing anyone.
  - Open question: an "Edit role" button still exists. Should it be removed for live jobs?

### 5.4 The interview
- **Questions:**
  - up to 5 from the job's criteria;
  - 1 about the job's main goal;
  - general behaviour questions to make 7;
  - 4 screening questions (notice, salary, location / work mode, right to work).
- **AI interview:** Claude (`claude-haiku-5-5` by default) answers as the candidate, **using only their mini-me**. It writes "I haven't shared an example of this yet" rather than inventing. It scores **every question 0–10 with a one-line reason**, and gives an overall **fit score out of 100**. Answers the candidate wrote themselves are kept word for word; the AI only scores them.
- **Basic interview:** the no-AI fallback, used only when the AI budget runs out. It matches keywords; it's crude and **can't score above 60**. It's labelled "Basic interview".
- **Score card:** every interview stores what decided its score (the items it used, the skills and the checklist keys) and what was missing (the gaps).
- **When interviews run:**
  - when a job goes live;
  - when someone becomes eligible or signs up;
  - when a mini-me change touches the score card (within 24 hours);
  - when a human corrects a score (everyone for that job is re-scored).
  - The worker's 10-minute sweep catches anything missed.
- **Candidates see** their interviews at `/candidate/interviews`: questions and answers, one at a time, with **no score** (owner's choice). They have 24 hours to change answers.
- **Clients see** everyone ranked by interview, and each interview one question at a time: coloured question buttons, the answer (three lines plus "Read full answer"), a score bar and a reason.

### 5.5 Human corrections and "teach it your taste"
- **Disputes:** "Disagree with this score?" on every interview question, for the hiring manager or BondMoran. They pick the right score and say why.
  - The correction shows on that answer.
  - It becomes **written guidance** the AI must follow for that job, and **every candidate for the job is re-scored** with it.
- **Teach it your taste:** in **Client → Settings**, optional. The hiring manager is shown two real anonymous answers to the same question and picks the one that suits them better. That becomes guidance for all their live jobs.

### 5.6 The interview quality check (BondMoran → "Interview quality")
- **Internal only.** Real clients never see "our rating".
- **The test:** **one made-up job (Assistant Accountant) and 36 made-up people.** Each has **our rating out of 100**, spread from 99 down to 2. Those ratings were **set by the developer, not a recruiter**, and a human should review them. The AI interviews all 36 **through the real app code**.
- **The page shows** our rating (a ring) next to the AI's (a dot) for every person.
- **Pass means:**
  - **Close:** the AI is within 15 points of our rating for 80% of people.
  - **Same twice:** each person is interviewed twice, and 90% get scores within 10 points.
  - **Fair:** one irrelevant change (age 58, a caring break, moved from Nigeria, dyslexia, or husband vs wife) moves no score by more than 10.
- **A run** is 100 interviews, in chunks of 10, using the live AI and its budget. Start it with **"Run quality check"**. The page refreshes itself.
- **First real result (12 Nov, 23:30 UTC, live AI):**
  - **Same order as ours: pass.** 10 of our top 10 are in the AI's top 10, and the two orders are 97/100 alike. Most people are within 1–2 places.
  - **Same rating twice: pass** (1 of 36 moved).
  - **Fair: pass** (no irrelevant change moved a rating).
  - **Close to our rating: fail.** The AI uses roughly 5–80 where we used 2–99: the same order, a stricter scale.
  - **Oddity to fix:** "Nothing shared" got 13 (9 places too high).
  - **Before then:** the AI had never worked live. First the key was rejected; then replies were cut off at 1,200 tokens (fixed: cap raised to 4,000, and fixed answers aren't repeated).

### 5.7 Credits and clients
- **Credits are simulated** (no real payments). A new blank client gets 10 credits.
- **BondMoran adds credits** on a client's page ("Add demo credits"), and reverses a grant to take credits back. There's no "set balance to X" yet.
- Pricing constants are in `src/config/prototype.ts`.

### 5.8 AI budget and limits
- **Monthly cap:** **$5** (`aiMonthlyBudgetUsd`). It can be lowered with an environment variable, never raised that way.
- **Daily limit:** **2,000,000 tokens** for the whole app (`aiDailyTokenLimit`).
- **Prices in config:** Haiku 0.10 / 0.50, Sonnet 2.00 / 10.00 USD per million tokens. **These have not been checked against Anthropic's real price list.**
- When a limit is reached, AI features fall back to fixture or basic behaviour.
- **AI usage today** is shown on BondMoran → Operations.

---

## 6. The owner's rules (follow these)

- **Never** print, paste, commit or share passwords, keys, tokens or database URLs.
- **Keep the demo password screen.** Never disable authentication.
- **Don't reset or wipe live data** (no demo reset, no Full reset on someone's account) **without Louie's explicit OK**. Don't disconnect or re-authorise his ChatGPT connection without his OK.
- **No real payments, no real emails, no Sentry DSN.**
- **Real AI only within the budget cap.**
- **Don't guess.** If you don't know, say so. Louie will say when he wants a guess.
- **Pages:** short, one screen where possible, plain words, visual not wordy. Long answers fold to three lines with "Read full answer".
- **Ask before deploying** anything that changes behaviour for real users. Pushing to the branch is fine.
- **Commit messages** describe what changed and why. Never put AI model names in commits or code comments.

---

## 7. Open issues and next steps (most important first)

0. **(Fixed 12 Nov.)** The real AI had never worked on the live site.
   - **Evidence:** BondMoran → Operations shows every AI call failing with error code **"auth"** (the AI provider rejected the credentials) and "Last successful AI call: never". On 12 Nov all 238 calls failed with 0 tokens used.
   - **Consequence:** every interview, mini-me chat reply and AI feature has silently used the basic or fixture fallback. The 36-person quality run on 12 Nov was all basic interviews, so it doesn't count.
   - **Fix (owner only):**
     1. In Railway, check `ANTHROPIC_API_KEY` on **both** the web and worker services. It must be a valid, active Anthropic API key.
     2. In the Anthropic console, check the key is active, the account has credit, and it can use the configured model (`claude-haiku-5-5`, set in `src/config/prototype.ts`, overridable with `AI_CHEAP_MODEL`).
     3. "auth" covers both a rejected key (401) and a permission refusal (403); the logs don't say which.
     4. Then redeploy, check Operations shows successful calls, and press **Run quality check** again.

1. **Read the 36-person AI quality run** on BondMoran → Interview quality. If it's "Not good enough yet", look at which people are far off and why. Likely levers:
   - the scoring prompt (`SIMULATION_SYSTEM` in `src/server/ai/prompts/index.ts`);
   - a fixed scoring guide per job;
   - scoring each interview twice and averaging.
2. **Never mix AI and basic interview scores in one ranking.** Rank only people with an AI interview, and show basic ones separately as "interview pending". Not done yet.
3. **Get a human (Louie or a BondMoran recruiter) to review the 36 test ratings** in `src/server/eval/interview-set.ts`. At the moment the test only checks the AI against the developer's opinion.
4. **Thin profiles:** a great person with a thin mini-me scores low. Flag "not enough to judge" instead of ranking them as weak. The quality page reports this but doesn't gate on it.
5. **Re-run checks match keywords;** an important change written in different words may not trigger a re-interview.
6. **Legal:** ranking job applicants by AI has legal requirements in the UK (automated decisions, equality law). The owner needs real legal advice. The planned next step is a plain-English brief for a lawyer.
7. **Budget:** at $5 a month, real use will run out and fall back to basic interviews. The owner has to decide a budget, and check the AI prices against Anthropic's.
8. **"Edit role" on live jobs:** the owner said clients shouldn't change a live job. Decide whether to remove it, leaving only "Add must-have".
9. **"Teach it your taste" pairs** can be odd when the interviews are the basic version. Check this once AI interviews exist.
10. **Flaky test:** one full test run once failed 3 AI-related tests and passed 3 times afterwards. The cause isn't known.
11. **Candidates can't see their own scores** (by design). If disputes by candidates are wanted, that needs building.

---

## 8. Recent history (newest first)
- `1588195` Quality check: one made-up job, 36 people rated 2–99; ours vs AI.
- `dd6ea45` Quality page made short and visual.
- `d6f33a9` Disputes ("Disagree with this score?") and "Teach it your taste".
- `c28fb3b` Interview quality check (first version).
- `98cf897` Worker sweep every 10 minutes so everyone eligible is interviewed.
- `2040a9a`, `56b1b93` Interview view: one question at a time, coloured by score, folded answers.
- `2e24935` Everyone eligible interviewed for every live job; hard rules only; score card; smart re-runs; ranking.
- `c756e9c` Connector: memory-first plus transparency rule; account line on every reply.
- `cf37619` Mini-me feeds matching; visible from sign-up; three-door demo entry; Full reset.

There's also `trailer-handover/` (kept out of git): trailer footage, screenshots, brand assets and the Sam Okafor filming account details.
