/** Exploration leads are questions, never candidate facts or scoring evidence. */
export type InterviewItem = { id: string; text: string };
export type FollowUp = { key: null; question: string; section: string; kind: 'follow_up'; targetKey: string; evidenceIds: string[]; reason: string };
export function contextFollowUps(items: InterviewItem[], coveredKeys = new Set<string>()): FollowUp[] {
  const out: FollowUp[] = [];
  const add = (item: InterviewItem, question: string, reason: string, targetKey: string) => out.push({ key: null, question, section: 'Understand the experience', kind: 'follow_up', targetKey, evidenceIds: [item.id], reason });
  for (const item of items) {
    const t = item.text;
    if (/sweatshop|unsafe working|harsh conditions|worker exploitation/i.test(t)) add(item, 'What conditions did you directly experience, what responsibility did you have, and what did you personally do in response?', 'The description suggests conditions worth exploring; it does not establish hardship, character or good judgement.', 'difficult_conditions');
    else if (/factory|manufactur|production floor/i.test(t) && t.split(/\s+/).length < 45) add(item, 'What was the day-to-day operation like, what resources and support did you have, and what work did you personally own?', 'Understand the actual operation without inferring conditions from its location.', 'operating_context');
    if (/youngest|oldest/i.test(t)) add(item, 'What was it like joining that team? Tell me about a time you built trust or adapted how you communicated.', 'Explore team experience without inferring first job, seniority, ability or personality from age.', 'team_entry');
    if (/CFO|chief financial|multinational|million|group controller/i.test(t) && t.split(/\s+/).length < 45) add(item, 'Can you walk me through a difficult decision you personally made in that role: what was at stake, who else was involved and what happened?', 'A title, brand or business size does not establish personal contribution or an easy working life.', 'decision_authority');
  }
  // Do not repeat a question the person has already answered as a named follow-up item.
  return out.filter((q, i) => !coveredKeys.has(q.targetKey) && out.findIndex((x) => x.question === q.question) === i && !items.some((it) => it.text.includes(q.question + '\n')));
}
