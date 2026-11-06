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
- E2E (Playwright): see the final report for the latest run.

## Deliberate interpretations (please check)

1. **Role family filter.** A role family outside the candidate's preferred families is treated as incompatible. S21 implies this, but it is not in the spec's list of hard incompatibilities.
2. **London/Hertfordshire hybrid rule.** Compatible when the candidate selected hybrid work. The spec's "selected both work modes" was ambiguous.
3. **S19 discovery slot.** Implemented as specified (the highest-ranked low-information candidate with a relevant tag, not already selected). With the seeded data, that candidate is C07 rather than C10, so the scenario text says "a discovery slot" rather than naming C10.
4. **Outside-window replacement request.** Recorded as a declined case with eligibility `outside_window`, so there is history but no role and no charge.
5. **Fixture mode.** Fixture responses use authoritative outputs for the known C40 answers. Any other text becomes one plain draft per answer (no tags, "not analysed"). Fixture mode never pretends to analyse new information.
6. **Matching while live AI is on.** Matching computes tag-based levels inline. A worker job for Haiku assessment is designed into the job kinds but not wired up (see limitations).
7. **Storage.** `STORAGE_DRIVER=database` was added for local and test runs without MinIO. Railway uses `s3`.
8. **Seeded IDs.** UUIDv5 values derived from generation and fixture code, for core entities (users, candidates, clients, roles, organisations, orders, evidence). Lower-level rows use random UUIDs.

## Known limitations (not hidden as future work)

- Live-mode **criterion assessment by Haiku** and **Sonnet review** are implemented in the provider (`assessCriteria`) but not yet run by a worker job. Live mode currently uses AI for question phrasing, extraction and role structuring.
- Live **feedback** text is still generated deterministically from approved evidence.
- The daily token admission and the concurrency slots are process-local plus database-backed for tokens. They are not tested against a live provider (no API key was used).
- Rate limiting applies to login, gate and sign-up only. The 60 AI requests per user per hour limit is not enforced separately.
- The spec booklet itself is not copied into `docs/`. Add the Word or PDF file there.
- E2E tests mutate the shared demo dataset. Run them against a disposable database.
- Pin exact Node image digests in the Dockerfile after testing. The dependency versions are pinned exactly in `package.json` and `package-lock.json`.
- No real emails, payments, phone recordings or legal approval exist anywhere. The screens say so.

## Unresolved commercial decisions (kept provisional in `src/config/prototype.ts`)

The 25% deposit and whether clients accept it as non-refundable, the 1.5 times full-search multiplier, the 90-day replacement window, the 12-month outside-hire clause, post-activation salary changes, rollover, top-up pricing, monthly pricing, VAT, exclusivity, and further screenings beyond five.
