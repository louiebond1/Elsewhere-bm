import { z } from 'zod';
import { TAXONOMY } from '../../services/inputs';

export const questionTopics = ['experience', 'ownership', 'outcome', 'collaboration', 'learning', 'constraints', 'clarification'] as const;

export const questionOutput = z.object({ question: z.string().max(300), topic: z.enum(questionTopics), reason: z.string().max(180) });
export type QuestionOutput = z.infer<typeof questionOutput>;

export const extractionOutput = z.object({
  items: z.array(z.object({
    sourceId: z.string(),
    quote: z.string(),
    claim: z.string().max(600),
    safeClaim: z.string().max(400),
    tags: z.array(z.enum(TAXONOMY)).max(8),
    outcome: z.string().nullable(),
    uncertainty: z.string().nullable(),
    strength: z.enum(['specific', 'partial', 'assertion']),
  })).max(12),
  conflicts: z.array(z.object({ sourceIds: z.array(z.string()), description: z.string() })),
});
export type ExtractionOutput = z.infer<typeof extractionOutput>;

export const feedbackOutput = z.object({
  strengths: z.array(z.object({ text: z.string().max(300), evidenceIds: z.array(z.string()).min(1) })).max(3),
  gaps: z.array(z.object({ text: z.string().max(300), topic: z.enum(questionTopics) })).max(3),
  nextQuestion: z.string().max(300),
});
export type FeedbackOutput = z.infer<typeof feedbackOutput>;

export const assessmentOutput = z.object({
  criteria: z.array(z.object({ criterionId: z.string(), level: z.enum(['specific', 'partial', 'unknown', 'contradictory']), evidenceIds: z.array(z.string()), reasonSafe: z.string().max(240) })),
});
export type AssessmentOutput = z.infer<typeof assessmentOutput>;

export const roleStructureOutput = z.object({
  outcomes: z.array(z.string().max(300)).max(6),
  teachableSkills: z.array(z.string().max(120)).max(8),
  criteria: z.array(z.object({ key: z.string(), label: z.string().max(80), description: z.string().max(400), importance: z.enum(['essential', 'desirable']), weight: z.number().int().min(1).max(5), evidenceTags: z.array(z.enum(TAXONOMY)).min(1).max(8) })).max(6),
  warnings: z.array(z.string().max(300)),
});
export type RoleStructureOutput = z.infer<typeof roleStructureOutput>;
