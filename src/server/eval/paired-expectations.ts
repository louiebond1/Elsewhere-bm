/** Written before the fresh post-release comparison. Developer judgement, not recruiter-approved labels.
 * This reuses known benchmark profiles, so it is a regression comparison rather than an unseen validation set.
 */
export const PAIRED_EXPECTATIONS = {
 hands_on: {
  p01: {recs:'strong',close:'clear',ethics:'strong',learning:'strong',constraints:'strong',floor:'strong',triage:'strong',practical:'strong',independence:'strong',trust:'strong'},
  p02: {recs:'strong',close:'strong',ethics:'strong',learning:'clear',constraints:'related',floor:'related',triage:'related',practical:'related',independence:'partial',trust:'partial'},
 },
 group: {
  p01: {recs:'strong',close:'clear',ethics:'strong',learning:'strong',consolidation:'related',controls:'related',stakeholders:'related',systems:'related',review:'related',board:'related'},
  p02: {recs:'strong',close:'strong',ethics:'strong',learning:'clear',consolidation:'strong',controls:'strong',stakeholders:'strong',systems:'partial',review:'strong',board:'strong'},
 },
} as const;
export const PAIRED_ACCEPTANCE = {aggregateTolerance:10,criterionLevelTolerance:1,requiredWinners:{hands_on:'p01',group:'p02'}} as const;
