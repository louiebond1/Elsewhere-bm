/**
 * Deterministic fixture provider, labelled "Demo responses" in the UI.
 * It never pretends to analyse novel information: unknown text produces one
 * plain draft item per answer quoting the candidate's own first sentence, with
 * no tags and assertion strength, for the candidate to edit and tag.
 */
import { TOPIC_BANK } from '../prompts';
import { FIXTURE_EXTRACTIONS } from '../../../../fixtures/ai-fixtures';
import { AiFailure, type AiProvider, type Usage } from './types';

const usage: Usage = { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0, modelId: 'fixture' };
const firstSentence = (t: string) => (t.match(/^[^.!?]*[.!?]/)?.[0] ?? t).trim().slice(0, 400);

/** Test hook: the next N fixture calls of a task fail with a timeout (used by scenario S23). */
const failNext = new Map<string, number>();
export function fixtureFailNext(task: string, n = 1) {
  failNext.set(task, n);
}
function maybeFail(task: string) {
  const n = failNext.get(task) ?? 0;
  if (n > 0) {
    failNext.set(task, n - 1);
    throw new AiFailure('timeout', 'Demo responses: simulated timeout', true);
  }
}

export const fixtureProvider: AiProvider = {
  name: 'fixture',
  async nextQuestion(i) {
    maybeFail('question');
    return { provider: 'fixture', usage, output: { question: TOPIC_BANK[i.topic] ?? TOPIC_BANK.experience, topic: i.topic as never, reason: 'A specific example helps employers understand what you did.' } };
  },
  async extractEvidence(i) {
    maybeFail('extract');
    const items = [];
    for (const s of i.sources) {
      const known = FIXTURE_EXTRACTIONS.find((f) => s.text.trim() === f.answer.trim());
      if (known) {
        items.push({ sourceId: s.id, quote: known.quote, claim: known.claim, safeClaim: known.safeClaim, tags: known.tags as never, outcome: known.outcome, uncertainty: known.uncertainty, strength: known.strength });
      } else if (s.kind === 'answer') {
        const q = firstSentence(s.text);
        items.push({ sourceId: s.id, quote: q, claim: q, safeClaim: '', tags: [], outcome: null, uncertainty: 'Demo responses: this answer was not analysed. Add tags and a client-safe summary yourself.', strength: 'assertion' as const });
      }
    }
    return { provider: 'fixture', usage, output: { items: items.slice(0, 12), conflicts: [] } };
  },
  async feedback(i) {
    maybeFail('feedback');
    const specific = i.evidence.filter((e) => e.strength === 'specific').slice(0, 3);
    const strengths = specific.map((e) => ({ text: `You have shown a specific example: ${e.safeClaim}`, evidenceIds: [e.id] }));
    const covered = new Set(i.evidence.flatMap((e) => e.tags));
    const gaps = [] as { text: string; topic: 'outcome' | 'collaboration' | 'learning' }[];
    if (!i.evidence.some((e) => e.strength === 'specific')) gaps.push({ text: 'Add an example of what happened after you acted, with a result you can describe.', topic: 'outcome' });
    if (!covered.has('coordination') && !covered.has('leadership')) gaps.push({ text: 'Add an example of working with other people to get something done.', topic: 'collaboration' });
    if (!covered.has('learning')) gaps.push({ text: 'Add an example of something you had to learn quickly.', topic: 'learning' });
    return { provider: 'fixture', usage, output: { strengths, gaps: gaps.slice(0, 3), nextQuestion: TOPIC_BANK[gaps[0]?.topic ?? 'outcome'] } };
  },
  async assessCriteria(i) {
    maybeFail('assess');
    const criteria = i.criteria.map((c) => {
      const rel = i.evidence.filter((e) => e.tags.some((t) => c.evidenceTags.includes(t)));
      const spec = rel.filter((e) => e.strength === 'specific');
      const level = spec.length ? 'specific' : rel.length ? 'partial' : 'unknown';
      const ids = (spec.length ? spec : rel).map((e) => e.id);
      const reasonSafe = level === 'specific' ? `Gave a real example of ${c.label.toLowerCase()}, with the result.` : level === 'partial' ? 'Gave a related example, but not much detail on the result.' : `We haven’t seen evidence of ${c.label.toLowerCase()} yet.`;
      return { criterionId: c.criterionId, level: level as 'specific' | 'partial' | 'unknown', evidenceIds: ids, reasonSafe };
    });
    return { provider: 'fixture', usage, output: { criteria } };
  },
  async hiringTurn() {
    // Demo mode never calls this: the hiring assistant uses the labelled keyword reader instead.
    throw new AiFailure('not_supported', 'Demo responses: the hiring assistant uses keyword matching in demo mode.');
  },
  async structureRole(i) {
    maybeFail('role');
    return { provider: 'fixture', usage, output: { outcomes: [firstSentence(i.brief) || i.title], teachableSkills: ['Our internal systems', 'Our reporting format'], criteria: [], warnings: ['Demo responses: the brief was not analysed. Write 3 to 6 criteria yourself.'] } };
  },
};
