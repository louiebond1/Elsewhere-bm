/**
 * The onboarding checklist a candidate's own AI (or the candidate) fills in on day one.
 * Deliberately excludes anything an employer must not ask or use: age, health, disability,
 * family or caring situation, religion, ethnicity, nationality beyond right to work, and so on.
 * Answers are the candidate's own words; they approve each one before it is used.
 */
export type OnboardingQuestion = { key: string; text: string; hint?: string; label?: string };
export type OnboardingSection = { key: string; title: string; questions: OnboardingQuestion[] };

export const ONBOARDING: OnboardingSection[] = [
  { key: 'now', title: 'Where you are now', questions: [
    { key: 'current_role', text: 'What is your current or most recent job title?' },
    { key: 'current_duties', text: 'In a few sentences, what do you do day to day in that job?' },
    { key: 'time_in_role', text: 'How long have you been in that role?' },
    { key: 'why_move', text: 'Why are you open to a new job right now?' },
    { key: 'employment_status', text: 'Are you employed, between jobs, studying, or something else?' },
    { key: 'team_size', text: 'How big is the team you work in, and who do you report to (job title only)?' },
  ] },
  { key: 'experience', title: 'Your experience', questions: [
    { key: 'past_roles', text: 'List your previous jobs: title, type of company (not the name) and roughly how long.' },
    { key: 'industries', text: 'Which industries or sectors have you worked in?' },
    { key: 'years_experience', text: 'How many years of work experience do you have in total?' },
    { key: 'qualifications', text: 'What qualifications do you have, or are you working towards?', hint: 'For example a degree, AAT, ACCA, CIPD or an apprenticeship.' },
    { key: 'training', text: 'Any courses or training you’ve done that are useful at work?' },
    { key: 'volunteering', text: 'Any volunteering or responsibilities outside work that show useful skills?' },
  ] },
  { key: 'examples', title: 'Things you’ve done', questions: [
    { key: 'ex_responsibility', text: 'Tell us about a task you took responsibility for. What did you do and what happened?' },
    { key: 'ex_improvement', text: 'Describe something you improved at work. What changed because of you?' },
    { key: 'ex_problem', text: 'Tell us about a problem you solved. How did you work it out?' },
    { key: 'ex_teamwork', text: 'Describe working with other people to get something done.' },
    { key: 'ex_pressure', text: 'Tell us about a time you had a tight deadline or a lot on. How did you handle it?' },
    { key: 'ex_mistake', text: 'Tell us about a mistake you made or spotted, and what you did about it.' },
    { key: 'ex_learning', text: 'Describe a time you had to learn something new quickly.' },
    { key: 'ex_proud', text: 'What piece of work are you most proud of, and why?' },
    { key: 'ex_numbers', text: 'Is there a result you can put a number on (time saved, errors cut, money, volume)?', hint: 'Only if it’s true. Leave a gap if you don’t know the number.' },
    { key: 'ex_customer', text: 'Tell us about helping a customer, client or colleague with something tricky.' },
  ] },
  { key: 'skills', title: 'Skills and tools', questions: [
    { key: 'top_skills', text: 'What are the three things you’re best at in your work?' },
    { key: 'software', text: 'Which software and systems do you use confidently?', hint: 'For example Excel, Xero, Sage, SAP, Salesforce.' },
    { key: 'excel_level', text: 'How good are you with spreadsheets? What’s the most advanced thing you do?' },
    { key: 'numbers', text: 'How comfortable are you working with numbers and data?' },
    { key: 'writing', text: 'What kind of writing do you do at work (emails, reports, notes)?' },
    { key: 'languages', text: 'Do you speak any languages other than English well enough to use at work?' },
    { key: 'skills_to_grow', text: 'What would you like to get better at in your next job?' },
  ] },
  { key: 'style', title: 'How you like to work', questions: [
    { key: 'work_style', text: 'How would colleagues describe the way you work?' },
    { key: 'best_environment', text: 'What kind of team or workplace brings out your best?' },
    { key: 'manager_style', text: 'What kind of manager do you work best with?' },
    { key: 'independence', text: 'Do you prefer clear instructions, or working things out on your own?' },
    { key: 'feedback', text: 'Tell us about a time you received feedback and what you did with it.' },
    { key: 'priorities', text: 'How do you keep track of your work and decide what to do first?' },
  ] },
  { key: 'next', title: 'Your next job', questions: [
    { key: 'ideal_role', text: 'Describe your ideal next job in a few sentences.' },
    { key: 'role_types', text: 'Which job titles would you be happy to be considered for?' },
    { key: 'six_months', text: 'What would you like to own or be responsible for six months into a new job?' },
    { key: 'not_interested', text: 'Is there any kind of job or company you definitely don’t want?' },
    { key: 'career_goal', text: 'Where would you like your career to be in three years?' },
    { key: 'deal_breakers', text: 'What would make you turn a job down?' },
  ] },
  { key: 'practical', title: 'Practical details', questions: [
    { key: 'salary', text: 'What salary are you looking for? What is the lowest you’d accept?' },
    { key: 'notice', text: 'How much notice do you need to give, or when could you start?' },
    { key: 'location', text: 'Where are you based, and how far are you happy to travel?' },
    { key: 'work_mode', text: 'Office, hybrid or remote: what works for you, and how many office days?' },
    { key: 'hours', text: 'Full-time or part-time? Any hours you need?' },
    { key: 'right_to_work', text: 'Do you have the right to work in the UK?', hint: 'Just yes or no; you don’t need to explain your status here.' },
  ] },
  { key: 'more', title: 'Anything else', questions: [
    { key: 'gaps', text: 'Any gaps in your work history you’d like to explain in your own words?', hint: 'Optional. You don’t have to give a reason.' },
    { key: 'extra', text: 'Is there anything else an employer should know about what you can do?' },
    { key: 'questions_for_employers', text: 'What would you most want to ask a new employer?' },
  ] },
];

/** Short topic names, so people see "Work travel" rather than a form question. */
export const TOPIC_LABELS: Record<string, string> = {"current_role": "Current job", "current_duties": "Day to day", "time_in_role": "Time in the job", "why_move": "Why move now", "employment_status": "Work status", "team_size": "Team and manager", "past_roles": "Past jobs", "industries": "Industries", "years_experience": "Years of experience", "qualifications": "Qualifications", "training": "Courses and training", "volunteering": "Outside work", "ex_responsibility": "Taking responsibility", "ex_improvement": "Making things better", "ex_problem": "Solving a problem", "ex_teamwork": "Working with others", "ex_pressure": "Under pressure", "ex_mistake": "Handling a mistake", "ex_learning": "Learning fast", "ex_proud": "Proudest work", "ex_numbers": "Results in numbers", "ex_customer": "Helping people", "top_skills": "Best at", "software": "Software", "excel_level": "Spreadsheets", "numbers": "Numbers and data", "writing": "Writing", "languages": "Languages", "skills_to_grow": "Want to get better at", "work_style": "How they work", "best_environment": "Best environment", "manager_style": "Ideal manager", "independence": "Independence", "feedback": "Taking feedback", "priorities": "Staying organised", "ideal_role": "Ideal next job", "role_types": "Job titles", "six_months": "First six months", "not_interested": "Not interested in", "career_goal": "Three-year goal", "deal_breakers": "Deal-breakers", "salary": "Salary", "notice": "Notice period", "location": "Location", "work_mode": "Office or remote", "hours": "Hours", "right_to_work": "Right to work", "gaps": "Career gaps", "extra": "Anything else", "questions_for_employers": "Questions for employers"};

export const ONBOARDING_QUESTIONS = ONBOARDING.flatMap((s) => s.questions.map((q) => ({ ...q, section: s.key, sectionTitle: s.title })));
export const ONBOARDING_KEYS = new Set(ONBOARDING_QUESTIONS.map((q) => q.key));
export const MAX_ONBOARDING_ANSWER = 1500;
