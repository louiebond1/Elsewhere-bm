# Shortlist delivery and screening

Implementation of the agreed missing-information proposal, with the four corrections discussed on 13 November 2026. The thresholds below are provisional product rules, not proven hiring predictions.

## Candidate assessment

Only approved job requirements have weights. Desirables may account for at most 30% of total weight. Questions outside the rubric do not score. The AI classifies evidence; fixed code calculates ordering.

- Unknown: no usable evidence or an ambiguous answer. It is not a failure. A declined disclosure stays unknown and does not get another automatic request.
- None stated: explicitly never done the work with no related evidence. Zero evidenced points without an essential gate.
- Related, some, clear, strong: 25, 50, 75 and 100 points against the particular requirement's anchors.
- Not met: explicitly cannot or will not meet it, or explicitly lacks a mandatory credential. Zero with an essential gate when relevant.
- Technical failure: pending, never a weak score.

The deprecated contradictory state is rejected on new AI assessments. Existing assessments are versioned out. Forgotten numbers do not erase otherwise demonstrated work; numerical outcomes are not universally required.

## Fixed calculation

Weights are normalised to 100. C is covered weight, D the weighted evidenced points and Q the average over known requirements. When C is zero, Q is zero.

```
f = min(25, max(0, Q - 25)) * C / 100
W = D + (100 - C) * f / 100
upside = D + (100 - C) * min(75, max(0, Q - 25)) / 100
ceiling = D + (100 - C)
```

Results are bounded to 0–100. Rank by essential-not-met gate, then W, D, essential evidenced points and a stable anonymous reference. Show D and coverage to employers, with an explanation that ordering includes a limited provisional allowance. Coverage is not statistical confidence.

The trade-off remains explicit: silence may beat an honest zero-experience answer. It does not beat Related or higher evidence. We do not claim the formula removes every incentive to withhold information.

A strong incomplete candidate can be flagged for review when coverage is at least 50%, Q at least 75 and their hard ceiling could reach the shortlist. A capped upside estimate must not veto them. Upside prioritises the queue; it does not establish ability. Unknown essentials receive priority. Desirables alone trigger review only outside the ten. A hard-ceiling comparison never treats an essential-gated incumbent as an ordinary numerical boundary.

Example: strong evidence across 90% of the job gives D 90, W 92.25, upside 97.5 and ceiling 100. They remain a possible contender when tenth place scores 98. One strong answer covering 10% gives W 12.25 and does not qualify for contender review.

## Delivery windows

A newly activated, approved job starts one cycle on the real clock:

- Evidence cutoff at 24 hours.
- Publication due at 25 hours, allowing processing of evidence already saved.
- At 27 hours, publish the available assessed list even if some people remain pending.
- A recovered assessment from the original window can create an immediate correction.
- Scheduled evidence updates at 72 hours, then weekly while the role remains open.

Each candidate has at least 24 hours from their in-app notice. People notified late can finish after the initial cutoff and join through a later update. Missing a notice is not a rejection. Candidate edits remain available after the personal window; the UI explains that later evidence is considered at a later update.

No candidate list or candidate detail is disclosed to the employer before initial publication. Introduction requests cannot bypass this hold, including requests submitted by a consultant. Consultant evidence review and screening invitations are separate private workflows.

New requirements invalidate approval and start a new cycle after approval. Existing introductions and employer actions survive. Previously delivered versions remain available, subject to current privacy permissions.

## Immutable evidence and versions

`shortlist_cycles` freezes the approved role and criteria. `shortlist_members` records the candidate's notice and personal window. `shortlist_revisions` appends the exact anonymised assessment inputs and approved profile evidence when it is saved. AI results and the cleaned interview attach to that revision; they never substitute later profile content into earlier evidence.

Initial publication selects the last eligible revision saved by the cutoff. An unassessed newer revision cannot secretly borrow later evidence. While a later update is processing, an incumbent's last delivered evidence can remain visible as a dated snapshot, with pending work counted separately.

`shortlists` stores complete delivered copies of the entries, evidence, criterion levels, metrics and interview. Changes in scores, order, evidence or interview content can create a new version even when membership stays the same. Newcomers normally need a margin greater than 2.5 over the current weakest incumbent to displace them at scheduled updates. The comparison uses current incumbent evidence, not an obsolete score. Essential gates take priority over numerical margins. Empty places can be filled without that margin.

Human requirement corrections cite an exact quote from existing frozen evidence and create a dated correction. A client's per-answer annotation also creates a new version but does not change criterion ranking or become global scoring guidance.

Privacy is checked again on every read. Historical payloads contain no identity; names and email resolve only through a current role-specific grant. Blocks, deletion and discovery permissions remain effective. Full profile reset/deletion erases that candidate's saved shortlist evidence. Existing employer actions are retained separately.

## Contender review and screening

The consultant queue distinguishes evidence strength from unresolved weight and possible upside. Review is limited to eight files per job in a rolling seven-day period. Choices are an in-app nudge, a screening invitation or no action, each with a recorded reason. This limit does not remove a candidate's follow-up or later-update route.

- Five coupons per job.
- An invitation reserves no coupon and expires after 48 hours.
- Candidate acceptance records consent for that particular job and reserves one coupon under the role lock.
- Two simultaneous acceptances cannot both take the last available coupon.
- The consultant records pass/fail against the requirements. A pass consumes the coupon and a fail returns it.
- A pass cannot include an explicitly unmet essential requirement.
- Recording consent is separate from job screening consent.
- Declines and expiries do not lower ratings and are hidden from the employer.
- A preference after a valid pass does not return a coupon. An essential-requirement dispute requires consultant review.
- Legacy requested screenings keep their previous reservation accounting; new invitations use the consent flow.

## Notifications

New shortlist notices, gap prompts, reminders and candidate screening invitations are in-app. No email or SMS channel is enabled by this change. Creation and reading are distinct audit events. A created notice is not treated as proof it was read. A twelve-hour in-app reminder is idempotent.

## Existing jobs and rollout

The migration creates new storage without resetting accounts. The migration script preserves existing role lists before the new worker starts. Basic/fixture assessments are retained for historical readability but cannot become ranked top picks. Only approved current real assessments qualify for the legacy ranked list.

Existing jobs keep their delivered version. New jobs use the timed process. Reviewing and approving an existing job's checklist or choosing Start updated shortlist enables the new process for that job. Old employer actions remain in place. Deploy migrations/web first and worker second.

## Important limitations

This is a deterministic ordering and review policy. Neither its thresholds nor its possible-outcome bounds are calibrated probabilities of hiring success. The formula cannot discover unshared ability, and limited screening capacity cannot guarantee review of every hidden excellent candidate. Recruiter-labelled evidence and wider evaluation remain necessary. Money caps and real-message settings remain unchanged.

## Verification

Final deterministic regression run on 13 November 2026: 219 tests passed across 39 files in one clean run. Production build and TypeScript checks passed. Lint passed with seven existing warnings and no errors.

Seven new database integration scenarios cover publication holds across employer routes, frozen evidence and version history, a strong contender missing one answer, job-specific consent and coupon outcomes, simultaneous acceptance of the last coupon, an empty cohort, quote-backed human corrections and recovery from a technical failure. The recovery check also verifies that a basic fallback cannot enter a live-AI ranking.

Desktop and phone browser checks cover the employer delivery window and candidate screening consent. Deadline tests advance the clock in a disposable database; they do not wait 24 actual hours or change live job deadlines. Unit checks exercise the fixed calculations, tie breaks, contender bounds and the rule that adding Related or stronger evidence cannot reduce working score.

These checks verify implemented behaviour. They do not establish real-world hiring accuracy or fairness. The [release receipt](evaluations/SHORTLIST-STATE-CHECK.md) records the final full-suite result, successful web/worker deployment and five passing live AI state checks.

## Code map

- Rules: `src/server/lib/shortlist-rules.ts`.
- Cycles, immutable revisions, publications, reviews and corrections: `src/server/services/shortlists.ts`.
- Activation/approval and candidate evidence hooks: `roles.ts`, `matching.ts`, `onboarding.ts`.
- Consent, invitations, outcomes and coupon accounting: `screenings.ts`.
- Employer publication reads: `src/server/views/client.ts`.
- Candidate windows: `candidate-interviews.ts`, `interview-feedback.tsx`.
- Screens: `shortlist-delivery.tsx`, `shortlist-actions.tsx`, `screening-forms.tsx`.
- Additive migrations: `0019_shortlist_delivery.sql`, `0020_shortlist_reminder.sql`.
- Verification: `tests/unit/shortlist-rules.test.ts`, `tests/integration/shortlists.test.ts`, and the two new browser flows.
