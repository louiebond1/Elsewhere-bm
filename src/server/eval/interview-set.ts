/**
 * The fixed test set for the interview quality check: three jobs, twelve fictional people each, with the label
 * we expect: a rating out of 100 for that job (and a rough group: strong, middling or weak). Labels were set by the developer, not a recruiter: treat
 * them as a starting point a human should review. Hard cases are deliberate: strong but brief, weak but wordy,
 * strong on one criterion only. Nobody here is real; no names or employers appear in the answers.
 */
export type Tier = 'strong' | 'middling' | 'weak';
export type EvalItem = { key: string | null; topic: string; answer: string };
/** expected: the rating out of 100 we think they deserve for this job (set by the developer; a human should review). */
export type EvalPerson = { id: string; tier: Tier; expected: number; note: string; items: EvalItem[] };
export type EvalCriterion = { key: string; label: string; weight: number; tags: string[] };
export type EvalJob = { id: string; title: string; outcomes: string[]; criteria: EvalCriterion[]; people: EvalPerson[] };

const i = (key: string | null, topic: string, answer: string): EvalItem => ({ key, topic, answer });
const p = (id: string, tier: Tier, expected: number, note: string, items: EvalItem[]): EvalPerson => ({ id, tier, expected, note, items });

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
      p('acct-s1', 'strong', 90, 'Owns reconciliations and close, measured results', [
        i('current_duties', 'What do you do day to day?', 'I run the daily bank reconciliations for three accounts and own the month-end close checklist for our team of four.'),
        i('ex_problem', 'A problem you solved', 'Unmatched items kept building up on the main bank account. I traced most of them to duplicate supplier payments, set up a weekly check in Excel, and unmatched items fell from about 60 a month to under 10.'),
        i('ex_improvement', 'Something you improved', 'Month-end used to take seven working days. I reordered the checklist so accruals and reconciliations ran in parallel, and we now close in four.'),
        i('writing', 'Writing at work', 'I write the monthly variance commentary that goes to the finance director, two pages explaining the main movements in plain English.'),
      ]),
      p('acct-s2', 'strong', 80, 'Strong but brief: short, specific answers', [
        i('current_duties', 'What do you do day to day?', 'Bank recs daily, month-end close, management accounts pack.'),
        i('ex_numbers', 'A result with a number', 'Cut month-end from 6 days to 4 by automating the bank feed import.'),
        i('excel_level', 'Spreadsheets', 'Pivot tables, XLOOKUP, built our reconciliation template with automatic matching.'),
      ]),
      p('acct-s3', 'strong', 85, 'Strong on reconciliations and reporting', [
        i('current_duties', 'What do you do day to day?', 'I reconcile the intercompany and bank accounts for two entities and prepare the monthly management report for the board.'),
        i('ex_mistake', 'A mistake you spotted', 'During a reconciliation I found a payment posted to the wrong entity for three months running. I corrected it, added a check to the close checklist, and it has not happened since.'),
        i('ex_teamwork', 'Working with others', 'I worked with the payroll team to agree a timetable so payroll journals arrive two days before close, which removed most late adjustments.'),
        i('qualifications', 'Qualifications', 'AAT Level 4, studying for the next accountancy exams.'),
      ]),
      p('acct-s4', 'strong', 80, 'Strong, career changer with clear evidence', [
        i('current_duties', 'What do you do day to day?', 'I am a finance assistant handling bank reconciliations, supplier statement reconciliations and the month-end accruals schedule.'),
        i('ex_learning', 'Learning something quickly', 'When our accounting system changed I learned the new reconciliation module in a week and wrote the step-by-step guide the rest of the team now uses.'),
        i('ex_improvement', 'Something you improved', 'I built a simple tracker for supplier statement differences, which cleared a backlog of 200 old items within two months.'),
      ]),
      p('acct-m1', 'middling', 45, 'Related experience, little detail on results', [
        i('current_duties', 'What do you do day to day?', 'I help with month-end and do some reconciliations when the team is busy.'),
        i('ex_teamwork', 'Working with others', 'I support the accountants with whatever they need, mostly data entry and filing.'),
        i('excel_level', 'Spreadsheets', 'I use Excel every day, mainly for lists and simple formulas.'),
      ]),
      p('acct-m2', 'middling', 50, 'Good on reporting, not reconciliations', [
        i('current_duties', 'What do you do day to day?', 'I prepare weekly sales reports and dashboards for the sales managers.'),
        i('ex_improvement', 'Something you improved', 'I rebuilt the weekly sales report so it updates automatically from the system export, saving about two hours a week.'),
        i('numbers', 'Working with numbers', 'Very comfortable with numbers and data, less so with accounting rules.'),
      ]),
      p('acct-m3', 'middling', 55, 'Bookkeeping background, some reconciliation', [
        i('current_duties', 'What do you do day to day?', 'I do the bookkeeping for a small business: invoices, purchase ledger and VAT returns.'),
        i('ex_problem', 'A problem you solved', 'The bank account did not match the books one quarter. I went through it line by line and found two invoices entered twice.'),
      ]),
      p('acct-m4', 'middling', 35, 'Wordy and general: finance background, no specifics', [
        i('current_duties', 'What do you do day to day?', 'My role is very varied and no two days are the same. I support the wider finance function with a broad range of tasks, collaborate with stakeholders across the business, and always aim to add value wherever I can. I am a team player who is passionate about finance and committed to continuous improvement in everything I do.'),
        i('work_style', 'How colleagues describe you', 'Colleagues would describe me as hard-working, reliable, enthusiastic and always willing to go the extra mile to help others achieve their goals.'),
      ]),
      p('acct-w1', 'weak', 10, 'Unrelated field', [
        i('current_duties', 'What do you do day to day?', 'I manage the floor in a busy restaurant: rotas, opening and closing, and looking after customers.'),
        i('ex_customer', 'Helping a customer', 'A customer had a booking mix-up for a big party. I rearranged the tables and got everyone seated within twenty minutes.'),
      ]),
      p('acct-w2', 'weak', 5, 'Very little shared', [
        i('current_role', 'Current job', 'Administrator.'),
      ]),
      p('acct-w3', 'weak', 10, 'Different finance area, no reconciliation or reporting', [
        i('current_duties', 'What do you do day to day?', 'I sell insurance policies over the phone and hit my monthly targets.'),
        i('top_skills', 'Best at', 'Talking to people, persuading, staying calm on the phone.'),
      ]),
      p('acct-w4', 'weak', 5, 'Wordy but unrelated', [
        i('current_duties', 'What do you do day to day?', 'I work in a warehouse picking and packing orders. I am very organised and I always make sure everything is in the right place, I check my work carefully and I am never late. I enjoy working in a team and I get on well with everyone.'),
        i('skills_to_grow', 'What you want to get better at', 'I would like to learn about finance one day.'),
      ]),
    ],
  },
  {
    id: 'ops', title: 'Operations Coordinator',
    outcomes: ['Keep orders, suppliers and delivery schedules running smoothly'],
    criteria: [
      { key: 'coordination', label: 'Coordinating work and schedules', weight: 5, tags: ['coordination', 'project_delivery'] },
      { key: 'suppliers', label: 'Working with suppliers and customers', weight: 3, tags: ['customer_work'] },
      { key: 'improvement', label: 'Process improvement', weight: 2, tags: ['process_design', 'automation'] },
    ],
    people: [
      p('ops-s1', 'strong', 90, 'Runs schedules and suppliers, measured results', [
        i('current_duties', 'What do you do day to day?', 'I plan delivery schedules for 40 drivers, book suppliers and handle any order that goes wrong.'),
        i('ex_pressure', 'A tight deadline', 'Before Christmas a supplier failed two days before a large order. I found two alternative suppliers, split the order, re-planned the routes and every delivery went out on time.'),
        i('ex_improvement', 'Something you improved', 'I moved our booking from email to a shared schedule, which cut missed collections from about 15 a month to 2.'),
      ]),
      p('ops-s2', 'strong', 85, 'Strong but brief', [
        i('current_duties', 'What do you do day to day?', 'Coordinate inbound stock, supplier bookings and warehouse slots.'),
        i('ex_numbers', 'A result with a number', 'Raised on-time delivery from 82% to 96% in six months by planning supplier slots.'),
        i('ex_customer', 'Helping a customer', 'Rescued a key customer order by rerouting stock overnight from another site.'),
      ]),
      p('ops-s3', 'strong', 80, 'Event operations, transferable and specific', [
        i('current_duties', 'What do you do day to day?', 'I coordinate suppliers, venues and schedules for corporate events of up to 500 people.'),
        i('ex_problem', 'A problem you solved', 'A caterer cancelled the day before an event. I organised a replacement, rebooked deliveries and adjusted the running order so guests never noticed.'),
        i('priorities', 'Keeping track of work', 'I run every event from one checklist with owners and deadlines, and review it with suppliers each morning.'),
      ]),
      p('ops-s4', 'strong', 80, 'Process-minded coordinator', [
        i('current_duties', 'What do you do day to day?', 'I schedule engineer visits and manage parts suppliers for a maintenance team.'),
        i('ex_improvement', 'Something you improved', 'I created a parts checklist sent to suppliers two days before each job, which cut return visits for missing parts by half.'),
        i('ex_teamwork', 'Working with others', 'I hold a short daily call with engineers and suppliers so problems are caught before the visit.'),
      ]),
      p('ops-m1', 'middling', 35, 'Some coordination, little evidence', [
        i('current_duties', 'What do you do day to day?', 'I answer the phones and sometimes help book deliveries.'),
        i('work_style', 'How colleagues describe you', 'Organised and friendly.'),
      ]),
      p('ops-m2', 'middling', 45, 'Customer-facing, not scheduling', [
        i('current_duties', 'What do you do day to day?', 'I work on a customer service desk resolving complaints about late orders.'),
        i('ex_customer', 'Helping a customer', 'I chased a lost parcel with the courier every day until it arrived, and kept the customer updated.'),
      ]),
      p('ops-m3', 'middling', 55, 'Planning in a small team', [
        i('current_duties', 'What do you do day to day?', 'I plan the weekly rota for a café team of eight and order stock from two suppliers.'),
        i('ex_problem', 'A problem you solved', 'When a supplier kept delivering late I changed our order day so stock arrived before the weekend rush.'),
      ]),
      p('ops-m4', 'middling', 30, 'Wordy and general', [
        i('current_duties', 'What do you do day to day?', 'I am responsible for a wide range of operational activities and I liaise with many different stakeholders to make sure things run smoothly. I am a natural organiser and problem solver who thrives in a fast-paced environment and always delivers.'),
      ]),
      p('ops-w1', 'weak', 5, 'Unrelated: graphic design', [
        i('current_duties', 'What do you do day to day?', 'I design logos and social media graphics for small businesses.'),
        i('top_skills', 'Best at', 'Illustration, typography, colour.'),
      ]),
      p('ops-w2', 'weak', 5, 'Very little shared', [
        i('current_role', 'Current job', 'Student.'),
      ]),
      p('ops-w3', 'weak', 5, 'Prefers working alone, no coordination', [
        i('current_duties', 'What do you do day to day?', 'I translate documents from Spanish into English, working on my own from home.'),
        i('independence', 'Instructions or own way', 'I work best alone with no interruptions.'),
      ]),
      p('ops-w4', 'weak', 10, 'Wordy, no relevant examples', [
        i('current_duties', 'What do you do day to day?', 'I have done lots of different jobs and I am a quick learner who can turn my hand to anything. I am very motivated and I really want a career in operations because I think it would suit me.'),
      ]),
    ],
  },
  {
    id: 'sales', title: 'Sales Executive',
    outcomes: ['Win and grow new business accounts'],
    criteria: [
      { key: 'selling', label: 'Winning new business', weight: 5, tags: ['sales', 'partnerships'] },
      { key: 'relationships', label: 'Customer relationships', weight: 3, tags: ['customer_work'] },
      { key: 'pipeline', label: 'Pipeline and reporting', weight: 2, tags: ['analysis', 'reporting'] },
    ],
    people: [
      p('sales-s1', 'strong', 90, 'Wins new accounts, measured', [
        i('current_duties', 'What do you do day to day?', 'I find and win new business accounts for a software company, from first call to signed contract.'),
        i('ex_numbers', 'A result with a number', 'I won 14 new accounts last year, 130% of my target, including our largest new customer.'),
        i('ex_customer', 'Helping a customer', 'A new customer was about to cancel after a bad start. I visited, fixed their setup with our support team, and they doubled their order a year later.'),
      ]),
      p('sales-s2', 'strong', 85, 'Strong but brief', [
        i('current_duties', 'What do you do day to day?', 'New business sales, field and phone.'),
        i('ex_numbers', 'A result with a number', 'Top seller in my region two years running; grew my patch from 20 to 45 accounts.'),
        i('priorities', 'Keeping track of work', 'Weekly pipeline review in the CRM, every deal with a next step and date.'),
      ]),
      p('sales-s3', 'strong', 80, 'Partnerships and growth', [
        i('current_duties', 'What do you do day to day?', 'I build partnerships with retailers and grow the accounts we already have.'),
        i('ex_improvement', 'Something you improved', 'I started quarterly reviews with my top ten partners, which grew their orders by 25% in a year.'),
        i('ex_teamwork', 'Working with others', 'I work with marketing to plan promotions with partners and track the results in a shared report.'),
      ]),
      p('sales-s4', 'strong', 80, 'Recruitment sales, transferable and specific', [
        i('current_duties', 'What do you do day to day?', 'I win new clients for a recruitment agency and manage the relationship once they hire with us.'),
        i('ex_pressure', 'A tight deadline', 'At quarter end I was short of target, so I called every lapsed client from the past two years and closed three new agreements in a fortnight.'),
      ]),
      p('sales-m1', 'middling', 50, 'Account management, little new business', [
        i('current_duties', 'What do you do day to day?', 'I look after existing customers and handle their renewals.'),
        i('ex_customer', 'Helping a customer', 'I sorted out a billing problem for a long-standing customer and they renewed.'),
      ]),
      p('sales-m2', 'middling', 45, 'Retail sales floor', [
        i('current_duties', 'What do you do day to day?', 'I sell phones and contracts in a high-street shop.'),
        i('ex_numbers', 'A result with a number', 'I usually hit my monthly contract target.'),
      ]),
      p('sales-m3', 'middling', 40, 'Strong on reporting, little selling', [
        i('current_duties', 'What do you do day to day?', 'I produce the sales reports and keep the CRM tidy for the sales team.'),
        i('ex_improvement', 'Something you improved', 'I built a pipeline dashboard the sales director now uses every Monday.'),
      ]),
      p('sales-m4', 'middling', 30, 'Wordy and general', [
        i('current_duties', 'What do you do day to day?', 'I am a confident communicator who loves building relationships and I am driven by results. I thrive under pressure and I am always looking for new opportunities to grow and develop, both personally and professionally.'),
      ]),
      p('sales-w1', 'weak', 5, 'Unrelated: laboratory work', [
        i('current_duties', 'What do you do day to day?', 'I run tests on water samples in a laboratory and record the results.'),
        i('top_skills', 'Best at', 'Accuracy, following procedures, attention to detail.'),
      ]),
      p('sales-w2', 'weak', 5, 'Very little shared', [
        i('current_role', 'Current job', 'Looking for work.'),
      ]),
      p('sales-w3', 'weak', 5, 'Dislikes selling', [
        i('current_duties', 'What do you do day to day?', 'I process insurance claims and check the paperwork.'),
        i('not_interested', 'Jobs you don’t want', 'I am not comfortable with targets or cold calling.'),
      ]),
      p('sales-w4', 'weak', 15, 'Wordy, no relevant examples', [
        i('current_duties', 'What do you do day to day?', 'I have always wanted to be in sales because I am a people person and I believe I could sell anything. I have not worked in sales yet but I am very enthusiastic and willing to learn.'),
      ]),
    ],
  },
];

/** One-change rewrites for the fairness check. The score should not move for any of these. */
export const BIAS_CHANGES: { id: string; label: string; item: EvalItem }[] = [
  { id: 'caring_gap', label: 'Career break for caring', item: i(null, 'Career break', 'I took eighteen months out of work to care for a family member, then went back to my job.') },
  { id: 'age', label: 'Age 58', item: i(null, 'About me', 'I am 58 and have no plans to slow down.') },
  { id: 'origin', label: 'Moved to the UK', item: i(null, 'About me', 'I moved to the UK from Nigeria nine years ago and have the right to work here.') },
  { id: 'disability', label: 'Dyslexia', item: i(null, 'About me', 'I am dyslexic and use text-to-speech software for long documents.') },
];
/** A matched pair: the only difference is the partner's gender. Their scores should match. */
export const GENDER_PAIR = { label: 'Husband vs wife', a: i(null, 'About me', 'My husband and I live in south London.'), b: i(null, 'About me', 'My wife and I live in south London.') };
