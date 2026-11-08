/**
 * Read-only teaching walkthrough for the gated demo (/demo/guide).
 *
 * Nothing here performs an action. Steps marked `changesData` only EXPLAIN what pressing a button on that
 * screen would do; the guide never calls an API, switches persona, loads a scenario, resets, checks out,
 * records a hire or deletes anything. Links open ordinary screens, which are read-only until a person
 * deliberately uses a button there.
 *
 * Commercial figures are the specification's provisional prototype defaults (spec section 1.5, mirrored in
 * src/config/prototype.ts). They are demo assumptions, not agreed BondMoran terms.
 */

export type Who = 'Facilitator' | 'Consultant' | 'Candidate' | 'Client';
export type Kind = 'real' | 'simulated';

export type Step = {
  who: Who;
  /** Fictional persona to switch to on /demo/personas before following the link. */
  persona?: string;
  title: string;
  /** Existing screen. Only static paths; pages with record IDs are reached from these. */
  path?: string;
  /** What to open and look at on that screen. */
  look: string;
  /** For steps that would change data if acted on: what the button does and what to expect. Never performed by the guide. */
  changesData?: { action: string; expected: string };
  kind: Kind;
  /** Extra caveat shown under the step. */
  note?: string;
};

export type Section = { id: string; title: string; intro: string; steps: Step[]; warning?: string };

export const WALKTHROUGH_BASIS =
  'Read-only tour of the baseline fictional dataset. Switch persona yourself on the personas page, then open the linked screen. Steps marked "Explanation only" describe what a button would do; this guide does not press it and nothing has been performed.';

export const COMMERCIAL_BASIS =
  'Prices, deposits, windows and limits are the specification’s provisional prototype defaults (section 1.5): pack credit £3,800, single credit £4,500, deposit 25% of standard salary credits once per role, full search 1.5x, 90-day replacement window, 12-month outside-hire window, 7-day intro expiry. They are demo assumptions, not agreed or signed-off BondMoran terms. VAT treatment is to be agreed.';

export const SECTIONS: Section[] = [
  {
    id: 'setup',
    title: '1. Setup: client, contract and role',
    intro: 'The consultant sets up each client. A client can only open roles while a contract is in effect.',
    steps: [
      { who: 'Facilitator', title: 'Open the demo controls', path: '/demo/personas', look: 'Check the banner says Baseline and the dataset generation. Do not press Load scenario or Reset demo during this tour: both replace the shared dataset.', kind: 'real' },
      { who: 'Consultant', persona: 'Alex Morgan (consultant)', title: 'Consultant home', path: '/consultant/home', look: 'Work queue: evidence awaiting review, screenings, expiring introductions and replacement requests.', kind: 'real' },
      { who: 'Consultant', persona: 'Alex Morgan (consultant)', title: 'Clients and contracts', path: '/consultant/clients', look: 'Open Alder Works, then Contract. See the plan, credit price, committed credits and term.', changesData: { action: 'Creating and activating a contract', expected: 'Activation adds the committed credits to the client’s balance as a simulated entitlement (no payment). Since the B4 fix (commit 49126f0) the start date defaults to the business date; a future start date shows a warning because roles cannot open until it starts.' }, kind: 'simulated', note: 'Credits from a contract are a simulated entitlement. No invoice or payment exists.' },
      { who: 'Client', persona: 'Emma Stone (Alder Works)', title: 'Client roles', path: '/client/roles', look: 'Alder’s open and draft roles. Open Assistant Accountant to see its salary, criteria and price rail.', changesData: { action: 'Creating or activating a role', expected: 'A role needs 3 to 6 criteria. Activating within the contract’s included roles costs nothing; an extra role takes its deposit up front after a confirmation that states the amount.' }, kind: 'real' },
    ],
  },
  {
    id: 'evidence',
    title: '2. Candidate evidence: CV, conversation, approvals',
    intro: 'Candidates build evidence of what they have done. Nothing reaches employers until the candidate approves it and the consultant passes it for anonymity.',
    steps: [
      { who: 'Candidate', persona: 'Maya Ellis (C01)', title: 'Candidate home and CV', path: '/candidate/home', look: 'Progress, feedback and next steps. The CV page shows the saved extraction.', kind: 'real' },
      { who: 'Candidate', persona: 'Maya Ellis (C01)', title: 'Profile and evidence', path: '/candidate/profile', look: 'Evidence cards with claim, source and uncertainty, draft or approved state, and the anonymous preview that matches what employers see.', changesData: { action: 'Approve for matching, Edit or Remove', expected: 'Approval publishes only the selected safe evidence for consultant anonymity review. Editing creates a new revision and removes the old claim from client views at once.' }, kind: 'real' },
      { who: 'Candidate', persona: 'Maya Ellis (C01)', title: 'Feedback and check-ins', path: '/candidate/check-ins', look: 'Short text check-ins. Feedback is on the Profile page’s Feedback tab.', kind: 'simulated', note: 'AI wording comes from fixed demo responses (fixture mode, labelled “Demo responses”). No live AI analyses new text.' },
      { who: 'Consultant', persona: 'Alex Morgan (consultant)', title: 'Consultant evidence review', path: '/consultant/candidates', look: 'Open a candidate to see evidence, anonymity review and activity.', changesData: { action: 'Approve or reject an evidence item for anonymity', expected: 'Approved items can appear in anonymous matches; rejected items go back to the candidate to change.' }, kind: 'real' },
    ],
  },
  {
    id: 'matching',
    title: '3. Anonymous matching and privacy',
    intro: 'Employers see role-relevant evidence with uncertainty, never a name, employer, CV or conversation before the candidate accepts.',
    steps: [
      { who: 'Client', persona: 'Emma Stone (Alder Works)', title: 'Role price rail', path: '/client/roles', look: 'Assistant Accountant: £44,000 salary, 1 credit (£3,800 at Alder’s pack rate), £950 deposit, and an £8,800 comparison explicitly labelled illustrative.', kind: 'real', note: 'Figures follow the provisional pricing defaults above.' },
      { who: 'Client', persona: 'Emma Stone (Alder Works)', title: 'Anonymous match', path: '/client/roles', look: 'Assistant Accountant, Matches, then View evidence on the candidate with the reconciliation story. No name or employer appears; unknowns are shown as unknown, not as weaknesses.', kind: 'real' },
      { who: 'Candidate', persona: 'Hannah Cole (C05)', title: 'Employer block', path: '/candidate/privacy', look: 'Alder Works is listed as hidden. Alder cannot find this candidate by list, search or a guessed address.', changesData: { action: 'Adding a block or turning discovery off', expected: 'Takes effect at once: pending requests are cancelled, any reservation is released and existing identity access for that employer is revoked.' }, kind: 'real' },
    ],
  },
  {
    id: 'intro',
    title: '4. Introduction request, consent and identity',
    intro: 'The client asks; only the candidate decides. Identity is revealed only for the accepted role and client.',
    steps: [
      { who: 'Client', persona: 'Emma Stone (Alder Works)', title: 'Request an introduction', path: '/client/roles', look: 'On an anonymous match, the Request intro control and its explanation.', changesData: { action: 'Request intro', expected: 'The role deposit is RESERVED, not charged (spendable balance falls, posted balance does not). The request expires after 7 days.' }, kind: 'real' },
      { who: 'Candidate', persona: 'Maya Ellis (C01)', title: 'Candidate decision', path: '/candidate/introductions', look: 'Requests name the employer and role so the candidate can decide.', changesData: { action: 'Accept', expected: 'The deposit is charged only if this is the role’s first accepted introduction. The candidate’s name and email become visible to that client for that role only; other clients and roles still see the anonymous profile.' }, kind: 'real' },
      { who: 'Candidate', persona: 'Maya Ellis (C01)', title: 'Decline, withdraw, delete (caveats)', path: '/candidate/introductions', look: 'Where Decline and Withdraw sit. Delete profile is linked from the Privacy page.', changesData: { action: 'Decline / Withdraw / Delete', expected: 'Decline releases the reservation with no charge. Withdraw after acceptance revokes identity access but the paid deposit and accepted count remain. Delete removes the profile from every client view and purges private data, while financial records stay without personal details; it asks for the candidate’s current password.' }, kind: 'real', note: 'Do not delete during this tour. Deletion has not been exercised in the live demo; it is covered by local automated tests only.' },
    ],
  },
  {
    id: 'hire',
    title: '5. Hire and ledger',
    intro: 'One salary-based price per hire. Payments already taken (the deposit) are deducted from that price, not added to it.',
    warning: 'NOT RUN END-TO-END: the exact baseline path (request intro, candidate accepts, record hire) has not been run end to end on the baseline dataset. Its steps were tested separately and through scenario S02, which starts from a pre-seeded pending introduction.',
    steps: [
      { who: 'Client', persona: 'Emma Stone (Alder Works)', title: 'Pipeline and interview prep', path: '/client/hires', look: 'Hires and their status. A role’s Pipeline tab shows accepted candidates by name, with interview preparation.', kind: 'real' },
      { who: 'Client', persona: 'Emma Stone (Alder Works)', title: 'Record a hire (explanation only)', path: '/client/roles', look: 'Record hire sits on a named, accepted candidate in the role pipeline. Its dialog states the exact charge before confirming.', changesData: { action: 'Record hire', expected: 'For Assistant Accountant at £44,000: total £3,800, minus the £950 deposit, so £2,850 is charged at hire. A different salary is blocked for review. Recording the same hire again charges nothing.' }, kind: 'real' },
      { who: 'Client', persona: 'Emma Stone (Alder Works)', title: 'Credits and ledger', path: '/client/credits', look: 'Balance, reserved and spendable credits, and immutable ledger entries with receipts. Corrections appear as separate reversal entries.', kind: 'real', note: '“Buy credits (demo)” is a simulated checkout: no money is taken and there is no payment provider. Do not use it during this tour.' },
    ],
  },
  {
    id: 'screening',
    title: '6. Screenings, recordings and exceptions',
    intro: 'Each role includes five human screenings. Exceptions are handled by the consultant with stated amounts.',
    steps: [
      { who: 'Consultant', persona: 'Alex Morgan (consultant)', title: 'Completed screening and recording', path: '/consultant/clients', look: 'Open Beacon Studio, then the Operations Lead role, then the Screenings tab, then Open screening on the completed one (candidate C25): human observations, 18 minutes logged, and the recording.', kind: 'simulated', note: 'The recording is a short silent file labelled “Demo recording placeholder”, not a real interview. Clients and candidates cannot open it.' },
      { who: 'Client', persona: 'Tom Avery (Beacon Studio)', title: 'What the client sees of a screening', path: '/client/roles', look: 'Operations Lead, Screenings tab: the completed screening shows a safe summary only. No recording or full conversation is available to the client.', kind: 'real' },
      { who: 'Consultant', persona: 'Alex Morgan (consultant)', title: 'Exceptions', path: '/consultant/operations', look: 'Jobs, wallet reconciliation, the email outbox and provisional configuration. Outside-system hires and replacements are reached from the consultant’s hires and role screens.', changesData: { action: 'Outside hire, replacement, demo credit grant, correction', expected: 'Outside hire within 12 months charges only the balance of the price. A replacement within 90 days is a linked zero-price role. Grants and corrections are separate ledger entries.' }, kind: 'real', note: 'The email outbox records messages only; nothing is sent.' },
    ],
  },
];

export type CoverageStatus = 'implemented' | 'independently tested' | 'local tests only' | 'not tested' | 'simulated';

export type Coverage = { ref: string; criterion: string; status: CoverageStatus[]; note: string };

export const COVERAGE_SOURCE =
  'Criteria are taken from the “BondMoran and Elsewhere prototype build specification” as pasted into the Claude build session (sections 1.2, 1.3, 10.6 and 10.7). A separate verbatim owner copy has not been recovered. “Independently tested” means the independent tester’s live checks. The scenario QA (S01–S26) ran on earlier builds. After the e2e456a deploy there were only limited independent read-only checks (health, demo accounts page, generation 35, the CV fixture); no full regression has been run on the current build. “Local tests only” means automated tests on local fictional data. This list does not claim that all criteria are met.';

export const COVERAGE: Coverage[] = [
  { ref: '§10.6.1', criterion: 'Gate blocks all data before the access password', status: ['independently tested', 'local tests only'], note: 'Live check of 401 private/no-store; automated gate test.' },
  { ref: '§10.6.2', criterion: 'Alder dashboard: two open roles, named consultant, 9.5 credits', status: ['implemented'], note: '9.5 confirmed in the seed check; dashboard contents not separately reported.' },
  { ref: '§10.6.3–4', criterion: 'R1 price rail and anonymous C01 profile', status: ['independently tested', 'local tests only'], note: 'S01 live; automated test also checks network payloads for names.' },
  { ref: '§10.6.5–7', criterion: 'Deposit on acceptance, balance on hire, further intro free', status: ['independently tested', 'local tests only'], note: 'S02 and S03.' },
  { ref: '§10.6.8–13', criterion: 'Extra role, full search, replacement in and out of window, second hire, outside hire and duplicate', status: ['independently tested'], note: 'S04–S10 after the B1–B3 fixes. API refusal of a repeat outside hire not independently tested.' },
  { ref: '§10.6.14–18', criterion: 'Intro cap, employer hiding, close/reopen, insufficient credits, decline, withdraw', status: ['independently tested'], note: 'S11–S17. Employer hiding network bodies not independently tested.' },
  { ref: '§10.6.19', criterion: 'Delete mid-process', status: ['local tests only'], note: 'Not run live: deletion needs the candidate’s current password.' },
  { ref: '§10.6.20–24', criterion: 'Auto-picks, sixth screening, two clients, onboarding, AI failure, salary review, outside window, full search from outset', status: ['independently tested', 'simulated'], note: 'S19–S26. AI output and the AI failure are simulated by design.' },
  { ref: '§10.6.25', criterion: 'Consultant plays recording; client has none', status: ['independently tested', 'local tests only', 'simulated'], note: 'Historical independent evidence on an earlier build; a recheck on the current build is outstanding. Client denial is also covered by local tests. The recording is a labelled silent placeholder.' },
  { ref: '§10.6.26–27', criterion: 'Phone and desktop widths; keyboard and focus', status: ['local tests only'], note: 'Automated checks cover a subset of routes and one dialog.' },
  { ref: '§10.6.28', criterion: 'Reset gives exact counts and balances', status: ['independently tested', 'local tests only'], note: 'Generation 35 seed check; not re-run because the dataset is frozen.' },
  { ref: '§10.6.29', criterion: 'Files and ledger survive redeploy; no automatic reset', status: ['independently tested', 'not tested'], note: 'Files: after the e2e456a deploy, the existing CV fixture for Amara (CAND-025, /api/files/6ad7e082-26df-46b1-8a68-a14e81bdbec4/download) returned the PDF (200) for Alex and for Amara as owner, with marker BM-QA-PERSIST-20261108 intact and the dataset still at generation 35. Ledger persistence across redeploy: not independently tested.' },
  { ref: '§1.2', criterion: 'Client support requests, consultant coaching and ranking adjustment', status: ['implemented', 'not tested'], note: 'Screens and routes exist; no test on record.' },
  { ref: '§1.2', criterion: 'Candidate controls discovery, edits evidence, withdraws', status: ['local tests only', 'independently tested'], note: 'Withdraw tested live (S17); discovery and edits by automated tests.' },
  { ref: '§1.3', criterion: 'No retrieval by an ineligible or blocked client through API, URL, file, search, notification or cached page', status: ['local tests only', 'independently tested'], note: 'API, URL, file and list covered; cached pages not tested.' },
  { ref: '§1.3 / §1.5', criterion: 'Charging and credits', status: ['simulated'], note: 'Contract credits, grants and the demo checkout move fictional credits only. No real payment exists.' },
  { ref: '§10.7', criterion: 'Definition of done (all routes, full suite, manual demo at both widths, persistence, limitations list)', status: ['not tested'], note: 'Not met as a whole: no full live regression on the current build, ledger persistence across redeploy not independently tested, and the limitations list in docs/HANDOVER.md is out of date.' },
];
