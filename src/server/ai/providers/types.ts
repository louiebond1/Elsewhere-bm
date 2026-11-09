import type { QuestionOutput, ExtractionOutput, FeedbackOutput, AssessmentOutput, RoleStructureOutput, HiringTurnOutput } from '../schemas';

export type Usage = { inputTokens: number; outputTokens: number; cacheReadTokens: number; cacheWriteTokens: number; modelId: string };
export type AiResult<T> = { output: T; usage: Usage; provider: 'fixture' | 'anthropic' };

export type QuestionInput = { topic: string; recentMessages: { role: 'assistant' | 'user'; text: string }[]; evidenceSummary: string[] };
export type ExtractionInput = { sources: { id: string; kind: 'cv' | 'answer'; text: string }[] };
export type FeedbackInput = { evidence: { id: string; safeClaim: string; tags: string[]; strength: string }[] };
export type AssessInput = { criteria: { criterionId: string; label: string; description: string; evidenceTags: string[] }[]; evidence: { id: string; safeClaim: string; tags: string[]; strength: string; uncertainty: string | null }[] };
export type RoleInput = { brief: string; title: string };
export type HiringTurnInput = { messages: { role: 'assistant' | 'user'; text: string }[]; understanding: unknown; memory: string[]; missing: string[] };

export interface AiProvider {
  name: 'fixture' | 'anthropic';
  nextQuestion(i: QuestionInput): Promise<AiResult<QuestionOutput>>;
  extractEvidence(i: ExtractionInput): Promise<AiResult<ExtractionOutput>>;
  feedback(i: FeedbackInput): Promise<AiResult<FeedbackOutput>>;
  assessCriteria(i: AssessInput, opts?: { review?: boolean }): Promise<AiResult<AssessmentOutput>>;
  structureRole(i: RoleInput): Promise<AiResult<RoleStructureOutput>>;
  /** Live only. Demo mode uses the deterministic reader in src/lib/hiring.ts instead. */
  hiringTurn(i: HiringTurnInput): Promise<AiResult<HiringTurnOutput>>;
}

export class AiFailure extends Error {
  constructor(public code: string, message: string, public retryable = false) {
    super(message);
  }
}
