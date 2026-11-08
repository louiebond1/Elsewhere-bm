import { pgTable, pgEnum, bigserial, uuid, text, timestamp, integer, boolean, bigint, jsonb, date, uniqueIndex, index } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';

// ---------- shared columns ----------
const ts = (name: string) => timestamp(name, { withTimezone: true });
const common = () => ({
  id: uuid('id').primaryKey().defaultRandom(),
  datasetId: uuid('dataset_id').notNull().references(() => datasets.id, { onDelete: 'cascade' }),
  createdAt: ts('created_at').notNull().defaultNow(),
  updatedAt: ts('updated_at').notNull().defaultNow(),
  rowVersion: integer('row_version').notNull().default(1),
});
const appendOnly = () => ({
  id: uuid('id').primaryKey().defaultRandom(),
  datasetId: uuid('dataset_id').notNull().references(() => datasets.id, { onDelete: 'cascade' }),
  createdAt: ts('created_at').notNull().defaultNow(),
});
const units = (name: string) => bigint(name, { mode: 'bigint' });

// ---------- enums ----------
export const datasetStatus = pgEnum('dataset_status', ['active', 'resetting', 'archived', 'preparing']);
export const userType = pgEnum('user_type', ['candidate', 'client', 'consultant']);
export const userStatus = pgEnum('user_status', ['active', 'disabled', 'deleted']);
export const clientStatus = pgEnum('client_status', ['prospect', 'onboarding', 'active', 'suspended']);
export const membershipRole = pgEnum('membership_role', ['owner', 'hiring_manager']);
export const bookingStatus = pgEnum('booking_status', ['not_booked', 'booked', 'completed']);
export const trainingMode = pgEnum('training_mode', ['online', 'in_person']);
export const candidateStatus = pgEnum('candidate_status', ['onboarding', 'active', 'paused', 'deleting', 'deleted']);
export const employerResolution = pgEnum('employer_resolution', ['not_supplied', 'resolved', 'unresolved', 'not_employed']);
export const region = pgEnum('region', ['london', 'hertfordshire', 'manchester', 'remote_uk']);
export const workAuth = pgEnum('work_authorisation', ['confirmed', 'needs_discussion', 'unknown']);
export const experienceBand = pgEnum('experience_band', ['early_career', 'established', 'leadership', 'unknown']);
export const blockReason = pgEnum('block_reason', ['current_employer', 'candidate_choice']);
export const consentKind = pgEnum('consent_kind', ['terms', 'ai_processing', 'discovery', 'aggregate_insights', 'screening_recording']);
export const filePurpose = pgEnum('file_purpose', ['cv', 'screening_recording']);
export const uploadState = pgEnum('upload_state', ['uploaded', 'processing', 'ready', 'failed', 'deleting', 'deleted']);
export const conversationKind = pgEnum('conversation_kind', ['initial_screening', 'check_in']);
export const conversationStatus = pgEnum('conversation_status', ['active', 'paused', 'completed']);
export const aiProvider = pgEnum('ai_provider', ['fixture', 'anthropic']);
export const questionTopic = pgEnum('question_topic', ['experience', 'ownership', 'outcome', 'collaboration', 'learning', 'constraints', 'clarification']);
export const questionState = pgEnum('question_state', ['unanswered', 'answered', 'skipped']);
export const inputMode = pgEnum('input_mode', ['text', 'imported_assisted']);
export const assistance = pgEnum('assistance', ['not_declared', 'candidate_declared_ai']);
export const answerStatus = pgEnum('answer_status', ['draft', 'submitted', 'withdrawn']);
export const evidenceSource = pgEnum('evidence_source', ['cv', 'answer', 'candidate_edit', 'screening']);
export const evidenceStrength = pgEnum('evidence_strength', ['specific', 'partial', 'assertion']);
export const evidenceReview = pgEnum('evidence_review', ['draft', 'candidate_approved', 'consultant_verified', 'rejected', 'superseded']);
export const anonymityReview = pgEnum('anonymity_review', ['pending', 'approved', 'rejected']);
export const profileReview = pgEnum('profile_review', ['draft', 'approved', 'superseded']);
export const planType = pgEnum('plan_type', ['annual', 'monthly']);
export const contractStatus = pgEnum('contract_status', ['draft', 'active', 'expired', 'suspended']);
export const txType = pgEnum('tx_type', ['grant', 'deposit_debit', 'hire_balance_debit', 'second_hire_debit', 'outside_hire_debit', 'reversal', 'simulated_purchase']);
export const checkoutStatus = pgEnum('checkout_status', ['open', 'succeeded', 'declined', 'cancelled']);
export const holdStatus = pgEnum('hold_status', ['active', 'released', 'consumed']);
export const roleFamily = pgEnum('role_family', ['finance', 'operations', 'commercial']);
export const workMode = pgEnum('work_mode', ['onsite', 'hybrid', 'remote']);
export const roleStatus = pgEnum('role_status', ['draft', 'open', 'closed']);
export const closureReason = pgEnum('closure_reason', ['filled', 'cancelled', 'on_hold', 'other']);
export const serviceMode = pgEnum('service_mode', ['standard', 'full_search']);
export const importance = pgEnum('importance', ['essential', 'desirable']);
export const orderKind = pgEnum('order_kind', ['primary', 'additional', 'replacement']);
export const orderStatus = pgEnum('order_status', ['quoted', 'deposit_paid', 'paid', 'no_hire_closed']);
export const eligibility = pgEnum('eligibility', ['eligible', 'needs_clarification', 'incompatible']);
export const confidence = pgEnum('confidence', ['low', 'medium', 'high']);
export const introState = pgEnum('intro_state', ['pending', 'accepted', 'declined', 'expired', 'cancelled', 'withdrawn']);
export const revocationReason = pgEnum('revocation_reason', ['candidate_withdrew', 'employer_block', 'deletion']);
export const selectionMode = pgEnum('selection_mode', ['manual', 'automatic']);
export const screeningStatus = pgEnum('screening_status', ['requested', 'scheduled', 'completed', 'cancelled']);
export const pipelineStage = pgEnum('pipeline_stage', ['introduced', 'interview', 'offer', 'hired', 'rejected', 'withdrawn']);
export const hireSource = pgEnum('hire_source', ['in_system', 'outside_system', 'replacement']);
export const hireStatus = pgEnum('hire_status', ['confirmed', 'started', 'left']);
export const replacementEligibility = pgEnum('replacement_eligibility', ['eligible', 'outside_window', 'already_used', 'pending_review']);
export const replacementStatus = pgEnum('replacement_status', ['requested', 'approved', 'declined', 'fulfilled']);
export const workCategory = pgEnum('work_category', ['training', 'screening', 'support', 'shortlisting', 'search', 'offer', 'admin']);
export const notificationType = pgEnum('notification_type', ['intro_requested', 'intro_accepted', 'intro_declined', 'screening_updated', 'profile_ready', 'credit_low', 'hire_recorded', 'replacement_updated', 'system']);
export const idemState = pgEnum('idem_state', ['processing', 'completed']);
export const jobKind = pgEnum('job_kind', ['extract_cv', 'ask_question', 'build_profile', 'assess_match', 'expire_intros', 'delete_candidate', 'reconcile_wallet', 'seed_demo', 'generate_feedback', 'send_email']);
export const emailStatus = pgEnum('email_status', ['queued', 'recorded', 'sent', 'suppressed', 'failed']);
export const jobStatus = pgEnum('job_status', ['queued', 'running', 'succeeded', 'failed', 'cancelled']);
export const aiOutcome = pgEnum('ai_outcome', ['succeeded', 'failed', 'refused', 'stale_discarded']);
export const reservationState = pgEnum('reservation_state', ['reserved', 'reconciled', 'released']);
export const aliasType = pgEnum('alias_type', ['name', 'domain']);

// ---------- identity and tenancy ----------
export const datasets = pgTable('datasets', {
  id: uuid('id').primaryKey().defaultRandom(),
  createdAt: ts('created_at').notNull().defaultNow(),
  name: text('name').notNull(),
  seedVersion: text('seed_version'),
  scenarioCode: text('scenario_code'),
  businessNow: ts('business_now'),
  status: datasetStatus('status').notNull().default('preparing'),
  isDemo: boolean('is_demo').notNull().default(true),
  generation: integer('generation').notNull(),
});

export const applicationState = pgTable('application_state', {
  id: integer('id').primaryKey().default(1),
  activeDatasetId: uuid('active_dataset_id').references(() => datasets.id),
  resetJobId: uuid('reset_job_id'),
  maintenance: boolean('maintenance').notNull().default(false),
  lastResetAt: ts('last_reset_at'),
  updatedAt: ts('updated_at').notNull().defaultNow(),
});

export const users = pgTable('users', {
  ...common(),
  emailNormalized: text('email_normalized').notNull(),
  passwordHash: text('password_hash').notNull(),
  userType: userType('user_type').notNull(),
  displayName: text('display_name'),
  status: userStatus('status').notNull().default('active'),
  lastLoginAt: ts('last_login_at'),
}, (t) => [uniqueIndex('users_email_uq').on(t.datasetId, t.emailNormalized)]);

export const demoAccessSessions = pgTable('demo_access_sessions', {
  id: uuid('id').primaryKey().defaultRandom(),
  tokenHash: text('token_hash').notNull().unique(),
  csrfHash: text('csrf_hash').notNull(),
  createdAt: ts('created_at').notNull().defaultNow(),
  expiresAt: ts('expires_at').notNull(),
  revokedAt: ts('revoked_at'),
});

export const sessions = pgTable('sessions', {
  ...common(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  tokenHash: text('token_hash').notNull().unique(),
  csrfHash: text('csrf_hash').notNull(),
  expiresAt: ts('expires_at').notNull(),
  lastSeenAt: ts('last_seen_at').notNull().defaultNow(),
  demoGateVerified: boolean('demo_gate_verified').notNull().default(false),
  revokedAt: ts('revoked_at'),
});

export const organisations = pgTable('organisations', {
  ...common(),
  legalName: text('legal_name').notNull(),
  displayName: text('display_name').notNull(),
  canonicalDomain: text('canonical_domain'),
  groupId: uuid('group_id'),
  isClient: boolean('is_client').notNull().default(false),
});

export const organisationAliases = pgTable('organisation_aliases', {
  ...common(),
  organisationId: uuid('organisation_id').notNull().references(() => organisations.id, { onDelete: 'cascade' }),
  aliasNormalized: text('alias_normalized').notNull(),
  aliasType: aliasType('alias_type').notNull(),
}, (t) => [uniqueIndex('org_alias_uq').on(t.datasetId, t.aliasNormalized, t.aliasType)]);

export const clients = pgTable('clients', {
  ...common(),
  organisationId: uuid('organisation_id').notNull().unique().references(() => organisations.id),
  consultantUserId: uuid('consultant_user_id').notNull().references(() => users.id),
  contactName: text('contact_name').notNull(),
  contactEmail: text('contact_email').notNull(),
  status: clientStatus('status').notNull().default('onboarding'),
  existingFeeBps: integer('existing_fee_bps'),
  notesPrivate: text('notes_private'),
});

export const clientMemberships = pgTable('client_memberships', {
  ...common(),
  clientId: uuid('client_id').notNull().references(() => clients.id, { onDelete: 'cascade' }),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  membershipRole: membershipRole('membership_role').notNull().default('owner'),
}, (t) => [uniqueIndex('membership_user_uq').on(t.datasetId, t.userId)]);

export const clientOnboarding = pgTable('client_onboarding', {
  ...common(),
  clientId: uuid('client_id').notNull().unique().references(() => clients.id, { onDelete: 'cascade' }),
  introStatus: bookingStatus('intro_status').notNull().default('not_booked'),
  trainingMode: trainingMode('training_mode'),
  trainingStatus: bookingStatus('training_status').notNull().default('not_booked'),
  scheduledAt: ts('scheduled_at'),
  completedAt: ts('completed_at'),
  interviewTrainingDone: boolean('interview_training_done').notNull().default(false),
  processDesignDone: boolean('process_design_done').notNull().default(false),
  jobSpecsDone: boolean('job_specs_done').notNull().default(false),
  assessmentTrainingDone: boolean('assessment_training_done').notNull().default(false),
  hiringBrief: text('hiring_brief'),
});

// ---------- candidates and evidence ----------
export const candidates = pgTable('candidates', {
  ...common(),
  userId: uuid('user_id').notNull().unique().references(() => users.id),
  publicRef: text('public_ref').notNull(),
  status: candidateStatus('status').notNull().default('onboarding'),
  discoveryEnabled: boolean('discovery_enabled').notNull().default(false),
  employerResolutionStatus: employerResolution('employer_resolution_status').notNull().default('not_supplied'),
  currentOrganisationId: uuid('current_organisation_id').references(() => organisations.id),
  preferredRoleFamilies: text('preferred_role_families').array().notNull().default(sql`'{}'::text[]`),
  region: region('region').notNull().default('london'),
  workModes: text('work_modes').array().notNull().default(sql`'{}'::text[]`),
  minSalaryPence: units('min_salary_pence'),
  noticeWeeks: integer('notice_weeks'),
  workAuthorisation: workAuth('work_authorisation').notNull().default('unknown'),
  experienceBand: experienceBand('experience_band').notNull().default('unknown'),
  latestProfileVersionId: uuid('latest_profile_version_id'),
  deletedAt: ts('deleted_at'),
}, (t) => [uniqueIndex('candidate_ref_uq').on(t.datasetId, t.publicRef)]);

export const candidateIdentity = pgTable('candidate_identity', {
  ...common(),
  candidateId: uuid('candidate_id').notNull().unique().references(() => candidates.id, { onDelete: 'cascade' }),
  fullName: text('full_name').notNull(),
  email: text('email').notNull(),
  phone: text('phone'),
  currentEmployerLabel: text('current_employer_label'),
  currentTitle: text('current_title'),
});

export const candidateBlocks = pgTable('candidate_blocks', {
  ...common(),
  candidateId: uuid('candidate_id').notNull().references(() => candidates.id, { onDelete: 'cascade' }),
  organisationId: uuid('organisation_id').notNull().references(() => organisations.id),
  includeGroup: boolean('include_group').notNull().default(true),
  reason: blockReason('reason').notNull(),
  createdByUserId: uuid('created_by_user_id').notNull().references(() => users.id),
}, (t) => [uniqueIndex('block_uq').on(t.candidateId, t.organisationId), index('block_idx').on(t.candidateId, t.organisationId)]);

export const consentEvents = pgTable('consent_events', {
  ...appendOnly(),
  candidateId: uuid('candidate_id').notNull().references(() => candidates.id, { onDelete: 'cascade' }),
  kind: consentKind('kind').notNull(),
  granted: boolean('granted').notNull(),
  termsVersion: text('terms_version').notNull(),
  actorUserId: uuid('actor_user_id').notNull().references(() => users.id),
  relatedScreeningId: uuid('related_screening_id'),
  eventAt: ts('event_at').notNull(),
});

export const files = pgTable('files', {
  ...common(),
  candidateId: uuid('candidate_id').references(() => candidates.id, { onDelete: 'set null' }),
  screeningId: uuid('screening_id'),
  purpose: filePurpose('purpose').notNull(),
  objectKey: text('object_key').notNull().unique(),
  originalFilename: text('original_filename').notNull(),
  mimeType: text('mime_type').notNull(),
  bytes: units('bytes').notNull(),
  sha256: text('sha256').notNull(),
  uploadState: uploadState('upload_state').notNull().default('uploaded'),
  extractedTextPrivate: text('extracted_text_private'),
  extractionErrorCode: text('extraction_error_code'),
  textConfirmedAt: ts('text_confirmed_at'),
  uploadedByUserId: uuid('uploaded_by_user_id').notNull().references(() => users.id),
  deletedAt: ts('deleted_at'),
}, (t) => [index('files_cand_idx').on(t.candidateId, t.purpose)]);

export const conversations = pgTable('conversations', {
  ...common(),
  candidateId: uuid('candidate_id').notNull().references(() => candidates.id, { onDelete: 'cascade' }),
  kind: conversationKind('kind').notNull(),
  status: conversationStatus('status').notNull().default('active'),
  initialCvFileId: uuid('initial_cv_file_id'),
  questionCount: integer('question_count').notNull().default(0),
  completedAt: ts('completed_at'),
  provider: aiProvider('provider').notNull(),
  promptVersion: text('prompt_version').notNull(),
}, (t) => [uniqueIndex('one_active_conversation').on(t.candidateId, t.kind).where(sql`status = 'active'`)]);

export const checkInQuestions = pgTable('check_in_questions', {
  ...common(),
  conversationId: uuid('conversation_id').notNull().references(() => conversations.id, { onDelete: 'cascade' }),
  ordinal: integer('ordinal').notNull(),
  questionText: text('question_text').notNull(),
  topic: questionTopic('topic').notNull(),
  reason: text('reason'),
  targetEvidenceId: uuid('target_evidence_id'),
  state: questionState('state').notNull().default('unanswered'),
}, (t) => [uniqueIndex('question_ordinal_uq').on(t.conversationId, t.ordinal)]);

export const checkInAnswers = pgTable('check_in_answers', {
  ...common(),
  questionId: uuid('question_id').notNull().references(() => checkInQuestions.id, { onDelete: 'cascade' }),
  candidateId: uuid('candidate_id').notNull().references(() => candidates.id, { onDelete: 'cascade' }),
  body: text('body').notNull(),
  inputMode: inputMode('input_mode').notNull().default('text'),
  assistance: assistance('assistance').notNull().default('not_declared'),
  status: answerStatus('status').notNull().default('submitted'),
  submittedAt: ts('submitted_at'),
  replacesAnswerId: uuid('replaces_answer_id'),
}, (t) => [index('answers_cand_idx').on(t.candidateId, t.submittedAt), uniqueIndex('one_submitted_answer').on(t.questionId).where(sql`status = 'submitted'`)]);

export const evidenceItems = pgTable('evidence_items', {
  ...common(),
  candidateId: uuid('candidate_id').notNull().references(() => candidates.id, { onDelete: 'cascade' }),
  sourceKind: evidenceSource('source_kind').notNull(),
  sourceFileId: uuid('source_file_id'),
  sourceAnswerId: uuid('source_answer_id'),
  sourceScreeningId: uuid('source_screening_id'),
  sourceQuotePrivate: text('source_quote_private').notNull(),
  claimPrivate: text('claim_private').notNull(),
  safeClaim: text('safe_claim'),
  tags: text('tags').array().notNull().default(sql`'{}'::text[]`),
  outcomeText: text('outcome_text'),
  uncertainty: text('uncertainty'),
  strength: evidenceStrength('strength').notNull(),
  reviewState: evidenceReview('review_state').notNull().default('draft'),
  anonymityReview: anonymityReview('anonymity_review').notNull().default('pending'),
  approvedByUserId: uuid('approved_by_user_id'),
  approvedAt: ts('approved_at'),
  supersedesId: uuid('supersedes_id'),
  provider: aiProvider('provider').notNull().default('fixture'),
}, (t) => [index('evidence_cand_idx').on(t.candidateId, t.reviewState)]);

export const profileVersions = pgTable('profile_versions', {
  ...common(),
  candidateId: uuid('candidate_id').notNull().references(() => candidates.id, { onDelete: 'cascade' }),
  versionNumber: integer('version_number').notNull(),
  headlineSafe: text('headline_safe').notNull(),
  summarySafe: text('summary_safe').notNull(),
  preferencesSnapshot: jsonb('preferences_snapshot').notNull(),
  evidenceIds: uuid('evidence_ids').array().notNull(),
  feedback: jsonb('feedback').notNull(),
  reviewState: profileReview('review_state').notNull().default('draft'),
  approvalAt: ts('approval_at'),
  /** Live-AI developmental feedback for the candidate. Separate from the immutable approved content. */
  feedbackLive: jsonb('feedback_live'),
  profileHash: text('profile_hash').notNull(),
}, (t) => [uniqueIndex('profile_version_uq').on(t.candidateId, t.versionNumber)]);

// ---------- commercial and hiring ----------
export const contracts = pgTable('contracts', {
  ...common(),
  clientId: uuid('client_id').notNull().references(() => clients.id),
  planType: planType('plan_type').notNull(),
  status: contractStatus('status').notNull().default('draft'),
  startDate: date('start_date').notNull(),
  endDate: date('end_date').notNull(),
  creditRatePence: integer('credit_rate_pence'),
  includedOpenRoles: integer('included_open_roles').notNull(),
  committedCreditUnits: units('committed_credit_units').notNull(),
  instalmentCount: integer('instalment_count').notNull().default(1),
  pricingVersion: text('pricing_version').notNull(),
  termsSnapshot: jsonb('terms_snapshot'),
  exclusivityNote: text('exclusivity_note').notNull().default('To be agreed'),
  rolloverNote: text('rollover_note').notNull().default('To be agreed'),
  label: text('label'),
  activatedAt: ts('activated_at'),
}, (t) => [uniqueIndex('one_active_contract').on(t.clientId).where(sql`status = 'active'`), index('contracts_client_idx').on(t.clientId, t.status)]);

export const wallets = pgTable('wallets', {
  ...common(),
  clientId: uuid('client_id').notNull().unique().references(() => clients.id),
  availableCachedUnits: units('available_cached_units').notNull().default(sql`0`),
  lastReconciledAt: ts('last_reconciled_at'),
});

export const roles = pgTable('roles', {
  ...common(),
  clientId: uuid('client_id').notNull().references(() => clients.id),
  contractId: uuid('contract_id').notNull().references(() => contracts.id),
  vacancyKey: text('vacancy_key').notNull(),
  title: text('title').notNull(),
  roleFamily: roleFamily('role_family').notNull(),
  locationRegion: region('location_region').notNull(),
  workMode: workMode('work_mode').notNull(),
  salaryPence: units('salary_pence').notNull(),
  workAuthorisationRequired: boolean('work_authorisation_required').notNull().default(true),
  briefText: text('brief_text').notNull().default(''),
  outcomes: text('outcomes').array().notNull().default(sql`'{}'::text[]`),
  teachableSkills: text('teachable_skills').array().notNull().default(sql`'{}'::text[]`),
  status: roleStatus('status').notNull().default('draft'),
  closureReason: closureReason('closure_reason'),
  closedAt: ts('closed_at'),
  assignedConsultantId: uuid('assigned_consultant_id').notNull().references(() => users.id),
  roleVersion: integer('role_version').notNull().default(1),
  pricingLockedAt: ts('pricing_locked_at'),
  isExtraRole: boolean('is_extra_role').notNull().default(false),
  isReplacementRole: boolean('is_replacement_role').notNull().default(false),
  replacementCaseId: uuid('replacement_case_id'),
  defaultServiceMode: serviceMode('default_service_mode').notNull().default('standard'),
  duplicateOfRoleId: uuid('duplicate_of_role_id'),
  newVacancyConfirmedBy: uuid('new_vacancy_confirmed_by'),
  newVacancyReason: text('new_vacancy_reason'),
  externalAtsId: text('external_ats_id'),
  createdByUserId: uuid('created_by_user_id').notNull().references(() => users.id),
}, (t) => [uniqueIndex('vacancy_uq').on(t.clientId, t.vacancyKey), index('roles_client_idx').on(t.clientId, t.status)]);

export const roleCriteria = pgTable('role_criteria', {
  ...common(),
  roleId: uuid('role_id').notNull().references(() => roles.id, { onDelete: 'cascade' }),
  criterionKey: text('criterion_key').notNull(),
  label: text('label').notNull(),
  description: text('description').notNull(),
  importance: importance('importance').notNull(),
  weight: integer('weight').notNull(),
  evidenceTags: text('evidence_tags').array().notNull(),
  ordinal: integer('ordinal').notNull(),
}, (t) => [uniqueIndex('criterion_uq').on(t.roleId, t.criterionKey)]);

export const hireOrders = pgTable('hire_orders', {
  ...common(),
  clientId: uuid('client_id').notNull().references(() => clients.id),
  roleId: uuid('role_id').notNull().references(() => roles.id),
  contractId: uuid('contract_id').notNull().references(() => contracts.id),
  orderNumber: integer('order_number').notNull(),
  kind: orderKind('kind').notNull(),
  serviceMode: serviceMode('service_mode').notNull(),
  salarySnapshotPence: units('salary_snapshot_pence').notNull(),
  baseUnits: units('base_units').notNull(),
  totalUnits: units('total_units').notNull(),
  depositDueUnits: units('deposit_due_units').notNull(),
  rateSnapshotPence: integer('rate_snapshot_pence').notNull(),
  totalPence: units('total_pence').notNull(),
  pricingVersion: text('pricing_version').notNull(),
  status: orderStatus('status').notNull().default('quoted'),
  parentPaidOrderId: uuid('parent_paid_order_id'),
}, (t) => [uniqueIndex('order_number_uq').on(t.roleId, t.orderNumber)]);

export const creditTransactions = pgTable('credit_transactions', {
  ...appendOnly(),
  seq: bigserial('seq', { mode: 'number' }).notNull(),
  walletId: uuid('wallet_id').notNull().references(() => wallets.id),
  clientId: uuid('client_id').notNull().references(() => clients.id),
  contractId: uuid('contract_id').notNull().references(() => contracts.id),
  orderId: uuid('order_id').references(() => hireOrders.id),
  roleId: uuid('role_id').references(() => roles.id),
  hireId: uuid('hire_id'),
  type: txType('type').notNull(),
  deltaUnits: units('delta_units').notNull(),
  valuationRatePence: integer('valuation_rate_pence').notNull(),
  deltaPence: units('delta_pence').notNull(),
  actorUserId: uuid('actor_user_id'),
  operationId: uuid('operation_id').notNull(),
  idempotencyKey: text('idempotency_key').notNull(),
  reversalOfId: uuid('reversal_of_id').unique(),
  reason: text('reason').notNull(),
  businessEventAt: ts('business_event_at').notNull(),
  balanceAfterUnits: units('balance_after_units').notNull(),
}, (t) => [
  uniqueIndex('tx_idem_uq').on(t.datasetId, t.idempotencyKey),
  index('tx_wallet_idx').on(t.walletId, t.createdAt),
  uniqueIndex('one_deposit_per_order').on(t.orderId).where(sql`type = 'deposit_debit' and reversal_of_id is null`),
]);

/** Demo-only checkout. No payment provider, no card data. Success posts one simulated_purchase entry. */
export const simulatedCheckouts = pgTable('simulated_checkouts', {
  ...common(),
  clientId: uuid('client_id').notNull().references(() => clients.id),
  contractId: uuid('contract_id').notNull().references(() => contracts.id),
  units: units('units').notNull(),
  ratePence: integer('rate_pence').notNull(),
  totalPence: units('total_pence').notNull(),
  status: checkoutStatus('status').notNull().default('open'),
  createdByUserId: uuid('created_by_user_id').notNull(),
  resolvedByUserId: uuid('resolved_by_user_id'),
  resolvedAt: ts('resolved_at'),
  transactionId: uuid('transaction_id').unique(),
}, (t) => [index('checkout_client_idx').on(t.clientId, t.createdAt)]);

export const creditHolds = pgTable('credit_holds', {
  ...common(),
  walletId: uuid('wallet_id').notNull().references(() => wallets.id),
  roleId: uuid('role_id').notNull().references(() => roles.id),
  orderId: uuid('order_id').notNull().references(() => hireOrders.id),
  units: units('units').notNull(),
  status: holdStatus('status').notNull().default('active'),
  createdByUserId: uuid('created_by_user_id').notNull(),
  expiresAt: ts('expires_at').notNull(),
  consumedByTransactionId: uuid('consumed_by_transaction_id'),
}, (t) => [uniqueIndex('one_active_hold_per_role').on(t.roleId).where(sql`status = 'active'`), index('holds_wallet_idx').on(t.walletId, t.status)]);

export const matches = pgTable('matches', {
  ...common(),
  roleId: uuid('role_id').notNull().references(() => roles.id, { onDelete: 'cascade' }),
  candidateId: uuid('candidate_id').notNull().references(() => candidates.id, { onDelete: 'cascade' }),
  profileVersionId: uuid('profile_version_id').notNull(),
  roleVersion: integer('role_version').notNull(),
  eligibility: eligibility('eligibility').notNull(),
  incompatibilityReason: text('incompatibility_reason'),
  score: integer('score').notNull(),
  aiScore: integer('ai_score').notNull().default(0),
  humanScore: integer('human_score'),
  coverageBps: integer('coverage_bps').notNull().default(0),
  confidence: confidence('confidence').notNull(),
  criterionResults: jsonb('criterion_results').notNull(),
  rationaleSafe: text('rationale_safe').notNull(),
  missingEvidence: text('missing_evidence').array().notNull().default(sql`'{}'::text[]`),
  aiRunId: uuid('ai_run_id'),
  provider: aiProvider('provider').notNull().default('fixture'),
  stale: boolean('stale').notNull().default(false),
  computedAt: ts('computed_at').notNull(),
}, (t) => [uniqueIndex('match_uq').on(t.roleId, t.candidateId), index('match_score_idx').on(t.roleId, t.score)]);

export const rankingAdjustments = pgTable('ranking_adjustments', {
  ...appendOnly(),
  roleId: uuid('role_id').notNull().references(() => roles.id, { onDelete: 'cascade' }),
  candidateId: uuid('candidate_id').notNull().references(() => candidates.id, { onDelete: 'cascade' }),
  consultantUserId: uuid('consultant_user_id').notNull(),
  adjustment: integer('adjustment').notNull(),
  reasonPrivate: text('reason_private').notNull(),
  evidenceIds: uuid('evidence_ids').array().notNull(),
  supersedesId: uuid('supersedes_id'),
});

export const introductions = pgTable('introductions', {
  ...common(),
  roleId: uuid('role_id').notNull().references(() => roles.id),
  candidateId: uuid('candidate_id').notNull().references(() => candidates.id),
  clientId: uuid('client_id').notNull().references(() => clients.id),
  requestedByUserId: uuid('requested_by_user_id').notNull(),
  state: introState('state').notNull().default('pending'),
  messageToCandidate: text('message_to_candidate').notNull().default(''),
  requestedAt: ts('requested_at').notNull(),
  expiresAt: ts('expires_at').notNull(),
  respondedAt: ts('responded_at'),
  acceptedAt: ts('accepted_at'),
  withdrawnAt: ts('withdrawn_at'),
  acceptedProfileVersionId: uuid('accepted_profile_version_id'),
  attemptCount: integer('attempt_count').notNull().default(1),
}, (t) => [uniqueIndex('intro_uq').on(t.roleId, t.candidateId), index('intro_role_idx').on(t.roleId, t.state), index('intro_cand_idx').on(t.candidateId, t.state)]);

export const identityGrants = pgTable('identity_grants', {
  ...common(),
  introductionId: uuid('introduction_id').notNull().unique().references(() => introductions.id),
  candidateId: uuid('candidate_id').notNull().references(() => candidates.id),
  clientId: uuid('client_id').notNull().references(() => clients.id),
  roleId: uuid('role_id').notNull().references(() => roles.id),
  grantedAt: ts('granted_at').notNull(),
  revokedAt: ts('revoked_at'),
  revocationReason: revocationReason('revocation_reason'),
}, (t) => [index('grant_idx').on(t.clientId, t.roleId, t.candidateId)]);

export const screenings = pgTable('screenings', {
  ...common(),
  roleId: uuid('role_id').notNull().references(() => roles.id),
  candidateId: uuid('candidate_id').notNull().references(() => candidates.id),
  requestedByUserId: uuid('requested_by_user_id').notNull(),
  consultantUserId: uuid('consultant_user_id'),
  selectionMode: selectionMode('selection_mode').notNull().default('manual'),
  status: screeningStatus('status').notNull().default('requested'),
  scheduledAt: ts('scheduled_at'),
  completedAt: ts('completed_at'),
  recordingConsentAt: ts('recording_consent_at'),
  notesPrivate: text('notes_private'),
  summarySafe: text('summary_safe'),
  criterionAssessments: jsonb('criterion_assessments').notNull().default(sql`'[]'::jsonb`),
}, (t) => [uniqueIndex('screening_uq').on(t.roleId, t.candidateId)]);

export const pipelineEntries = pgTable('pipeline_entries', {
  ...common(),
  introductionId: uuid('introduction_id').notNull().unique().references(() => introductions.id),
  stage: pipelineStage('stage').notNull().default('introduced'),
  updatedByUserId: uuid('updated_by_user_id').notNull(),
  nextAction: text('next_action'),
  nextActionDue: date('next_action_due'),
  clientNote: text('client_note'),
  interviewPrep: jsonb('interview_prep'),
});

export const hires = pgTable('hires', {
  ...common(),
  clientId: uuid('client_id').notNull().references(() => clients.id),
  roleId: uuid('role_id').notNull().references(() => roles.id),
  candidateId: uuid('candidate_id').references(() => candidates.id, { onDelete: 'set null' }),
  introductionId: uuid('introduction_id'),
  orderId: uuid('order_id').notNull().unique().references(() => hireOrders.id),
  source: hireSource('source').notNull(),
  agreedSalaryPence: units('agreed_salary_pence').notNull(),
  acceptedOfferDate: date('accepted_offer_date').notNull(),
  startDate: date('start_date').notNull(),
  status: hireStatus('status').notNull().default('confirmed'),
  leftDate: date('left_date'),
  leftReason: text('left_reason'),
  createdByUserId: uuid('created_by_user_id').notNull(),
  duplicateKey: text('duplicate_key').notNull(),
  candidateRefSnapshot: text('candidate_ref_snapshot').notNull(),
  outsideIntroId: uuid('outside_intro_id'),
}, (t) => [uniqueIndex('hire_dup_uq').on(t.datasetId, t.duplicateKey)]);

export const replacementCases = pgTable('replacement_cases', {
  ...common(),
  originalHireId: uuid('original_hire_id').notNull().unique().references(() => hires.id),
  clientId: uuid('client_id').notNull().references(() => clients.id),
  requestedByUserId: uuid('requested_by_user_id').notNull(),
  leftDate: date('left_date').notNull(),
  reason: text('reason').notNull(),
  eligibility: replacementEligibility('eligibility').notNull(),
  status: replacementStatus('status').notNull().default('requested'),
  decisionByUserId: uuid('decision_by_user_id'),
  decisionAt: ts('decision_at'),
  replacementRoleId: uuid('replacement_role_id').unique(),
  replacementHireId: uuid('replacement_hire_id').unique(),
});

// ---------- operations ----------
export const workLogs = pgTable('work_logs', {
  ...common(),
  consultantUserId: uuid('consultant_user_id').notNull(),
  clientId: uuid('client_id').notNull().references(() => clients.id),
  roleId: uuid('role_id'),
  screeningId: uuid('screening_id'),
  category: workCategory('category').notNull(),
  minutes: integer('minutes').notNull(),
  workDate: date('work_date').notNull(),
  note: text('note'),
});

export const notifications = pgTable('notifications', {
  ...common(),
  recipientUserId: uuid('recipient_user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  type: notificationType('type').notNull(),
  subjectRefType: text('subject_ref_type').notNull(),
  subjectRefId: uuid('subject_ref_id').notNull(),
  safeTitle: text('safe_title').notNull(),
  readAt: ts('read_at'),
}, (t) => [index('notif_idx').on(t.recipientUserId, t.readAt)]);

export const activityEvents = pgTable('activity_events', {
  ...appendOnly(),
  actorUserId: uuid('actor_user_id'),
  clientId: uuid('client_id'),
  subjectType: text('subject_type').notNull(),
  subjectId: uuid('subject_id').notNull(),
  action: text('action').notNull(),
  metadata: jsonb('metadata').notNull().default(sql`'{}'::jsonb`),
  operationId: uuid('operation_id'),
  eventAt: ts('event_at').notNull(),
}, (t) => [index('activity_subject_idx').on(t.subjectType, t.subjectId, t.createdAt)]);

export const idempotencyRecords = pgTable('idempotency_records', {
  ...common(),
  actorScope: text('actor_scope').notNull(),
  endpoint: text('endpoint').notNull(),
  key: text('key').notNull(),
  requestHash: text('request_hash').notNull(),
  responseStatus: integer('response_status'),
  responseBodySafe: jsonb('response_body_safe'),
  state: idemState('state').notNull().default('processing'),
  expiresAt: ts('expires_at').notNull(),
}, (t) => [uniqueIndex('idem_uq').on(t.datasetId, t.actorScope, t.endpoint, t.key)]);

/**
 * Email outbox. Holds no address and no personal data: the recipient is resolved from users at send time,
 * and the subject is the notification's safe title. The fixture driver records and sends nothing.
 */
export const emailOutbox = pgTable('email_outbox', {
  ...common(),
  recipientUserId: uuid('recipient_user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  notificationType: notificationType('notification_type').notNull(),
  subject: text('subject').notNull(),
  linkPath: text('link_path').notNull(),
  status: emailStatus('status').notNull().default('queued'),
  driver: text('driver'),
  providerMessageId: text('provider_message_id'),
  suppressedReason: text('suppressed_reason'),
  lastError: text('last_error'),
  attempts: integer('attempts').notNull().default(0),
  processedAt: ts('processed_at'),
}, (t) => [index('email_outbox_created_idx').on(t.datasetId, t.createdAt)]);

export const jobs = pgTable('jobs', {
  ...common(),
  kind: jobKind('kind').notNull(),
  subjectId: uuid('subject_id'),
  payload: jsonb('payload').notNull().default(sql`'{}'::jsonb`),
  dedupeKey: text('dedupe_key').notNull(),
  status: jobStatus('status').notNull().default('queued'),
  attempts: integer('attempts').notNull().default(0),
  availableAt: ts('available_at').notNull().defaultNow(),
  lockedBy: text('locked_by'),
  lockedAt: ts('locked_at'),
  leaseExpiresAt: ts('lease_expires_at'),
  errorCode: text('error_code'),
}, (t) => [uniqueIndex('job_dedupe_uq').on(t.datasetId, t.dedupeKey), index('jobs_status_idx').on(t.status, t.availableAt)]);

// AI usage tables are deployment-wide: dataset_id is nullable so reset never wipes usage.
export const aiRuns = pgTable('ai_runs', {
  id: uuid('id').primaryKey().defaultRandom(),
  datasetId: uuid('dataset_id'),
  createdAt: ts('created_at').notNull().defaultNow(),
  jobId: uuid('job_id'),
  userId: uuid('user_id'),
  candidateId: uuid('candidate_id'),
  roleId: uuid('role_id'),
  task: text('task').notNull(),
  provider: aiProvider('provider').notNull(),
  modelId: text('model_id').notNull(),
  promptVersion: text('prompt_version').notNull(),
  inputHash: text('input_hash'),
  inputTokens: integer('input_tokens').notNull().default(0),
  outputTokens: integer('output_tokens').notNull().default(0),
  cacheReadTokens: integer('cache_read_tokens').notNull().default(0),
  cacheWriteTokens: integer('cache_write_tokens').notNull().default(0),
  durationMs: integer('duration_ms').notNull().default(0),
  outcome: aiOutcome('outcome').notNull(),
  errorCode: text('error_code'),
});

export const aiBudgetReservations = pgTable('ai_budget_reservations', {
  id: uuid('id').primaryKey().defaultRandom(),
  datasetId: uuid('dataset_id'),
  createdAt: ts('created_at').notNull().defaultNow(),
  updatedAt: ts('updated_at').notNull().defaultNow(),
  rowVersion: integer('row_version').notNull().default(1),
  requestKey: text('request_key').notNull().unique(),
  utcDate: date('utc_date').notNull(),
  reservedTokens: integer('reserved_tokens').notNull(),
  actualTokens: integer('actual_tokens'),
  state: reservationState('state').notNull().default('reserved'),
  expiresAt: ts('expires_at').notNull(),
});

export const rateLimitBuckets = pgTable('rate_limit_buckets', {
  id: uuid('id').primaryKey().defaultRandom(),
  datasetId: uuid('dataset_id'),
  createdAt: ts('created_at').notNull().defaultNow(),
  updatedAt: ts('updated_at').notNull().defaultNow(),
  rowVersion: integer('row_version').notNull().default(1),
  scopeHash: text('scope_hash').notNull(),
  action: text('action').notNull(),
  windowStart: ts('window_start').notNull(),
  count: integer('count').notNull().default(0),
}, (t) => [uniqueIndex('rate_uq').on(t.scopeHash, t.action, t.windowStart)]);

/** Private object storage fallback table used only when STORAGE_DRIVER=database (local/test). */
export const localObjects = pgTable('local_objects', {
  objectKey: text('object_key').primaryKey(),
  bytes: text('bytes_b64').notNull(),
  contentType: text('content_type').notNull(),
  createdAt: ts('created_at').notNull().defaultNow(),
});
