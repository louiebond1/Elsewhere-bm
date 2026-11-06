/**
 * Deterministic demo seed. Everything here is fictional. Seeded identifiers are
 * UUIDv5 values derived from the dataset generation and a stable fixture code.
 */
import { eq, sql } from 'drizzle-orm';
import * as argon2 from 'argon2';
import { createHash } from 'node:crypto';
import { PDFDocument, StandardFonts } from 'pdf-lib';
import { db } from '../db/client';
import * as S from '../db/schema';
import { uuidv5 } from '../lib/ids';
import { prototype, currentTermsSnapshot } from '../../config/prototype';
import { CANDIDATES, cvText, type Fx } from '../../../fixtures/candidates';
import { storage } from './storage';
import { withTx, type BaseCtx, type Ctx } from './context';
import { ensureWallet, insertTransaction } from './ledger';
import { quoteStandardCredits, priceOrder, depositForPrimary, penceForUnits } from '../lib/pricing';
import { recomputeAll } from './matching';
import { PROMPT_VERSION } from '../ai/prompts';
import { TERMS_VERSION } from './candidates';

const NS = '6f1c2a4e-8b0d-4c8e-9a51-3b7d2e9f0c11';

export type SeedOptions = {
  /** S14: Cedar's historical grant is reduced to 0.375 credits. */
  cedarGrantUnits?: bigint;
  /** S25: R8 accepted 1 Sep 2025 with the historical contract adjusted. */
  r8AcceptedOn?: string;
  c0StartDate?: string;
  /** S18/S21: C01 also prefers operations and has a process_design tag. */
  c01Operations?: boolean;
  /** S04 continuation: C03 minimum salary £28,000. */
  c03MinSalary?: number;
  /** S26: R1 seeded as a full-search draft. */
  r1FullSearchDraft?: boolean;
};

export async function generateCvPdf(text: string): Promise<Buffer> {
  const doc = await PDFDocument.create({ updateMetadata: false });
  const fixed = new Date('2026-01-01T00:00:00Z');
  doc.setCreationDate(fixed);
  doc.setModificationDate(fixed);
  doc.setProducer('BondMoran demo seed');
  doc.setCreator('BondMoran demo seed');
  const page = doc.addPage([595, 842]);
  const font = await doc.embedFont(StandardFonts.Helvetica);
  let y = 790;
  for (const raw of text.split('\n')) {
    const words = raw.split(' ');
    let line = '';
    for (const w of words) {
      const t = line ? `${line} ${w}` : w;
      if (font.widthOfTextAtSize(t, 11) > 495) { page.drawText(line, { x: 50, y, size: 11, font }); y -= 16; line = w; } else line = t;
    }
    page.drawText(line, { x: 50, y, size: 11, font });
    y -= 20;
  }
  return Buffer.from(await doc.save({ useObjectStreams: false }));
}

export function silentWav(seconds = 1): Buffer {
  const rate = 8000;
  const n = rate * seconds;
  const b = Buffer.alloc(44 + n * 2);
  b.write('RIFF', 0); b.writeUInt32LE(36 + n * 2, 4); b.write('WAVE', 8); b.write('fmt ', 12); b.writeUInt32LE(16, 16); b.writeUInt16LE(1, 20); b.writeUInt16LE(1, 22);
  b.writeUInt32LE(rate, 24); b.writeUInt32LE(rate * 2, 28); b.writeUInt16LE(2, 32); b.writeUInt16LE(16, 34); b.write('data', 36); b.writeUInt32LE(n * 2, 40);
  return b;
}

const domainOf = (name: string) => name.toLowerCase().replace(/[^a-z0-9]+/g, '') + '.example.test';

const ROLE_FX = [
  { code: 'R1', client: 'A', key: 'ALD-001', title: 'Assistant Accountant', family: 'finance', salary: 44000, outcome: 'Produce reliable reconciliations and clear monthly reporting', crit: [['reconciliation_ownership', 'Reconciliation ownership', 5, ['reconciliations']], ['clear_reporting', 'Clear reporting', 3, ['reporting', 'excel']], ['process_improvement', 'Process improvement', 2, ['automation', 'process_design']]] },
  { code: 'R2', client: 'A', key: 'ALD-002', title: 'Financial Controller', family: 'finance', salary: 90000, outcome: 'Strengthen controls and make cash assumptions visible', crit: [['controls', 'Controls', 5, ['controls']], ['cash_forecasting', 'Cash forecasting', 4, ['forecasting']], ['team_coordination', 'Team coordination', 3, ['leadership', 'coordination']]] },
  { code: 'R3', client: 'A', key: 'ALD-003', title: 'Accounts Assistant', family: 'finance', salary: 30000, outcome: 'Keep ledgers accurate and learn the close process', crit: [['bookkeeping', 'Bookkeeping', 5, ['bookkeeping']], ['accuracy_checks', 'Accuracy checks', 3, ['controls']], ['learning', 'Learning', 2, ['learning']]] },
  { code: 'R4', client: 'B', key: 'BCN-001', title: 'Operations Lead', family: 'operations', salary: 55000, outcome: 'Make operational handoffs clear and reduce delays', crit: [['process_design', 'Process design', 5, ['process_design']], ['coordination', 'Coordination', 4, ['coordination']], ['delivery_ownership', 'Delivery ownership', 3, ['project_delivery']]] },
  { code: 'R5', client: 'B', key: 'BCN-002', title: 'Finance Director', family: 'finance', salary: 110000, outcome: 'Lead planning and finance decision support', crit: [['finance_leadership', 'Finance leadership', 5, ['leadership']], ['budget_ownership', 'Budget ownership', 4, ['budgeting']], ['forecasting', 'Forecasting', 3, ['forecasting']]] },
  { code: 'R6', client: 'B', key: 'BCN-003', title: 'Finance Manager', family: 'finance', salary: 70000, outcome: 'Coordinate budgets and reporting', crit: [['budgeting', 'Budgeting', 5, ['budgeting']], ['reporting', 'Reporting', 4, ['reporting']], ['close_process', 'Close process', 3, ['month_end']]] },
  { code: 'R7', client: 'C', key: 'CDR-001', title: 'Commercial Coordinator', family: 'commercial', salary: 32000, outcome: 'Understand customer questions and support commercial activity', crit: [['customer_understanding', 'Customer understanding', 5, ['customer_work']], ['commercial_support', 'Commercial support', 3, ['sales']], ['learning', 'Learning', 2, ['learning']]] },
  { code: 'R8', client: 'C', key: 'CDR-002', title: 'Growth Associate', family: 'commercial', salary: 60000, outcome: 'Run organised growth experiments', crit: [['sales_support', 'Sales support', 4, ['sales']], ['project_delivery', 'Project delivery', 4, ['project_delivery']], ['analysis', 'Analysis', 2, ['analysis']]] },
] as const;

export type SeedIds = { datasetId: string; generation: number; users: Record<string, string>; candidates: Record<string, string>; clients: Record<string, string>; roles: Record<string, string>; orgs: Record<string, string> };

const at = (base: BaseCtx, iso: string): BaseCtx => ({ ...base, now: new Date(iso) });

/** Creates a fresh dataset in "preparing" state and seeds the baseline into it. */
export async function seedDataset(opts: SeedOptions & { name?: string; scenarioCode?: string | null } = {}): Promise<SeedIds> {
  const pw = process.env.DEMO_LOGIN_PASSWORD;
  if (!pw || pw === 'choose-a-private-demo-password') throw new Error('DEMO_LOGIN_PASSWORD must be set to a private value before seeding');
  const passwordHash = await argon2.hash(pw, { type: argon2.argon2id });
  const [{ g }] = (await db().execute(sql`select coalesce(max(generation), 0)::int + 1 as g from datasets`)).rows as { g: number }[];
  const id = (code: string) => uuidv5(`${g}:${code}`, NS);
  const datasetId = id('dataset');
  await db().insert(S.datasets).values({ id: datasetId, name: opts.name ?? 'BondMoran demo', seedVersion: prototype.seedVersion, scenarioCode: opts.scenarioCode ?? null, businessNow: new Date(prototype.demoBusinessNow), status: 'preparing', isDemo: true, generation: g });
  const ids: SeedIds = { datasetId, generation: g, users: {}, candidates: {}, clients: {}, roles: {}, orgs: {} };
  const system: BaseCtx = { datasetId, generation: g, now: new Date(prototype.demoBusinessNow), actor: { kind: 'system', label: 'seed' } };
  const T = (b: BaseCtx, fn: (c: Ctx) => Promise<unknown>) => withTx(b, fn as (c: Ctx) => Promise<void>, { skipDatasetCheck: true });

  // ---- pre-generate CV PDFs outside transactions ----
  const cvBytes = new Map<string, Buffer>();
  for (const c of CANDIDATES) if (c.code !== 'C40') cvBytes.set(c.code, await generateCvPdf(cvText(c, `candidate.${c.code.toLowerCase()}@example.test`)));

  await T(system, async (ctx) => {
    const tx = ctx.tx;
    const user = async (code: string, email: string, type: 'candidate' | 'client' | 'consultant', displayName: string | null) => {
      const uid = id(`user:${code}`);
      await tx.insert(S.users).values({ id: uid, datasetId, emailNormalized: email, passwordHash, userType: type, displayName });
      ids.users[code] = uid;
      return uid;
    };
    const alex = await user('alex', 'alex@bondmoran.example.test', 'consultant', 'Alex Morgan');
    const jamie = await user('jamie', 'jamie@bondmoran.example.test', 'consultant', 'Jamie Patel');

    const org = async (code: string, name: string, domain: string | null, groupId: string | null, isClient: boolean) => {
      const oid = id(`org:${code}`);
      await tx.insert(S.organisations).values({ id: oid, datasetId, legalName: `${name} Ltd (fictional)`, displayName: name, canonicalDomain: domain, groupId, isClient });
      await tx.insert(S.organisationAliases).values({ datasetId, organisationId: oid, aliasNormalized: name.toLowerCase(), aliasType: 'name' }).onConflictDoNothing();
      if (domain) await tx.insert(S.organisationAliases).values({ datasetId, organisationId: oid, aliasNormalized: domain, aliasType: 'domain' }).onConflictDoNothing();
      ids.orgs[name] = oid;
      return oid;
    };
    const alderGroup = await org('alder-group', 'Alder Group', 'aldergroup.example.test', null, false);
    const orgA = await org('alder', 'Alder Works', 'alder.example.test', alderGroup, true);
    const orgB = await org('beacon', 'Beacon Studio', 'beacon.example.test', null, true);
    const orgC = await org('cedar', 'Cedar Labs', 'cedar.example.test', null, true);
    for (const c of CANDIDATES) if (c.employer && !ids.orgs[c.employer]) await org(`emp:${c.employer}`, c.employer, domainOf(c.employer), null, false);

    const clientFx = [
      { code: 'A', org: orgA, consultant: alex, contact: 'Emma Stone', email: 'emma@alder.example.test', fee: 2000, train: { mode: 'online' as const, status: 'completed' as const } },
      { code: 'B', org: orgB, consultant: alex, contact: 'Tom Avery', email: 'tom@beacon.example.test', fee: 1800, train: { mode: 'in_person' as const, status: 'completed' as const } },
      { code: 'C', org: orgC, consultant: jamie, contact: 'Rachel Lane', email: 'rachel@cedar.example.test', fee: 1000, train: { mode: 'online' as const, status: 'booked' as const } },
    ];
    const briefs: Record<string, string> = {
      A: 'Alder Works is hiring an Assistant Accountant (ALD-001) and a Financial Controller (ALD-002), with an Accounts Assistant (ALD-003) in draft.',
      B: 'Beacon Studio is hiring an Operations Lead (BCN-001). Finance Director (BCN-002) and Finance Manager (BCN-003) were filled earlier this year.',
      C: 'Cedar Labs is hiring a Commercial Coordinator (CDR-001). Growth Associate (CDR-002) was closed with an accepted candidate at offer.',
    };
    for (const c of clientFx) {
      const cid = id(`client:${c.code}`);
      ids.clients[c.code] = cid;
      await tx.insert(S.clients).values({ id: cid, datasetId, organisationId: c.org, consultantUserId: c.consultant, contactName: c.contact, contactEmail: c.email, status: 'active', existingFeeBps: c.fee });
      const uid = await user(`client:${c.code}`, c.email, 'client', c.contact);
      await tx.insert(S.clientMemberships).values({ datasetId, clientId: cid, userId: uid, membershipRole: 'owner' });
      const done = c.train.status === 'completed';
      await tx.insert(S.clientOnboarding).values({ datasetId, clientId: cid, introStatus: 'completed', trainingMode: c.train.mode, trainingStatus: c.train.status, scheduledAt: done ? null : new Date('2026-11-12T10:00:00Z'), completedAt: done ? new Date('2026-10-20T10:00:00Z') : null, interviewTrainingDone: done, processDesignDone: done, jobSpecsDone: done, assessmentTrainingDone: done, hiringBrief: briefs[c.code] });
    }

    // ---- contracts and grants ----
    const contract = async (code: string, clientCode: string, v: { plan: 'annual' | 'monthly'; start: string; end: string; rate: number; roles: number; units: bigint; inst: number; status: 'active' | 'expired'; label: string }) => {
      const kid = id(`contract:${code}`);
      await tx.insert(S.contracts).values({ id: kid, datasetId, clientId: ids.clients[clientCode], planType: v.plan, status: v.status, startDate: v.start, endDate: v.end, creditRatePence: v.rate, includedOpenRoles: v.roles, committedCreditUnits: v.units, instalmentCount: v.inst, pricingVersion: prototype.pricingVersion, termsSnapshot: currentTermsSnapshot(), label: v.label, activatedAt: new Date(v.start + 'T09:00:00Z'), rolloverNote: code === 'C' ? 'Demonstration continuation of the C0 balance, pending rollover terms. To be agreed.' : 'To be agreed' });
      return kid;
    };
    const kA = await contract('A', 'A', { plan: 'annual', start: '2026-11-01', end: '2027-10-31', rate: prototype.packCreditPence, roles: 2, units: 100000n, inst: 12, status: 'active', label: 'Annual pack' });
    const kB = await contract('B', 'B', { plan: 'annual', start: '2026-04-01', end: '2027-03-31', rate: prototype.packCreditPence, roles: 2, units: 100000n, inst: 12, status: 'active', label: 'Annual pack' });
    const kC0 = await contract('C0', 'C', { plan: 'monthly', start: opts.c0StartDate ?? '2026-09-01', end: '2026-10-31', rate: prototype.singleCreditPence, roles: 1, units: opts.cedarGrantUnits ?? 40000n, inst: 1, status: 'expired', label: 'Historical monthly (C0)' });
    const kC = await contract('C', 'C', { plan: 'monthly', start: '2026-11-01', end: '2026-11-30', rate: prototype.singleCreditPence, roles: 1, units: 0n, inst: 1, status: 'active', label: 'Monthly (demo fixture rate)' });
    const wallets: Record<string, string> = {};
    for (const c of ['A', 'B', 'C']) wallets[c] = (await ensureWallet(ctx, ids.clients[c])).id;
    const grant = async (b: BaseCtx, clientCode: string, contractId: string, units: bigint, rate: number) => withTxInline(ctx, b, (c2) => insertTransaction(c2, { walletId: wallets[clientCode], clientId: ids.clients[clientCode], contractId, type: 'grant', deltaUnits: units, ratePence: rate, idempotencyKey: `seed:grant:${contractId}`, reason: 'Contract activation (simulated entitlement, not a payment)' }));
    await grant(at(system, '2026-11-01T09:00:00Z'), 'A', kA, 100000n, prototype.packCreditPence);
    await grant(at(system, '2026-04-01T09:00:00Z'), 'B', kB, 100000n, prototype.packCreditPence);
    await grant(at(system, (opts.c0StartDate ?? '2026-09-01') + 'T09:00:00Z'), 'C', kC0, opts.cedarGrantUnits ?? 40000n, prototype.singleCreditPence);
    const contractOf: Record<string, string> = { A: kA, B: kB, C: kC };

    // ---- candidates ----
    for (const [i, fx] of CANDIDATES.entries()) await seedCandidate(ctx, id, ids, fx, i, opts, cvBytes.get(fx.code) ?? null, alex);

    // ---- roles ----
    for (const r of ROLE_FX) {
      const rid = id(`role:${r.code}`);
      ids.roles[r.code] = rid;
      const contractId = r.code === 'R8' ? kC0 : contractOf[r.client];
      const mode = r.code === 'R5' || (r.code === 'R1' && opts.r1FullSearchDraft) ? 'full_search' : 'standard';
      const status = r.code === 'R3' || (r.code === 'R1' && opts.r1FullSearchDraft) ? 'draft' : r.code === 'R5' || r.code === 'R6' || r.code === 'R8' ? 'closed' : 'open';
      const brief = `${r.outcome}. Criteria: ${r.crit.map((c) => c[1]).join(', ')}.`;
      await tx.insert(S.roles).values({ id: rid, datasetId, clientId: ids.clients[r.client], contractId, vacancyKey: r.key, title: r.title, roleFamily: r.family, locationRegion: 'london', workMode: 'hybrid', salaryPence: BigInt(r.salary) * 100n, workAuthorisationRequired: true, briefText: brief, outcomes: [r.outcome], teachableSkills: ['Our internal systems', 'Our reporting format'], status, closureReason: status === 'closed' ? (r.code === 'R8' ? 'on_hold' : 'filled') : null, closedAt: status === 'closed' ? new Date('2026-10-31T12:00:00Z') : null, assignedConsultantId: r.client === 'C' ? jamie : alex, pricingLockedAt: status === 'draft' ? null : new Date('2026-04-01T09:00:00Z'), defaultServiceMode: mode, createdByUserId: alex, createdAt: new Date('2026-03-01T09:00:00Z') });
      await tx.insert(S.roleCriteria).values(r.crit.map((c, k) => ({ datasetId, roleId: rid, criterionKey: c[0], label: c[1], description: `${c[1]} relevant to: ${r.outcome.toLowerCase()}`, importance: k < 2 ? ('essential' as const) : ('desirable' as const), weight: c[2], evidenceTags: [...c[3]], ordinal: k + 1 })));
      if (status !== 'draft') {
        const rate = r.client === 'C' ? prototype.singleCreditPence : prototype.packCreditPence;
        const base = quoteStandardCredits(r.salary * 100);
        const total = priceOrder(base, mode);
        await tx.insert(S.hireOrders).values({ id: id(`order:${r.code}:1`), datasetId, clientId: ids.clients[r.client], roleId: rid, contractId, orderNumber: 1, kind: 'primary', serviceMode: mode, salarySnapshotPence: BigInt(r.salary) * 100n, baseUnits: base, totalUnits: total, depositDueUnits: depositForPrimary(base), rateSnapshotPence: rate, totalPence: penceForUnits(total, rate), pricingVersion: prototype.pricingVersion, status: 'quoted' });
      }
    }

    // ---- baseline introductions, ledger and hires ----
    const accept = async (roleCode: string, candCode: string, acceptedIso: string, stage: 'interview' | 'offer' | 'hired', clientCode: string) => {
      const iid = id(`intro:${roleCode}:${candCode}`);
      const requested = new Date(new Date(acceptedIso).getTime() - 2 * 86400000);
      await tx.insert(S.introductions).values({ id: iid, datasetId, roleId: ids.roles[roleCode], candidateId: ids.candidates[candCode], clientId: ids.clients[clientCode], requestedByUserId: ids.users[`client:${clientCode}`], state: 'accepted', requestedAt: requested, expiresAt: new Date(requested.getTime() + 7 * 86400000), respondedAt: new Date(acceptedIso), acceptedAt: new Date(acceptedIso) });
      await tx.insert(S.identityGrants).values({ datasetId, introductionId: iid, candidateId: ids.candidates[candCode], clientId: ids.clients[clientCode], roleId: ids.roles[roleCode], grantedAt: new Date(acceptedIso) });
      await tx.insert(S.pipelineEntries).values({ datasetId, introductionId: iid, stage, updatedByUserId: ids.users[`client:${clientCode}`] });
      return iid;
    };
    const debit = async (iso: string, clientCode: string, roleCode: string, orderNo: number, type: 'deposit_debit' | 'hire_balance_debit', units: bigint, hireId: string | null) => {
      const [o] = await tx.select().from(S.hireOrders).where(eq(S.hireOrders.id, id(`order:${roleCode}:${orderNo}`)));
      await withTxInline(ctx, at(system, iso), (c2) => insertTransaction(c2, { walletId: wallets[clientCode], clientId: ids.clients[clientCode], contractId: o.contractId, orderId: o.id, roleId: o.roleId, hireId, type, deltaUnits: -units, ratePence: o.rateSnapshotPence, deltaPence: type === 'hire_balance_debit' ? -(BigInt(o.totalPence) - penceForUnits(BigInt(o.depositDueUnits), o.rateSnapshotPence)) : undefined, idempotencyKey: `seed:${type}:${o.id}`, reason: type === 'deposit_debit' ? 'Role deposit charged when the first introduction was accepted' : 'First hire: remaining balance after deposit' }));
      await tx.update(S.hireOrders).set({ status: type === 'deposit_debit' ? 'deposit_paid' : 'paid' }).where(eq(S.hireOrders.id, o.id));
      return o;
    };
    const hire = async (roleCode: string, candCode: string, introId: string, clientCode: string, offer: string, start: string, left: string, salary: number) => {
      const hid = id(`hire:${roleCode}`);
      await tx.insert(S.hires).values({ id: hid, datasetId, clientId: ids.clients[clientCode], roleId: ids.roles[roleCode], candidateId: ids.candidates[candCode], introductionId: introId, orderId: id(`order:${roleCode}:1`), source: 'in_system', agreedSalaryPence: BigInt(salary) * 100n, acceptedOfferDate: offer, startDate: start, status: 'left', leftDate: left, leftReason: 'Recorded departure (fictional)', createdByUserId: ids.users[`client:${clientCode}`], duplicateKey: `${ids.clients[clientCode]}:${ids.candidates[candCode]}:${start}`, candidateRefSnapshot: candCode.replace('C', 'CAND-0') });
      return hid;
    };

    // R6 (Beacon) April 2026
    const i6 = await accept('R6', 'C18', '2026-04-15T10:00:00Z', 'hired', 'B');
    await debit('2026-04-15T10:00:00Z', 'B', 'R6', 1, 'deposit_debit', 3750n, null);
    const h6 = await hire('R6', 'C18', i6, 'B', '2026-04-20', '2026-05-01', '2026-11-01', 70000);
    await debit('2026-04-20T10:00:00Z', 'B', 'R6', 1, 'hire_balance_debit', 11250n, h6);
    // R5 (Beacon) August 2026, full search
    const i5 = await accept('R5', 'C23', '2026-08-20T10:00:00Z', 'hired', 'B');
    await debit('2026-08-20T10:00:00Z', 'B', 'R5', 1, 'deposit_debit', 5000n, null);
    const h5 = await hire('R5', 'C23', i5, 'B', '2026-08-25', '2026-09-01', '2026-10-16', 110000);
    await debit('2026-08-25T10:00:00Z', 'B', 'R5', 1, 'hire_balance_debit', 25000n, h5);
    // R8 (Cedar, historical C0)
    const r8At = (opts.r8AcceptedOn ?? '2026-09-01') + 'T10:00:00Z';
    await accept('R8', 'C36', r8At, 'offer', 'C');
    await debit(r8At, 'C', 'R8', 1, 'deposit_debit', 2500n, null);
    // R4 (Beacon) October 2026
    const i4 = await accept('R4', 'C25', '2026-10-30T10:00:00Z', 'offer', 'B');
    await debit('2026-10-30T10:00:00Z', 'B', 'R4', 1, 'deposit_debit', 2500n, null);
    // R2 (Alder) November 2026
    await accept('R2', 'C22', '2026-11-03T10:00:00Z', 'interview', 'A');
    await debit('2026-11-03T10:00:00Z', 'A', 'R2', 1, 'deposit_debit', 5000n, null);
    for (const r of ['R5', 'R6']) await tx.update(S.hireOrders).set({ status: 'paid' }).where(eq(S.hireOrders.id, id(`order:${r}:1`)));

    // ---- screenings ----
    const crit4 = await tx.select().from(S.roleCriteria).where(eq(S.roleCriteria.roleId, ids.roles.R4));
    const [ev25] = await tx.select().from(S.evidenceItems).where(eq(S.evidenceItems.candidateId, ids.candidates.C25)).limit(1);
    const sid = id('screening:R4:C25');
    const level: Record<string, string> = { process_design: 'specific', coordination: 'specific', delivery_ownership: 'unknown' };
    await tx.insert(S.screenings).values({ id: sid, datasetId, roleId: ids.roles.R4, candidateId: ids.candidates.C25, requestedByUserId: ids.users['client:B'], consultantUserId: alex, selectionMode: 'manual', status: 'completed', scheduledAt: new Date('2026-10-28T10:00:00Z'), completedAt: new Date('2026-10-28T10:30:00Z'), recordingConsentAt: new Date('2026-10-28T09:58:00Z'),
      notesPrivate: 'Fictional notes: walked through the onboarding map in detail; clear on what IT changed versus own work.', summarySafe: 'Screening confirmed a specific process-mapping example and clear coordination across teams. Broader delivery ownership was not covered and remains unknown.',
      criterionAssessments: crit4.map((c) => ({ criterionId: c.id, level: level[c.criterionKey], evidenceIds: level[c.criterionKey] === 'unknown' ? [] : [ev25.id], observationPrivate: level[c.criterionKey] === 'unknown' ? 'Not covered in the call.' : 'Described own actions and the measured change.' })) });
    await tx.insert(S.consentEvents).values({ datasetId, candidateId: ids.candidates.C25, kind: 'screening_recording', granted: true, termsVersion: 'recording-v1', actorUserId: alex, relatedScreeningId: sid, eventAt: new Date('2026-10-28T09:58:00Z') });
    const wav = silentWav(1);
    const wavKey = `datasets/${datasetId}/screenings/${sid}/recording/demo-placeholder`;
    await storage().put(wavKey, wav, 'audio/wav');
    await tx.insert(S.files).values({ datasetId, screeningId: sid, purpose: 'screening_recording', objectKey: wavKey, originalFilename: 'Demo recording placeholder.wav', mimeType: 'audio/wav', bytes: BigInt(wav.length), sha256: createHash('sha256').update(wav).digest('hex'), uploadState: 'ready', uploadedByUserId: alex });
    await tx.insert(S.workLogs).values({ datasetId, consultantUserId: alex, clientId: ids.clients.B, roleId: ids.roles.R4, screeningId: sid, category: 'screening', minutes: 18, workDate: '2026-10-28', note: 'Screening call (fictional)' });
    await tx.insert(S.screenings).values({ datasetId, roleId: ids.roles.R2, candidateId: ids.candidates.C22, requestedByUserId: ids.users['client:A'], selectionMode: 'manual', status: 'requested' });
    await tx.insert(S.workLogs).values([
      { datasetId, consultantUserId: alex, clientId: ids.clients.A, category: 'training', minutes: 90, workDate: '2026-10-20', note: 'Online hiring training' },
      { datasetId, consultantUserId: alex, clientId: ids.clients.B, category: 'training', minutes: 120, workDate: '2026-04-02', note: 'In-person hiring training' },
    ]);
    void i4;
    await recomputeAll(ctx);
  });
  return ids;
}

/** Runs fn against a ctx with a different business clock but the same transaction. */
async function withTxInline<T>(ctx: Ctx, b: BaseCtx, fn: (c: Ctx) => Promise<T>) {
  return fn({ ...ctx, now: b.now });
}

async function seedCandidate(ctx: Ctx, id: (c: string) => string, ids: SeedIds, fx: Fx, index: number, opts: SeedOptions, cv: Buffer | null, alex: string) {
  const tx = ctx.tx;
  const datasetId = ctx.datasetId;
  const email = `candidate.${fx.code.toLowerCase()}@example.test`;
  const uid = id(`user:${fx.code}`);
  ids.users[fx.code] = uid;
  const [{ passwordHash }] = await tx.select({ passwordHash: S.users.passwordHash }).from(S.users).where(eq(S.users.id, ids.users.alex));
  await tx.insert(S.users).values({ id: uid, datasetId, emailNormalized: email, passwordHash, userType: 'candidate', displayName: null });
  const cid = id(`candidate:${fx.code}`);
  ids.candidates[fx.code] = cid;
  const isC38 = fx.code === 'C38', isC39 = fx.code === 'C39', isC40 = fx.code === 'C40';
  const families = fx.code === 'C01' && opts.c01Operations ? ['finance', 'operations'] : [fx.family];
  const minSalary = fx.code === 'C03' && opts.c03MinSalary ? opts.c03MinSalary : fx.minSalary;
  const orgId = fx.employer ? ids.orgs[fx.employer] : null;
  const createdAt = new Date('2026-01-10T09:00:00Z');
  await tx.insert(S.candidates).values({ id: cid, datasetId, userId: uid, publicRef: `CAND-${String(index + 1).padStart(3, '0')}`, status: isC40 || isC39 ? 'onboarding' : isC38 ? 'paused' : 'active', discoveryEnabled: !(isC38 || isC40 || isC39), employerResolutionStatus: orgId ? 'resolved' : 'not_employed', currentOrganisationId: orgId, preferredRoleFamilies: families, region: 'london', workModes: ['hybrid', 'remote'], minSalaryPence: BigInt(minSalary) * 100n, noticeWeeks: 4, workAuthorisation: 'confirmed', experienceBand: fx.band ?? 'established', createdAt });
  await tx.insert(S.candidateIdentity).values({ datasetId, candidateId: cid, fullName: fx.name, email, currentEmployerLabel: fx.employer, currentTitle: fx.title });
  const consent = (kind: 'terms' | 'ai_processing' | 'discovery' | 'aggregate_insights', granted: boolean) => ({ datasetId, candidateId: cid, kind, granted, termsVersion: TERMS_VERSION, actorUserId: uid, eventAt: createdAt });
  await tx.insert(S.consentEvents).values([consent('terms', true), consent('ai_processing', true), consent('discovery', !(isC38 || isC40)), consent('aggregate_insights', false)]);
  if (orgId) await tx.insert(S.candidateBlocks).values({ datasetId, candidateId: cid, organisationId: orgId, includeGroup: true, reason: 'current_employer', createdByUserId: uid });
  if (isC40) return;

  const key = `datasets/${datasetId}/candidates/${cid}/cv/seed`;
  const text = cvText(fx, email);
  if (cv) {
    await storage().put(key, cv, 'application/pdf');
    await tx.insert(S.files).values({ datasetId, candidateId: cid, purpose: 'cv', objectKey: key, originalFilename: `${fx.name.replace(/\s+/g, '-')}-CV.pdf`, mimeType: 'application/pdf', bytes: BigInt(cv.length), sha256: createHash('sha256').update(cv).digest('hex'), uploadState: 'ready', extractedTextPrivate: text, textConfirmedAt: createdAt, uploadedByUserId: uid, createdAt });
  }
  const [conv] = await tx.insert(S.conversations).values({ datasetId, candidateId: cid, kind: 'initial_screening', status: 'completed', questionCount: 2, completedAt: createdAt, provider: 'fixture', promptVersion: PROMPT_VERSION }).returning();
  const q1 = 'Tell me about a task you took responsibility for and what happened.';
  const q2 = 'What would you want us to understand about your contribution or what you still need to learn?';
  const [qa] = await tx.insert(S.checkInQuestions).values({ datasetId, conversationId: conv.id, ordinal: 1, questionText: q1, topic: 'experience', state: 'answered' }).returning();
  const [qb] = await tx.insert(S.checkInQuestions).values({ datasetId, conversationId: conv.id, ordinal: 2, questionText: q2, topic: 'learning', state: 'answered' }).returning();
  const [a1] = await tx.insert(S.checkInAnswers).values({ datasetId, questionId: qa.id, candidateId: cid, body: fx.q1, status: 'submitted', submittedAt: createdAt }).returning();
  const [a2] = await tx.insert(S.checkInAnswers).values({ datasetId, questionId: qb.id, candidateId: cid, body: fx.q2, status: 'submitted', submittedAt: createdAt }).returning();
  const tags1 = fx.code === 'C01' && opts.c01Operations ? [...fx.tags, 'process_design'] : [...fx.tags];
  const anon = isC39 ? ('pending' as const) : ('approved' as const);
  const review = isC39 ? ('candidate_approved' as const) : ('consultant_verified' as const);
  const [e1] = await tx.insert(S.evidenceItems).values({ id: id(`evidence:${fx.code}:1`), datasetId, candidateId: cid, sourceKind: 'answer', sourceAnswerId: a1.id, sourceQuotePrivate: fx.q1, claimPrivate: fx.q1, safeClaim: fx.safe1, tags: tags1, uncertainty: fx.u1 ?? null, strength: fx.s1, reviewState: review, anonymityReview: anon, approvedByUserId: alex, approvedAt: createdAt, createdAt }).returning();
  const [e2] = await tx.insert(S.evidenceItems).values({ id: id(`evidence:${fx.code}:2`), datasetId, candidateId: cid, sourceKind: 'answer', sourceAnswerId: a2.id, sourceQuotePrivate: fx.q2, claimPrivate: fx.q2, safeClaim: fx.safe2, tags: [...fx.tags], uncertainty: fx.u2 ?? null, strength: fx.s2, reviewState: review, anonymityReview: anon, approvedByUserId: alex, approvedAt: createdAt, createdAt: new Date(createdAt.getTime() + 1000) }).returning();
  if (isC39) return;
  const strengths = [e1, e2].filter((e) => e.strength === 'specific').map((e) => ({ text: `You have shown a specific example: ${e.safeClaim}`, evidenceIds: [e.id] }));
  const gaps = [{ text: strengths.length ? 'Add an example of working with other people to get something done.' : 'Add an example of what happened after you acted, with a result you can describe.', topic: strengths.length ? 'collaboration' : 'outcome' }];
  const [pv] = await tx.insert(S.profileVersions).values({ datasetId, candidateId: cid, versionNumber: 1, headlineSafe: fx.headline, summarySafe: `${fx.safe1} ${fx.safe2}`.slice(0, 600), preferencesSnapshot: { region: 'london', workModes: ['hybrid', 'remote'], minSalaryPence: String(minSalary * 100), noticeWeeks: 4 }, evidenceIds: [e1.id, e2.id], feedback: { strengths, gaps, suggestedQuestionIds: [], nextQuestion: 'Tell me about working through a disagreement.', provider: 'fixture' }, reviewState: 'approved', approvalAt: createdAt, profileHash: createHash('sha256').update(fx.code + fx.safe1 + fx.safe2).digest('hex') }).returning();
  await tx.update(S.candidates).set({ latestProfileVersionId: pv.id }).where(eq(S.candidates.id, cid));
}
