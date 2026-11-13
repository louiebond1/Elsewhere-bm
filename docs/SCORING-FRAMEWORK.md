# Evidence scoring implementation

Implemented on 13 November 2026. This change is not a claim that the ranking is validated for real hiring.

## Employer flow

The hiring conversation drafts job-specific requirements. Skill tags can describe any occupation rather than only the original finance taxonomy. Saving the conversation opens the draft checklist rather than silently activating the job. Employers can edit requirements, descriptions, essential/desirable status and relative weights using Edit draft. The checklist shows normalised weight percentages and scoring anchors. Approval records the exact role version and an audit snapshot. Activation requires approval. Editing the brief invalidates approval; live edits invalidate previous assessments and require a new approval.

Existing live jobs are not automatically approved by the migration. A user must review their checklist first. Only newly seeded fictional demo roles are marked approved in seed data.

## Scoring

AI returns a criterion level, source ids, a verbatim quote and a short reason. Related = 25, some = 50, clear = 75, strong = 100. Explicitly unmet = 0. Unknown = no points yet, displayed as missing information. Points are weighted over the complete rubric, never only known requirements. Profile coverage is the weight with a known assessment, including explicitly unmet requirements. Coverage is not statistical certainty. Missing information affects ranking position because it cannot yet earn points.

A quotation can support several distinct criteria. Source ids must belong to the candidate and non-unknown assessments must quote supplied evidence. This validates provenance, not semantic correctness. Screening assessments override individual known criterion levels instead of a 70/30 blend. Arbitrary ranking adjustments no longer affect scores. Existing question corrections remain annotations; neither they nor taste choices become global scoring instructions.

All client lists and automatic screening picks use current criterion assessments. Interview output is readable supporting material; it no longer supplies an overall ranking judgement. Pending, old-version and fixture assessments cannot qualify for live top picks. Empty profiles remain pending until they share evidence; they do not trigger a paid call or receive a misleading AI score.

Assessments are tied to role version, scoring version, prompt version, model and a hash of the supplied evidence. The worker rechecks live roles periodically and processes additional batches after successful progress. Provider failure leaves the assessment pending. Existing monetary caps are unchanged.

Known names and contact details are redacted while retaining useful mini-me text. Unresolved legal entity identifiers still cause an item to be withheld. This conservative anonymity filter needs further review before wider use.

## Quality and rollout

New quality runs assess criteria and calculate totals rather than measuring the interview's subjective overall score. They store per-criterion output. Old interview-score runs are excluded from the current quality page. The reference ratings remain developer-created and provisional. Recruiter-approved criterion labels and examples, more job types and a paid live quality run are still needed before trusting the results for real hiring.

Deploy the web migration before the worker. Review and approve a test role, then inspect pending/current assessment status and candidate detail evidence. Do not raise budget limits or reset live data. The foundation verification below was local. The later isolated paid scenario evaluation is described separately below; production deployment is still pending.

## Verification on 13 November

Production build and TypeScript passed. ESLint reported no errors and the same seven existing warnings. All 71 unit tests passed. The 35 database regression tests covering the approval/version checks, live-vs-basic ranking, screenings, credits and simulation behaviour passed. Desktop and phone browser tests both completed the edit, review and approve workflow; screenshots were inspected.

An earlier full 199-test run passed 196 tests and exposed three legacy assertions expecting fixture scores to be ranked. Those expectations were updated and the affected suites passed in the 35-test rerun. The full suite has not been repeated as one run after these expectation updates. No live AI evaluation or production deployment was performed during that foundation verification.

## Adaptive interview extension

The subsequent context extension adds shared follow-up agendas for the connector and built-in coach, up to 12 job-specific criteria, bounded four-criterion AI assessments and richer work-context profile questions. Context clues prompt investigation rather than assumed traits. See [the scenario report](evaluations/CONTEXT-BENCHMARK.md) and its machine-readable snapshot for the real-model fictional comparisons, actual follow-up conversations and limitations. This isolated evaluation does not deploy the application or validate it for general hiring.
