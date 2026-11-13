# Adaptive interviews and context matching

13 November 2026. Implemented locally on `simple-hiring`; web and worker deployment is pending. All people and jobs used here are fictional. The real AI ran in an isolated, one-shot Railway function using the application's prompts, output contracts and fixed scoring rules. No live candidate or role records were created or changed. Only shared AI budget accounting was written.

## What changed

Elsewhere now keeps a follow-up agenda alongside the broad profile questions. It combines clues in approved answers with unanswered requirements from current job assessments. The ChatGPT/Claude connector reads that agenda and asks naturally; the built-in coach receives the same agenda and follows the latest answer. Questions can differ between people. Assessment standards remain tied to the approved job rubric.

Clues trigger investigation, not invented biography. A factory described as a sweatshop invites questions about actual conditions, personal responsibility and actions. It cannot establish resilience or ethical behaviour by itself. Youngest or oldest invites questions about working with the team, not age-based scoring or an assumption about first jobs.

The profile guide now includes operating context, resources, authority, scale, governance, trade-offs, difficult conditions, judgement, team entry, change and working preferences. Preferences are kept outside capability evidence. Jobs support up to 12 distinct requirements with descriptions and job-specific scoring anchors. The employer reviews and approves the rubric. Bigger rubrics are assessed in groups of four through the existing budget gate; partial or invalid results cannot become a complete assessment.

## Matching results

Each job has ten requirements. Both require finance competence. The hands-on role prioritises manual delivery, limited support and practical operations. The group role prioritises multi-entity consolidation, controls and specialist coordination.

| Fictional person | Hands-on job | Group job |
|---|---:|---:|
| Chinese factory CFO with concrete small-team evidence | 95 | 50 |
| $180m multinational finance leader with concrete group evidence | 54 | 91 |
| Factory CFO title and sweatshop reference only | 0 | 0 |
| Famous-company CFO title only | 0 | 0 |
| Same factory evidence with Canada substituted for China | 98 | 49 |
| Same multinational evidence without prestige wording | 59 | 87 |
| Evidence covering both environments | 98 | 87 |
| Empty profile | 0 | 0 |
| Fresh community workshop coordinator | 96 | 49 |
| Fresh multi-campus reporting lead | 42 | 97 |

These are evidence points out of 100, not probabilities of success. Zero with no evidence means nothing demonstrated yet, not incapability. The two fresh profiles were introduced after the role-specific anchors were chosen. No anchors were changed after their results.

The final matching run contains 20 base assessments and four repeated assessments. Two empty-profile assessments required no paid calls. All non-empty assessments passed source-id and verbatim quotation checks. The preferred person changes in the intended direction for both the original pair and the fresh pair. Country-only changes stayed within five points, prestige-only changes within five points and four repeats within ten points. Those tolerances were retained rather than loosened to obtain a pass. Small differences remain and should not be overinterpreted.

## Conversation verification

Four fictional people each had two AI interview turns: factory CFO, youngest EX3 colleague explicitly in their third job, oldest startup colleague coaching five people and fictional famous-company CFO. The second model response sees both the previous question and the candidate's new answer. The saved report contains the exact inputs, replies and saved facts.

All eight final conversation turns passed the output contract. Follow-up questions changed after the answer, factory conditions were explored, the youngest example was not treated as a first job and saved facts did not invent the checked character traits. Manual inspection also found a redundant job-title question in the explicitly fictional famous-company probe. Passing these checks does not imply every question is ideal.

The final conversation run is recorded separately from the final matching run because development exposed two reliability issues: replies cut off at the former token limit and an overlong saved topic rejected by the output schema. Assessment batching, a larger bounded conversation allowance and explicit concise-heading instructions address those failures. Failed development runs are not counted as passing evaluations.

## Scope and limits

This is a small synthetic scenario check, not proof of general hiring accuracy, statistical fairness or agreement with a recruiter. It does not test all 36 original fictional finance profiles live under the new prompts. The larger quality runner includes those profiles and the two additional jobs for subsequent evaluation. Human-approved criterion labels and a wider unseen set remain necessary before relying on rankings for real hiring.

Monthly AI limits remain unchanged at $5. The isolated evaluation has a separate $0.50 ceiling across its development runs. Reported request costs use the repository's configured price table, not independently verified provider invoice prices.

The review screen is `/consultant/quality/context`. `context-benchmark.json` is the machine-readable record with per-criterion evidence and actual conversations. Production web and worker have not been deployed with these changes.

## Files

- Profile guide: `src/config/onboarding.ts`.
- Follow-up leads and shared agenda: `src/server/lib/interview-agenda.ts`, `src/server/services/onboarding.ts`.
- Built-in interview and connector: `src/server/services/mini-me-chat.ts`, `src/server/connectors/mcp.ts`.
- AI instructions and contracts: `src/server/ai/prompts/index.ts`, `src/server/ai/schemas/index.ts`, `src/server/ai/providers/anthropic.ts`.
- Bounded assessment and worker: `src/server/ai/assess.ts`, `src/server/services/worker-handlers.ts`.
- Matching and interview refresh: `src/server/services/matching.ts`, `src/server/services/simulation.ts`.
- Fictional jobs and people: `src/server/eval/context-set.ts`.
- Scenario checks and report: `src/server/eval/context-report.ts`, `scripts/report-context-benchmark.ts`.
- One-shot real-model runner: `scripts/context-benchmark-function.ts`.
- Review screen: `app/consultant/quality/context/page.tsx`.

## Verification record

TypeScript, all 77 unit tests and production build passed. ESLint had no errors and seven existing warnings. Two targeted database runs passed 24 tests (adaptive interview, onboarding, mini-me chat, quality and hiring) and 20 tests (bounded assessments, quality, stage-two behaviour and hiring); these overlap and are not 44 distinct tests. The full original integration suite has not been repeated as one run for this extension. Desktop and phone browser checks both passed: consultant access, the comparison table, the passing-check summary and the adaptive conversation view. The phone screenshot was inspected.

The final matching and conversation requests total $0.064835 using configured prices, excluding unsuccessful development attempts and previous runs. All development runs shared the unchanged $0.50 evaluation ceiling.
