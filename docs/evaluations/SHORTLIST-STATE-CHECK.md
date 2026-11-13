# Shortlist release verification, 13 November 2026

The new shortlist and screening workflow is live on both web and worker at `d30e842bf7747f9814dbe47e642246c7a8d89c83` on `simple-hiring`. This receipt records observed results, not a claim of general hiring accuracy.

## Deployment

| Component | Verified outcome |
|---|---|
| Web | Railway deployment `fc1e2aed-d964-464e-868f-e20c67c34cf9`: SUCCESS |
| Database | Pre-deploy completed at 19:36:58 UTC; migrations applied. The preservation step reported zero legacy lists requiring preservation. No live reset was run. |
| Health | Public `/api/health` returned HTTP 200 with `status: ok`. |
| Worker | Railway deployment `e4ffef04-853c-4cf5-aa47-4e3f29be5404`: SUCCESS; worker startup logged; settled at 19:40:14 UTC. |
| Source | Both services are pinned to the exact code commit above. Later documentation commits do not deploy automatically. |

## Automated software checks

- All 219 unit and database integration tests passed across 39 files in one clean run, starting at 19:27:04 UTC and lasting 402.79 seconds.
- Four browser checks passed on the final build: employer delivery hold and candidate screening consent, each on desktop and phone. Phone screenshots were inspected. The employer view has no live-results panel.
- Production build and TypeScript passed. Lint reported zero errors and seven existing warnings.
- Changed source passed whitespace and secret-pattern checks. The published Git tree exactly matched the tested local tree: `f1018098b9bd095e25fc8a13bbba1cc60f90580d`.

The seven new database scenarios cover employer access before publication, immutable cutoff evidence and versions, the mountain/no-service contender, candidate consent and coupon outcomes, concurrent acceptance of the last coupon, empty-cohort delivery, quote-backed human corrections and recovery after a technical failure. Basic fallback assessment is explicitly kept out of live-AI ranking. Clock boundaries were simulated in a disposable database, not by changing live deadlines.

## Live AI state checks

Five fictional profiles were assessed against two fictional requirements: bank reconciliations and building a maintainable process. Expected levels were declared in the runner before the calls. The runner used the release's matching prompt and output schema with `claude-haiku-5-5`. No candidate profiles, live role deadlines or application settings were changed.

| Fictional evidence | Expected reconciliation / process levels | Actual | Outcome |
|---|---|---|---|
| Only a football hobby | Unknown / Unknown | Unknown / Unknown | Pass |
| Explicitly never done either activity, with no related experience | None stated / None stated | None stated / None stated | Pass |
| Supplier-ledger checks but no bank-reconciliation ownership | Related / Unknown | Related / Unknown | Pass |
| Explicitly will not do either activity | Not met / Not met | Not met / Not met | Pass |
| Regular personal reconciliation work; a checklist colleagues maintain; exact quantities forgotten | Strong / Strong | Strong / Strong | Pass |

All ten predefined criterion decisions matched. Every response also passed the actual application schema and evidence validator: criterion membership, candidate evidence IDs, exact supporting quotes and empty evidence for Unknown. A completed-run event was observed.

For illustration, with requirement weights 70/30, the real outputs produce: Unknown has zero coverage and no essential gate; None stated has 100% coverage, zero demonstrated points and no essential gate; Not met has 100% coverage and an essential gate. The forgotten-number case has 100 demonstrated points. These are different evidence states even when some numerical totals are equal.

The isolated run's configured-price total was $0.001626. This uses the repository price table, not an independently verified provider invoice. All development evaluations share the unchanged $0.50 ceiling and application usage remains under the unchanged $5 monthly gate. No limit was raised.

Full fictional inputs, expected outputs, actual outputs, quotes and configured costs are in [shortlist-state-check.json](shortlist-state-check.json). The reproducible runner is `scripts/shortlist-state-check-function.ts`; the isolated Railway deployment was `25cf5532-c059-44e4-b569-6f705f2dffb3`.

## What remains provisional

Notifications for this workflow are in-app only. Email and SMS were not enabled. New jobs use the timed workflow after their checklist is approved. Existing jobs retain their saved version and can opt into a new cycle through checklist approval or Start updated shortlist.

The tests establish that these cases follow the agreed rules. They do not establish general hiring accuracy, real-world fairness or the calibration of weights and review thresholds. Recruiter-labelled cases and wider unseen examples are still needed. The incomplete-candidate review route preserves an opportunity for investigation; it cannot guarantee a screening slot or a top-ten place.
