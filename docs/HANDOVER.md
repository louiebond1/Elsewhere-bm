# Handover: BondMoran prototype

Built overnight from the build specification (Version 1, 6 November 2026). This is a functioning **fictional-data prototype**. It is not production ready.

## What works

- **All three user types**, with server-enforced access: candidate (`/candidate/*`), client (`/client/*`), consultant (`/consultant/*`). Demo gate, Argon2id passwords, hashed session tokens, CSRF header plus same-origin checks, login throttling, 12-hour real-clock sessions.
- **Financial core** (`src/server/lib/pricing.ts`, `src/server/services/*`): half-credit salary bands, integer units and pence with BigInt, contract snapshots, wallets, append-only ledger (database trigger blocks updates and deletes), deposit holds, idempotency keys, a fixed lock order, deadlock retry.
- **Every charging case**: standard and full-search pricing, the extra-role deposit, the shared deposit hold, a free further intro, upgrade with no charge, first hire settles the balance, a second hire is a new full price, a zero-price free replacement on a linked role with its own limits, outside-system recovery (12-month window), duplicate protection, the salary-change block, close and reopen, simulated grants, exact reversals.
- **Candidate evidence**: CV upload (PDF/DOCX signature checks, pdfjs/mammoth extraction in the worker, a paste fallback), a text conversation (topic sequence, maximum 6 core questions plus 2 clarifications, skip and save-and-leave), evidence provenance validation, candidate approval, consultant anonymity review, profile versions, edit-supersedes, withdraw, preferences, discovery, employer and group blocks, and deletion with an immediate revoke followed by a worker purge.
- **Matching**: hard eligibility, criterion assessment (fixture: approved evidence tags; live: Haiku with validated JSON), 70/30 AI and human weighting, bounded consultant adjustments, stable ranking, the "Evidence-backed" and "Worth a conversation" sections, and auto-picks with a discovery slot.
- **Anonymity**: allow-list DTOs, HMAC role-scoped references, identity shown only under an active per-role grant, and the candidate preview using the same serializer as clients. Clients can never download CVs, transcripts or recordings.
- **All 26 scenarios (S01 to S26)** load from `/demo/personas` through the same services as the normal screens. "Play next step" switches to the right persona.
- **Railway**: deployed as project `bondmoran-prototype` with web, worker, PostgreSQL and a private bucket. Status is in the final report.

## Test results (local, fixture mode, real PostgreSQL 16)

- Unit (Vitest): 40 passed (`npm run test:unit`): pricing vectors and properties, dates, eligibility, scoring, auto-picks.
- Integration (Vitest, real PostgreSQL): 43 passed across `financial`, `privacy` and `ai-and-jobs`. They cover S02 to S26 financial outcomes, concurrency (simultaneous accepts, hires and extra-role activations), the privacy P-series and the S23 job retry.
- E2E (Playwright, against a production build): 9 tests: gate, S01 anonymity including network payloads, S02 through the UI, S12 hiding and 404, CSRF and cross-origin rejection, dialog keyboard focus, and no horizontal scroll at phone width. All 9 passed. The last two failures were fixed test waits, rerun and passing.

## Deliberate interpretations (please check)

1. **Role family filter.** A role family outside the candidate's preferred families is treated as incompatible. S21 implies this, but it is not in the spec's list of hard incompatibilities.
2. **London/Hertfordshire hybrid rule.** Compatible when the candidate selected hybrid work. The spec's "selected both work modes" was ambiguous.
3. **S19 discovery slot.** Implemented as specified (the highest-ranked low-information candidate with a relevant tag, not already selected). With the seeded data, that candidate is C07 rather than C10, so the scenario text says "a discovery slot" rather than naming C10.
4. **Outside-window replacement request.** Recorded as a declined case with eligibility `outside_window`, so there is history but no role and no charge.
5. **Fixture mode.** Fixture responses use authoritative outputs for the known C40 answers. Any other text becomes one plain draft per answer (no tags, "not analysed"). Fixture mode never pretends to analyse new information.
6. **Matching while live AI is on.** Matching computes tag-based levels inline. A worker job for Haiku assessment is designed into the job kinds but not wired up (see limitations).
7. **Storage.** `STORAGE_DRIVER=database` was added for local and test runs without MinIO. Railway uses `s3`.
8. **Seeded IDs.** UUIDv5 values derived from generation and fixture code, for core entities (users, candidates, clients, roles, organisations, orders, evidence). Lower-level rows use random UUIDs.

## Stage 2 additions

- **Empty workspace.** Choose "Start empty workspace" on `/demo/personas`, or run `npm run demo:reset -- --confirm RESET --scenario EMPTY`. Only Alex Morgan and Jamie Patel exist. Creating a client as a consultant also creates that contact's login, using `DEMO_LOGIN_PASSWORD`. Consultants can add non-client organisations, so candidates can be hidden from their employer. "Back to full demo data" restores the 40-candidate baseline.
- **Live matching.** In live mode each pair first shows the deterministic result. A per-role `assess_match` worker job then asks Haiku, validates the answer (criteria, evidence ownership, identifying text, current profile and role versions) and stores it with provider `anthropic`. The cached result is reused until the profile or role version changes. Pairs awaiting AI never block introduction requests.
- **Sonnet review.** On a role's "Consultant review" tab, "Ask for an AI review" produces a proposal (Sonnet in live mode, labelled demo responses in fixture mode). It changes nothing until the consultant presses Apply, and the same validation runs again.
- **Live feedback.** A `generate_feedback` job writes AI feedback into `profile_versions.feedback_live`. Strengths that cite evidence outside that profile are dropped. The approved profile content stays immutable.
- **Per-user AI limit.** 60 user-initiated AI requests per real hour, on top of the deployment-wide daily token budget. The token budget is preserved across demo resets.
- Tests: 89 unit and integration tests, including live paths through a stand-in provider (no network), plus 9 browser tests.

## Known limitations (not hidden as future work)

- Live mode has not been exercised against the real Anthropic API, because no API key was configured. The live code paths are tested with a stand-in provider. Before any real live demo, run one controlled call with a provider spending limit set.
- Rate limiting covers login failures, gate failures, sign-up and per-user AI requests. Other endpoints are not rate limited.
- The spec booklet itself is not copied into `docs/`. Add the Word or PDF file there.
- E2E tests mutate the shared demo dataset. Run them against a disposable database.
- Pin exact Node image digests in the Dockerfile after testing. The dependency versions are pinned exactly in `package.json` and `package-lock.json`.
- No real emails, payments, phone recordings or legal approval exist anywhere. The screens say so.

## Unresolved commercial decisions (kept provisional in `src/config/prototype.ts`)

The 25% deposit and whether clients accept it as non-refundable, the 1.5 times full-search multiplier, the 90-day replacement window, the 12-month outside-hire clause, post-activation salary changes, rollover, top-up pricing, monthly pricing, VAT, exclusivity, and further screenings beyond five.
