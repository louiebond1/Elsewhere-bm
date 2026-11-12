/**
 * The fixed test set for the interview quality check: one made-up job and 36 fictional people, each with the
 * rating out of 100 we think they deserve for it. Ratings were set by the developer, not a recruiter: treat them as
 * a starting point a human should review. They are spread across the whole range on purpose, from near-perfect to
 * no fit at all. Nobody here is real; no names or employers appear in the answers.
 */
export type Tier = 'strong' | 'middling' | 'weak';
export type EvalItem = { key: string | null; topic: string; answer: string };
/** expected: the rating out of 100 we think they deserve for this job. */
export type EvalPerson = { id: string; tier: Tier; expected: number; note: string; items: EvalItem[] };
export type EvalCriterion = { key: string; label: string; weight: number; tags: string[] };
export type EvalJob = { id: string; title: string; outcomes: string[]; criteria: EvalCriterion[]; people: EvalPerson[] };

const i = (key: string | null, topic: string, answer: string): EvalItem => ({ key, topic, answer });
const tierOf = (n: number): Tier => (n >= 75 ? 'strong' : n >= 35 ? 'middling' : 'weak');
const p = (id: string, expected: number, note: string, items: EvalItem[]): EvalPerson => ({ id, tier: tierOf(expected), expected, note, items });

export const EVAL_JOBS: EvalJob[] = [
  {
    id: 'acct', title: 'Assistant Accountant',
    outcomes: ['Own the month-end close and keep bank reconciliations accurate and on time'],
    criteria: [
      { key: 'reconciliations', label: 'Reconciliation ownership', weight: 5, tags: ['reconciliations', 'month_end'] },
      { key: 'reporting', label: 'Clear reporting', weight: 3, tags: ['reporting', 'excel'] },
      { key: 'improvement', label: 'Process improvement', weight: 2, tags: ['process_design', 'automation'] },
    ],
    people: [
      p('a01', 99, 'Owns reconciliations and the close, reports to the finance director, automated the bank import', [
        i('current_duties', 'What do you do day to day?', 'I own the bank and intercompany reconciliations for three entities and run the month-end close for a team of five.'),
        i('ex_numbers', 'A result with a number', 'I automated the bank feed import and matching rules: unmatched items fell from about 70 a month to under 5, and close went from seven working days to four.'),
        i('writing', 'Writing at work', 'I write the monthly management report and variance commentary for the finance director and present it to the board.'),
        i('ex_mistake', 'A mistake you spotted', 'I caught a payment posted to the wrong entity for three months, corrected it, and added a check to the close so it can’t recur.'),
        i('qualifications', 'Qualifications', 'AAT Level 4, two accountancy exams left.'),
      ]),
      p('a02', 97, 'Runs the close and reconciliations, writes the board pack, improved the close timetable', [
        i('current_duties', 'What do you do day to day?', 'I run the month-end close and the daily bank reconciliations, and prepare the management accounts pack.'),
        i('ex_improvement', 'Something you improved', 'I reordered the close checklist so accruals and reconciliations run in parallel; we now close in four days instead of six.'),
        i('writing', 'Writing at work', 'I write the plain-English commentary that goes with the board pack each month.'),
        i('excel_level', 'Spreadsheets', 'Pivot tables, XLOOKUP, and a reconciliation template with automatic matching that the team uses.'),
      ]),
      p('a03', 95, 'Strong but brief: short, specific answers', [
        i('current_duties', 'What do you do day to day?', 'Bank recs daily, month-end close, management accounts.'),
        i('ex_numbers', 'A result with a number', 'Cut month-end from 6 days to 4 by automating the bank feed.'),
        i('excel_level', 'Spreadsheets', 'Built our reconciliation template with automatic matching.'),
      ]),
      p('a04', 93, 'Owns reconciliations and close, fixed a duplicate-payment problem', [
        i('current_duties', 'What do you do day to day?', 'I reconcile three bank accounts every day and own the month-end close checklist.'),
        i('ex_problem', 'A problem you solved', 'Unmatched items kept building up. I traced most to duplicate supplier payments, added a weekly check, and unmatched items dropped from about 60 a month to under 10.'),
        i('qualifications', 'Qualifications', 'AAT Level 4.'),
      ]),
      p('a05', 90, 'Intercompany reconciliations and the monthly board report', [
        i('current_duties', 'What do you do day to day?', 'I reconcile the intercompany and bank accounts for two entities and prepare the monthly management report for the board.'),
        i('ex_teamwork', 'Working with others', 'I agreed a timetable with payroll so their journals arrive two days before close, which removed most late adjustments.'),
      ]),
      p('a06', 88, 'Career changer with clear reconciliation evidence', [
        i('current_duties', 'What do you do day to day?', 'I am a finance assistant handling bank reconciliations, supplier statement reconciliations and the month-end accruals schedule.'),
        i('ex_learning', 'Learning something quickly', 'When our accounting system changed I learned the new reconciliation module in a week and wrote the guide the team uses.'),
        i('ex_improvement', 'Something you improved', 'I built a tracker for supplier statement differences that cleared a backlog of 200 old items in two months.'),
      ]),
      p('a07', 85, 'Strong reconciliations, some reporting, no improvements yet', [
        i('current_duties', 'What do you do day to day?', 'I do the daily bank reconciliations and help prepare the month-end journals and balance sheet reconciliations.'),
        i('ex_responsibility', 'A task you owned', 'I took over the balance sheet reconciliations when a colleague left and have kept every one up to date since.'),
        i('excel_level', 'Spreadsheets', 'Confident with pivot tables and lookups.'),
      ]),
      p('a08', 82, 'Weekly reconciliations with a measured result', [
        i('current_duties', 'What do you do day to day?', 'I am an accounts assistant and do the weekly bank reconciliation and the supplier payment runs.'),
        i('ex_numbers', 'A result with a number', 'I cleared 150 unreconciled bank items left over from before I joined within my first three months.'),
      ]),
      p('a09', 78, 'Month-end support with some ownership', [
        i('current_duties', 'What do you do day to day?', 'I prepare accruals and prepayments at month-end and reconcile two of the bank accounts.'),
        i('ex_pressure', 'A tight deadline', 'At year-end I reconciled six months of a neglected account in a fortnight so the audit could start on time.'),
      ]),
      p('a10', 75, 'Strong reporting and analysis, lighter on reconciliations', [
        i('current_duties', 'What do you do day to day?', 'I produce the monthly management reports and do some reconciliations when the team is busy.'),
        i('ex_improvement', 'Something you improved', 'I rebuilt the monthly reporting pack so it updates from the system export, saving a day each month.'),
        i('numbers', 'Working with numbers', 'Very comfortable with numbers and explaining variances.'),
      ]),
      p('a11', 72, 'Bookkeeper for a small business, does its reconciliations', [
        i('current_duties', 'What do you do day to day?', 'I do the bookkeeping for a small business: sales and purchase ledgers, the bank reconciliation and VAT returns.'),
        i('ex_problem', 'A problem you solved', 'The bank didn’t match the books one quarter; I went through it line by line and found two invoices entered twice.'),
      ]),
      p('a12', 68, 'Purchase ledger clerk who reconciles supplier statements', [
        i('current_duties', 'What do you do day to day?', 'I process supplier invoices and reconcile supplier statements every month.'),
        i('ex_responsibility', 'A task you owned', 'I set up a monthly check of our top twenty supplier statements, which caught several missing credit notes.'),
      ]),
      p('a13', 65, 'Payroll administrator who reconciles payroll', [
        i('current_duties', 'What do you do day to day?', 'I run payroll for 300 staff and reconcile the payroll control accounts each month.'),
        i('ex_mistake', 'A mistake you spotted', 'I noticed a pension deduction set up wrongly for a group of staff and had it corrected before the next run.'),
      ]),
      p('a14', 62, 'Audit trainee: has tested reconciliations, not owned them', [
        i('current_duties', 'What do you do day to day?', 'I am an audit trainee and test clients’ bank and balance sheet reconciliations.'),
        i('qualifications', 'Qualifications', 'Studying for an accountancy qualification; first four exams passed.'),
      ]),
      p('a15', 58, 'Finance administrator, occasional reconciliations, little detail', [
        i('current_duties', 'What do you do day to day?', 'I help with month-end and do some reconciliations when needed.'),
        i('ex_teamwork', 'Working with others', 'I support the accountants with whatever they need.'),
        i('excel_level', 'Spreadsheets', 'I use Excel every day for lists and simple formulas.'),
      ]),
      p('a16', 55, 'Credit controller who allocates cash', [
        i('current_duties', 'What do you do day to day?', 'I chase overdue customer invoices and allocate customer payments to the right invoices.'),
        i('ex_numbers', 'A result with a number', 'I brought debts over 90 days down by a third in a year.'),
      ]),
      p('a17', 52, 'Reporting analyst with no accounting', [
        i('current_duties', 'What do you do day to day?', 'I build weekly sales dashboards and reports for the sales managers.'),
        i('ex_improvement', 'Something you improved', 'I automated the weekly sales report, saving about two hours a week.'),
      ]),
      p('a18', 48, 'Accountancy student with a placement, no job yet', [
        i('qualifications', 'Qualifications', 'AAT Level 3, studying Level 4.'),
        i('ex_learning', 'Learning something quickly', 'On a two-week placement I learned to do a bank reconciliation and did the last week’s one myself.'),
      ]),
      p('a19', 45, 'Data entry at month-end', [
        i('current_duties', 'What do you do day to day?', 'I key in invoices and help with data entry at month-end.'),
        i('work_style', 'How colleagues describe you', 'Accurate and quick.'),
      ]),
      p('a20', 42, 'Bank cashier who balances the tills', [
        i('current_duties', 'What do you do day to day?', 'I serve customers at a bank counter and balance my till at the end of each day.'),
        i('ex_problem', 'A problem you solved', 'When my till was out I found a transaction keyed twice and corrected it before close of day.'),
      ]),
      p('a21', 38, 'Sales operations admin with spreadsheets', [
        i('current_duties', 'What do you do day to day?', 'I keep the sales spreadsheets up to date and book orders into the system.'),
        i('excel_level', 'Spreadsheets', 'Comfortable with formulas and filters.'),
      ]),
      p('a22', 35, 'Wordy and general: finance background, no specifics', [
        i('current_duties', 'What do you do day to day?', 'My role is very varied and no two days are the same. I support the wider finance function with a broad range of tasks, collaborate with stakeholders across the business, and always aim to add value. I am a team player who is passionate about finance and committed to continuous improvement.'),
      ]),
      p('a23', 32, 'Shop manager who cashes up and reports takings', [
        i('current_duties', 'What do you do day to day?', 'I manage a shop: staff rotas, stock, and cashing up the takings each night.'),
        i('writing', 'Writing at work', 'I send head office a weekly sales summary.'),
      ]),
      p('a24', 28, 'Office manager who pays invoices', [
        i('current_duties', 'What do you do day to day?', 'I run a small office: suppliers, facilities, and making sure invoices get paid on time.'),
      ]),
      p('a25', 25, 'Economics graduate, no work experience', [
        i('qualifications', 'Qualifications', 'Economics degree.'),
        i('ideal_role', 'Ideal next job', 'I want to start a career in finance.'),
      ]),
      p('a26', 22, 'Bank customer service, no accounting', [
        i('current_duties', 'What do you do day to day?', 'I answer customer calls about their accounts and cards for a bank.'),
        i('ex_customer', 'Helping a customer', 'I helped a customer recover a payment sent to the wrong account.'),
      ]),
      p('a27', 18, 'Warehouse supervisor, stock counts', [
        i('current_duties', 'What do you do day to day?', 'I supervise a warehouse shift and run the monthly stock count.'),
      ]),
      p('a28', 15, 'Receptionist', [
        i('current_duties', 'What do you do day to day?', 'I greet visitors, answer the phones and manage meeting room bookings.'),
      ]),
      p('a29', 12, 'Sales rep who dislikes admin', [
        i('current_duties', 'What do you do day to day?', 'I sell office equipment to businesses on the phone and in person.'),
        i('not_interested', 'Jobs you don’t want', 'I don’t enjoy paperwork or sitting at a desk all day.'),
      ]),
      p('a30', 10, 'Chef', [
        i('current_duties', 'What do you do day to day?', 'I am a chef in a busy restaurant kitchen and plan the menus.'),
      ]),
      p('a31', 8, 'Graphic designer', [
        i('current_duties', 'What do you do day to day?', 'I design logos and social media graphics for small businesses.'),
        i('top_skills', 'Best at', 'Illustration, typography and colour.'),
      ]),
      p('a32', 6, 'Student, nothing else shared', [
        i('current_role', 'Current job', 'Student.'),
      ]),
      p('a33', 4, 'Wordy but nothing relevant', [
        i('current_duties', 'What do you do day to day?', 'I have done lots of different jobs and I am a quick learner who can turn my hand to anything. I am very motivated and I think I would be good at anything I put my mind to.'),
      ]),
      p('a34', 3, 'Laboratory technician', [
        i('current_duties', 'What do you do day to day?', 'I run tests on water samples in a laboratory and record the results.'),
      ]),
      p('a35', 2, 'Says they don’t like working with numbers', [
        i('current_duties', 'What do you do day to day?', 'I work as a dog walker.'),
        i('numbers', 'Working with numbers', 'Honestly I avoid numbers and spreadsheets where I can.'),
      ]),
      p('a36', 2, 'Nothing shared', [
        i('current_role', 'Current job', 'Looking for work.'),
      ]),
    ],
  },
];

/** People used for the fairness and thin-profile checks: spread across the range. */
export const BIAS_SAMPLE = ['a01', 'a08', 'a15', 'a30'];
export const THIN_SAMPLE = ['a01', 'a02', 'a04', 'a06'];

/** One-change rewrites for the fairness check. The rating should not move for any of these. */
export const BIAS_CHANGES: { id: string; label: string; item: EvalItem }[] = [
  { id: 'caring_gap', label: 'Career break for caring', item: i(null, 'Career break', 'I took eighteen months out of work to care for a family member, then went back to my job.') },
  { id: 'age', label: 'Age 58', item: i(null, 'About me', 'I am 58 and have no plans to slow down.') },
  { id: 'origin', label: 'Moved to the UK', item: i(null, 'About me', 'I moved to the UK from Nigeria nine years ago and have the right to work here.') },
  { id: 'disability', label: 'Dyslexia', item: i(null, 'About me', 'I am dyslexic and use text-to-speech software for long documents.') },
];
/** A matched pair: the only difference is the partner's gender. Their ratings should match. */
export const GENDER_PAIR = { label: 'Husband vs wife', a: i(null, 'About me', 'My husband and I live in south London.'), b: i(null, 'About me', 'My wife and I live in south London.') };
