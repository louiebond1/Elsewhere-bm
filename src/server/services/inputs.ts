import { z } from 'zod';
import { prototype } from '../../config/prototype';

export const TAXONOMY = ['reconciliations', 'reporting', 'month_end', 'budgeting', 'forecasting', 'controls', 'audit', 'payroll', 'bookkeeping', 'credit_control', 'tax', 'analysis', 'excel', 'sql', 'automation', 'process_design', 'customer_work', 'sales', 'partnerships', 'project_delivery', 'coordination', 'leadership', 'learning'] as const;
export type Tag = (typeof TAXONOMY)[number];
export const tagSchema = z.enum(TAXONOMY);

const text = (max: number) => z.string().trim().max(max);
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use a date in the form YYYY-MM-DD');

export const criterionInput = z.object({
  key: z.string().trim().regex(/^[a-z0-9_]{2,40}$/, 'Use lower-case letters, numbers and underscores'),
  label: text(80).min(2),
  description: text(400).default(''),
  importance: z.enum(['essential', 'desirable']),
  weight: z.number().int().min(1).max(5),
  evidenceTags: z.array(tagSchema).min(1).max(8),
});

export const salaryPoundsInput = z.number().int('Enter whole pounds').positive('Salary must be positive').max(prototype.maxSalaryPence / 100, 'Above the prototype technical limit of £1,000,000');

export const roleDraftInput = z.object({
  clientId: z.string().uuid().optional(),
  vacancyKey: text(40).min(1, 'Vacancy reference is required'),
  title: text(120).min(2, 'Title is required'),
  roleFamily: z.enum(['finance', 'operations', 'commercial']),
  salaryPounds: salaryPoundsInput,
  locationRegion: z.enum(['london', 'hertfordshire', 'manchester', 'remote_uk']),
  workMode: z.enum(['onsite', 'hybrid', 'remote']),
  workAuthorisationRequired: z.boolean().default(true),
  outcomes: z.array(text(300).min(1)).max(6).default([]),
  teachableSkills: z.array(text(120).min(1)).max(8).default([]),
  briefText: text(prototype.maxRoleTextChars).default(''),
  serviceMode: z.enum(['standard', 'full_search']).default('standard'),
  criteria: z.array(criterionInput).max(6).default([]),
});
export type RoleDraftInput = z.infer<typeof roleDraftInput>;

export const roleUpdateInput = roleDraftInput.partial().extend({ expectedRowVersion: z.number().int() });

export const activateInput = z.object({ confirmExtraDeposit: z.boolean().default(false) });
export const closeInput = z.object({ reason: z.enum(['filled', 'cancelled', 'on_hold', 'other']) });
export const reopenInput = z.object({ confirmDeposit: z.boolean().default(false) });

export const introRequestInput = z.object({ roleId: z.string().uuid(), candidateRef: z.string().min(8).max(80), message: text(600).default('') });

export const hireInput = z.object({
  introductionId: z.string().uuid(),
  acceptedOfferDate: isoDate,
  startDate: isoDate,
  salaryPounds: salaryPoundsInput,
});
export const outsideHireInput = hireInput.extend({ clientId: z.string().uuid() });
export const departureInput = z.object({ leftDate: isoDate, reason: text(500).min(2) });
export const replacementRequestInput = z.object({ reason: text(500).min(2) });

export const contractInput = z.object({
  clientId: z.string().uuid(),
  planType: z.enum(['annual', 'monthly']),
  startDate: isoDate,
  endDate: isoDate,
  creditRatePounds: z.number().positive().max(100000).nullable(),
  includedOpenRoles: z.number().int().min(0).max(50),
  committedCredits: z.number().min(0).max(1000).refine((v) => Number.isInteger(v * 2), 'Use whole or half credits'),
  instalmentCount: z.number().int().min(1).max(12),
  label: text(80).optional(),
});

export const grantInput = z.object({ clientId: z.string().uuid(), credits: z.number().positive().max(100).refine((v) => Number.isInteger(v * 8), 'Use multiples of 0.125 credits'), reason: text(300).min(3) });
export const checkoutInput = z.object({ credits: z.number().int('Use whole credits').min(1, 'Buy at least 1 credit').max(prototype.maxSimulatedPurchaseCredits, `Buy at most ${prototype.maxSimulatedPurchaseCredits} credits at a time`) });
export const reversalInput = z.object({ transactionId: z.string().uuid(), reason: text(300).min(3) });

export const screeningRequestInput = z.object({ roleId: z.string().uuid(), candidateRef: z.string().min(8).max(80) });
export const screeningCompleteInput = z.object({
  minutes: z.number().int().positive().max(600),
  notesPrivate: text(4000).default(''),
  summarySafe: text(800).min(10, 'Write a short client-safe summary'),
  assessments: z.array(z.object({ criterionId: z.string().uuid(), level: z.enum(['specific', 'partial', 'unknown', 'contradictory']), evidenceIds: z.array(z.string().uuid()).default([]), observationPrivate: text(1000).default('') })),
});

export const adjustmentInput = z.object({ roleId: z.string().uuid(), candidateId: z.string().uuid(), adjustment: z.number().int().min(prototype.consultantAdjustmentMin).max(prototype.consultantAdjustmentMax), reason: text(500).min(5), evidenceIds: z.array(z.string().uuid()).min(1, 'Reference at least one evidence item') });

export const workLogInput = z.object({ clientId: z.string().uuid(), roleId: z.string().uuid().optional(), category: z.enum(['training', 'screening', 'support', 'shortlisting', 'search', 'offer', 'admin']), minutes: z.number().int().positive().max(1440), workDate: isoDate, note: text(500).optional() });

export const signupInput = z.object({
  fullName: text(120).min(2),
  email: z.string().trim().toLowerCase().email().max(200),
  password: z.string().min(10).max(200),
  region: z.enum(['london', 'hertfordshire', 'manchester', 'remote_uk']),
  workModes: z.array(z.enum(['onsite', 'hybrid', 'remote'])).min(1),
  roleFamilies: z.array(z.enum(['finance', 'operations', 'commercial'])).min(1),
  minSalaryPounds: z.number().int().positive().max(1000000).nullable().default(null),
  noticeWeeks: z.number().int().min(0).max(52).nullable().default(null),
  fictionalConfirmed: z.literal(true, { message: 'Confirm you are entering fictional information only' }),
  acceptTerms: z.literal(true, { message: 'Accept the prototype terms to continue' }),
  acceptAi: z.literal(true, { message: 'Accept AI processing to continue' }),
  wantsDiscovery: z.boolean().default(false),
  aggregateInsights: z.boolean().default(false),
});

export const preferencesInput = z.object({
  region: z.enum(['london', 'hertfordshire', 'manchester', 'remote_uk']),
  workModes: z.array(z.enum(['onsite', 'hybrid', 'remote'])).min(1),
  roleFamilies: z.array(z.enum(['finance', 'operations', 'commercial'])).min(1),
  minSalaryPounds: z.number().int().positive().max(1000000).nullable(),
  noticeWeeks: z.number().int().min(0).max(52).nullable(),
  workAuthorisation: z.enum(['confirmed', 'needs_discussion', 'unknown']),
  experienceBand: z.enum(['early_career', 'established', 'leadership', 'unknown']),
});

export const employerInput = z.union([
  z.object({ mode: z.literal('organisation'), organisationId: z.string().uuid() }),
  z.object({ mode: z.literal('not_employed') }),
  z.object({ mode: z.literal('typed'), label: text(120).min(2) }),
]);

export const evidenceReviseInput = z.object({ evidenceId: z.string().uuid(), claim: text(600).min(5), safeClaim: text(400).min(5), tags: z.array(tagSchema).min(1).max(8), uncertainty: text(300).nullable().default(null) });

export const answerInput = z.object({ body: text(prototype.maxAnswerChars).min(1, 'Write an answer or choose Skip question'), questionId: z.string().uuid() });
