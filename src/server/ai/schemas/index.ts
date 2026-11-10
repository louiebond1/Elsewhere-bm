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

const hiringItem = z.object({ label: z.string().max(80), tags: z.array(z.enum(TAXONOMY)).min(1).max(8) });
/** One hiring-assistant turn: the updated understanding, the next reply, and anything learned about the hiring manager. */
export const hiringTurnOutput = z.object({
  reply: z.string().max(1200),
  understanding: z.object({
    title: z.string().max(120).nullable(),
    roleFamily: z.enum(['finance', 'operations', 'commercial']).nullable(),
    salaryPounds: z.number().int().nullable(),
    locationRegion: z.enum(['london', 'hertfordshire', 'manchester', 'remote_uk']).nullable(),
    workMode: z.enum(['onsite', 'hybrid', 'remote']).nullable(),
    outcomes: z.array(z.string().max(300)).max(6),
    mustHaves: z.array(hiringItem).max(6),
    niceToHaves: z.array(hiringItem).max(6),
    teachable: z.array(z.string().max(120)).max(8),
  }),
  learned: z.array(z.string().max(200)).max(3),
});
export type HiringTurnOutput = z.infer<typeof hiringTurnOutput>;

/** One simulated interview: answers drawn only from the candidate's own approved examples. */
export const simulationOutput = z.object({
  answers: z.array(z.object({ questionIndex: z.number().int().min(0).max(19), answer: z.string().max(600), evidenceIds: z.array(z.string()).max(4) })).max(20),
  fitScore: z.number().int().min(0).max(100),
  summary: z.string().max(400),
  concerns: z.array(z.string().max(200)).max(3),
});
export type SimulationOutput = z.infer<typeof simulationOutput>;

/** One turn of the in-app "build my mini-me" chat: a reply, what to save, and any job preferences they stated. */
export const miniMeChatOutput = z.object({
  reply: z.string().max(900),
  askedKey: z.string().max(60).nullable(),
  save: z.array(z.object({ topic: z.string().max(200), detail: z.string().max(1500), questionKey: z.string().max(60).nullable() })).max(12),
  preferences: z.object({
    region: z.enum(['london', 'hertfordshire', 'manchester', 'remote_uk']),
    workModes: z.array(z.enum(['onsite', 'hybrid', 'remote'])).min(1),
    roleFamilies: z.array(z.enum(['finance', 'operations', 'commercial'])).min(1),
    minSalaryPounds: z.number().int().nullable(),
    noticeWeeks: z.number().int().nullable(),
  }).nullable(),
});
export type MiniMeChatOutput = z.infer<typeof miniMeChatOutput>;
