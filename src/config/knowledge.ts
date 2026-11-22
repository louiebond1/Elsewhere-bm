/**
 * The Knowledge Globe's areas. Every Mini Me item (a row in onboarding_answers) belongs to exactly one.
 * Checklist answers take their area from the question; extras from the candidate's choice, or else from
 * their wording. Nothing here is shown to hiring managers.
 */
export const KNOWLEDGE_CATEGORIES = [
  { key: 'work', label: 'Work and Career' },
  { key: 'education', label: 'Education' },
  { key: 'skills', label: 'Skills and Experience' },
  { key: 'personal', label: 'Personal Life' },
  { key: 'values', label: 'Values and Beliefs' },
  { key: 'interests', label: 'Interests and Hobbies' },
  { key: 'goals', label: 'Goals and Ambitions' },
  { key: 'other', label: 'Other Knowledge' },
] as const;
export type KnowledgeCategory = (typeof KNOWLEDGE_CATEGORIES)[number]['key'];
export const CATEGORY_KEYS = new Set<string>(KNOWLEDGE_CATEGORIES.map((c) => c.key));
export const CATEGORY_LABEL = Object.fromEntries(KNOWLEDGE_CATEGORIES.map((c) => [c.key, c.label])) as Record<KnowledgeCategory, string>;

/** Checklist section → area, with a few question-level exceptions. */
const BY_SECTION: Record<string, KnowledgeCategory> = { now: 'work', experience: 'work', examples: 'skills', skills: 'skills', style: 'values', next: 'goals', practical: 'work', context: 'skills', more: 'other' };
const BY_QUESTION: Record<string, KnowledgeCategory> = { qualifications: 'education', training: 'education', volunteering: 'personal', years_experience: 'skills', skills_to_grow: 'goals', ethical_judgement: 'values', support_preference: 'values', environment_preference: 'values', career_goal: 'goals' };

/** Words that place an extra in an area when the candidate hasn't chosen one. First match wins, in this order. */
const WORDING: [KnowledgeCategory, RegExp][] = [
  ['education', /\b(degree|universit|college|school|gcse|a[- ]level|a course\b|courses|qualif|studied|studying|diploma|certificat|apprentice|exam)/i],
  ['interests', /\b(hobb|weekend|spare time|free time|for fun|enjoy (?:playing|reading|cooking|running)|travel|holiday|sport|football|music|gym|hiking|cooking|baking|gaming|photograph|gardening|films?\b)/i],
  ['goals', /\b(goal|ambition|aspir|long[- ]term|in five years|in 5 years|career plan|want to become|hope to|next step|dream job)/i],
  ['values', /\b(value|believe|belief|principle|ethic|integrity|honest|fairness|important to me|matters to me|care about)/i],
  ['personal', /\b(family|grew up|home life|personal|my life|moved to|live in|parent|partner|children|kids|community|volunteer)/i],
  ['skills', /\b(skill|excel|software|tool|good at|best at|strength|experience with|fluent|language|certif)/i],
  ['work', /\b(job|role|work|career|team|manager|employer|company|client|project|office|salary|notice)/i],
];

/** `texts` are tried in order (the topic first, then the detail), so a clear heading wins over passing words. */
export function categoryOf(key: string, sectionKey: string | null, texts: string[], chosen: string | null): { category: KnowledgeCategory; chosen: boolean } {
  if (chosen && CATEGORY_KEYS.has(chosen)) return { category: chosen as KnowledgeCategory, chosen: true };
  if (BY_QUESTION[key]) return { category: BY_QUESTION[key], chosen: false };
  if (sectionKey && sectionKey !== 'more' && BY_SECTION[sectionKey]) return { category: BY_SECTION[sectionKey], chosen: false };
  for (const text of texts) for (const [c, re] of WORDING) if (re.test(text)) return { category: c, chosen: false };
  return { category: 'other', chosen: false };
}

/** Starter questions for "Ask Mini Me": general, so they never assume anything about the person. */
export const ASK_STARTERS = ['Tell me about yourself', 'What are your biggest strengths?', 'What do you know about my career?', 'What information are you missing?'];
