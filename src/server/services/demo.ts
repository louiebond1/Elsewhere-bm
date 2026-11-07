/**
 * Demo facilitator controls: initial seed, reset generations and scenario variants.
 * Scenario preconditions are produced by the same services as the normal screens.
 */
import { and, eq, ne, sql, inArray, like } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import { db } from '../db/client';
import * as S from '../db/schema';
import { seedDataset, type SeedIds, type SeedOptions } from './demo-seed';
import { withTx, type BaseCtx, type Ctx, type Actor } from './context';
import { requestIntroduction, acceptIntroduction } from './intros';
import { recordHire, recordOutsideHire } from './hires';
import { requestScreening, completeScreening } from './screenings';
import { criteriaFor } from './roles';
import { roleScopedRef } from '../dto/refs';
import { storage } from './storage';
import { postedBalance } from './ledger';
import { formatCredits } from '../lib/pricing';
import { AppError } from '../lib/errors';

export type Scenario = { code: string; title: string; persona: string; personaCode: string; action: string; expected: string; options?: SeedOptions; setup?: (h: Helpers) => Promise<void> };

type Helpers = {
  ids: SeedIds;
  asClient: (c: 'A' | 'B' | 'C') => BaseCtx;
  asCandidate: (code: string) => BaseCtx;
  asConsultant: () => BaseCtx;
  T: <R>(b: BaseCtx, fn: (c: Ctx) => Promise<R>) => Promise<R>;
  request: (roleCode: string, cand: string, client: 'A' | 'B' | 'C') => Promise<string>;
  accept: (introId: string, cand: string) => Promise<void>;
};

const DEFAULT_OFFER = '2026-11-06';
const DEFAULT_START = '2026-11-20';

export const SCENARIOS: Scenario[] = [
  { code: 'EMPTY', title: 'Empty workspace', persona: 'Alex Morgan (consultant)', personaCode: 'alex', action: 'Create a client (it gets its own login), add and activate a contract, then add a role. Create candidates from the sign-up page.', expected: 'You build everything yourself. Only the two consultant accounts exist at the start.', options: { empty: true } },
  { code: 'S01', title: 'Fair first interview', persona: 'Emma Stone (Alder Works)', personaCode: 'client:A', action: 'Open Assistant Accountant and view the anonymous profile with the reconciliation story.', expected: 'Thin CV duties versus a specific reconciliation story. No name before acceptance.' },
  { code: 'S02', title: 'Standard deposit and hire', persona: 'Maya Ellis (C01), then Emma Stone', personaCode: 'C01', action: 'Accept the Alder introduction as C01, then record the hire as Alder.', expected: '£950 deposit, £2,850 balance, £3,800 total. Wallet A ends at 8.5 credits.',
    setup: async (h) => { await h.request('R1', 'C01', 'A'); } },
  { code: 'S03', title: 'Further intro is free', persona: 'Daniel Reed (C02)', personaCode: 'C02', action: 'Accept the pending Alder introduction as C02.', expected: 'No new debit. Accepted count becomes two.',
    setup: async (h) => { const i = await h.request('R1', 'C01', 'A'); await h.accept(i, 'C01'); await h.request('R1', 'C02', 'A'); } },
  { code: 'S04', title: 'Extra role', persona: 'Emma Stone (Alder Works)', personaCode: 'client:A', action: 'Activate the Accounts Assistant draft (ALD-003).', expected: '0.125 credits (£475) upfront; the role opens as extra. A later first accepted intro causes no second deposit.', options: { c03MinSalary: 28000 } },
  { code: 'S05', title: 'Full search upgrade', persona: 'Emma Stone (Alder Works)', personaCode: 'client:A', action: 'Request full search on Assistant Accountant, then record the first hire.', expected: 'Total 1.5 credits (£5,700); balance 1.25 credits (£4,750); nothing charged at upgrade.',
    setup: async (h) => { const i = await h.request('R1', 'C01', 'A'); await h.accept(i, 'C01'); } },
  { code: 'S06', title: 'Free replacement', persona: 'Tom Avery (Beacon Studio), then Alex Morgan', personaCode: 'client:B', action: 'Request a replacement for the Finance Director hire, then approve it as the consultant.', expected: 'Linked zero-price role with new limits and no slot charge. A guided C24 acceptance and hire records zero.' },
  { code: 'S07', title: 'Window expired', persona: 'Tom Avery (Beacon Studio)', personaCode: 'client:B', action: 'Request a replacement for the Finance Manager hire.', expected: 'Not eligible. No zero-price role and no charge.' },
  { code: 'S08', title: 'Second hire', persona: 'Emma Stone (Alder Works)', personaCode: 'client:A', action: 'Record the hire for the second accepted candidate.', expected: 'A new 1-credit (£3,800) debit. The deposit is not reused and the first hire is unchanged.',
    setup: async (h) => {
      const i1 = await h.request('R1', 'C01', 'A'); await h.accept(i1, 'C01');
      await h.T(h.asClient('A'), (c) => recordHire(c, { introductionId: i1, acceptedOfferDate: DEFAULT_OFFER, startDate: DEFAULT_START, salaryPence: 4400000n, idempotencyKey: randomUUID() }));
      const i2 = await h.request('R1', 'C02', 'A'); await h.accept(i2, 'C02');
    } },
  { code: 'S09', title: 'Outside-system hire', persona: 'Jamie Patel (consultant)', personaCode: 'jamie', action: 'Record Cedar’s outside hire of the Growth Associate candidate: offer 15 Oct, start 1 Nov.', expected: '0.75 credits (£3,375) balance only; total £4,500; no new deposit or penalty.' },
  { code: 'S10', title: 'Duplicate outside record', persona: 'Jamie Patel (consultant)', personaCode: 'jamie', action: 'Submit the same outside hire again.', expected: 'The existing hire opens. Zero additional debit.',
    setup: async (h) => {
      const [intro] = await db().select().from(S.introductions).where(and(eq(S.introductions.roleId, h.ids.roles.R8), eq(S.introductions.candidateId, h.ids.candidates.C36)));
      await h.T(h.asConsultant(), (c) => recordOutsideHire(c, { clientId: h.ids.clients.C, introductionId: intro.id, acceptedOfferDate: '2026-10-15', startDate: '2026-11-01', salaryPence: 6000000n, idempotencyKey: randomUUID() }));
    } },
  { code: 'S11', title: 'Tenth intro cap', persona: 'Grace Wilson (C11), then Emma Stone', personaCode: 'C11', action: 'Accept the tenth introduction as C11, then try to request C12 as Alder.', expected: 'Count reaches 10; requesting C12 is blocked. Withdrawn acceptances still count.',
    setup: async (h) => {
      for (const c of ['C01', 'C02', 'C03', 'C04', 'C06', 'C07', 'C08', 'C09', 'C10']) { const i = await h.request('R1', c, 'A'); await h.accept(i, c); }
      await h.request('R1', 'C11', 'A');
    } },
  { code: 'S12', title: 'Employer hiding', persona: 'Emma Stone (Alder Works)', personaCode: 'client:A', action: 'Look for Hannah Cole (C05) in Alder roles and by direct URL.', expected: 'No result and a 404 response. C05’s privacy page shows Alder Works hidden.' },
  { code: 'S13', title: 'Close and reopen', persona: 'Emma Stone (Alder Works)', personaCode: 'client:A', action: 'Close Assistant Accountant, then reopen it.', expected: 'Deposit and two accepted intros remain; the pending request is cancelled and the hold cleared. No reset and no new deposit.',
    setup: async (h) => { for (const c of ['C01', 'C02']) { const i = await h.request('R1', c, 'A'); await h.accept(i, c); } await h.request('R1', 'C03', 'A'); } },
  { code: 'S14', title: 'Insufficient credits', persona: 'Evie Baker (C33), then Rachel Lane', personaCode: 'C33', action: 'Accept the Cedar introduction as C33, then try to record the hire as Cedar.', expected: 'The deposit succeeds and spendable falls to zero. The 0.375-credit hire balance is blocked and no hire is recorded.', options: { cedarGrantUnits: 3750n },
    setup: async (h) => { await h.request('R7', 'C33', 'C'); } },
  { code: 'S15', title: 'Fund and retry', persona: 'Jamie Patel, then Rachel Lane', personaCode: 'jamie', action: 'Grant one demo credit to Cedar, then record the C33 hire as Cedar.', expected: '0.375-credit debit at £4,500 = £1,687.50; R7 total £2,250; wallet ends at 0.625.', options: { cedarGrantUnits: 3750n },
    setup: async (h) => { const i = await h.request('R7', 'C33', 'C'); await h.accept(i, 'C33'); } },
  { code: 'S16', title: 'Decline without charge', persona: 'Maya Ellis (C01)', personaCode: 'C01', action: 'Decline the Alder introduction.', expected: 'Hold released, no deposit entry. Alder stays at 9.5 credits.',
    setup: async (h) => { await h.request('R1', 'C01', 'A'); } },
  { code: 'S17', title: 'Withdraw after deposit', persona: 'Maya Ellis (C01)', personaCode: 'C01', action: 'Withdraw the accepted Alder introduction.', expected: 'Identity access revoked; the 0.25 deposit remains; accepted count stays at one.',
    setup: async (h) => { const i = await h.request('R1', 'C01', 'A'); await h.accept(i, 'C01'); } },
  { code: 'S18', title: 'Delete mid-process', persona: 'Maya Ellis (C01)', personaCode: 'C01', action: 'Delete the profile.', expected: 'Both client views lose the profile, the pending request is cancelled and financial references remain without personal data.', options: { c01Operations: true },
    setup: async (h) => { const i = await h.request('R1', 'C01', 'A'); await h.accept(i, 'C01'); await h.request('R4', 'C01', 'B'); } },
  { code: 'S19', title: 'Auto screening', persona: 'Emma Stone (Alder Works)', personaCode: 'client:A', action: 'Preview automatic picks on Assistant Accountant, then confirm.', expected: 'Four strongest available plus a discovery slot for a low-information candidate. Five requests, no charges.' },
  { code: 'S20', title: 'Sixth screening', persona: 'Emma Stone (Alder Works)', personaCode: 'client:A', action: 'Request a screening for one more candidate on Assistant Accountant.', expected: 'Blocked by the included limit. No paid upsell and no ledger entry.',
    setup: async (h) => {
      const role = h.ids.roles.R1;
      const crit = await h.T(h.asConsultant(), (c) => criteriaFor(c, role));
      for (const code of ['C01', 'C02', 'C03', 'C04', 'C06']) {
        const s = await h.T(h.asClient('A'), (c) => requestScreening(c, { roleId: role, candidateRef: roleScopedRef(role, h.ids.candidates[code]) }));
        await h.T(h.asConsultant(), (c) => completeScreening(c, s.id, { minutes: 15, notesPrivate: 'Fictional scenario notes.', summarySafe: 'Screening completed for the demonstration scenario.', assessments: crit.map((k) => ({ criterionId: k.id, level: 'unknown' as const, evidenceIds: [], observationPrivate: '' })) }));
      }
    } },
  { code: 'S21', title: 'Two clients', persona: 'Maya Ellis (C01)', personaCode: 'C01', action: 'Accept only the Alder introduction.', expected: 'Only Alder on that role sees the name. Beacon still sees the anonymous profile and can be accepted later.', options: { c01Operations: true },
    setup: async (h) => { await h.request('R1', 'C01', 'A'); await h.request('R4', 'C01', 'B'); } },
  { code: 'S22', title: 'Onboarding', persona: 'Ravi Das (C40)', personaCode: 'C40', action: 'Load the fictional CV, answer the questions, review the draft evidence, then approve it as the consultant.', expected: 'Saved extraction, draft evidence and feedback; consultant review publishes the profile. Fixture mode does not pretend to analyse new text.' },
  { code: 'S23', title: 'AI failure', persona: 'Ravi Das (C40)', personaCode: 'C40', action: 'Answer and press Finish. The first profile job fails with a simulated timeout. Press Retry.', expected: 'Answers stay saved; one profile job result; no duplicate answers or evidence.' },
  { code: 'S24', title: 'Salary change blocked', persona: 'Emma Stone (Alder Works)', personaCode: 'client:A', action: 'Try to record the C01 hire at £45,000.', expected: 'A quote-review message, no hire and no additional debit.',
    setup: async (h) => { const i = await h.request('R1', 'C01', 'A'); await h.accept(i, 'C01'); } },
  { code: 'S25', title: 'Outside window', persona: 'Jamie Patel (consultant)', personaCode: 'jamie', action: 'Record Cedar’s outside hire with an offer on 2 Sep 2026.', expected: 'Outside the 12-month rule. No automated charge.', options: { r8AcceptedOn: '2025-09-01', c0StartDate: '2025-08-01' } },
  { code: 'S26', title: 'Full search from outset', persona: 'Emma Stone, then Maya Ellis', personaCode: 'client:A', action: 'Activate the full-search Assistant Accountant draft, request C01 and accept as C01.', expected: 'Deposit stays 0.25 base credits; total 1.5; remaining 1.25. No second deposit.', options: { r1FullSearchDraft: true } },
];

function helpers(ids: SeedIds): Helpers {
  const base = (actor: Actor): BaseCtx => ({ datasetId: ids.datasetId, generation: ids.generation, now: new Date('2026-11-06T11:00:00Z'), actor });
  const T = <R>(b: BaseCtx, fn: (c: Ctx) => Promise<R>) => withTx(b, fn, { skipDatasetCheck: true });
  const asClient = (c: 'A' | 'B' | 'C') => base({ kind: 'user', userId: ids.users[`client:${c}`], userType: 'client', clientId: ids.clients[c] });
  const asCandidate = (code: string) => base({ kind: 'user', userId: ids.users[code], userType: 'candidate', candidateId: ids.candidates[code] });
  const asConsultant = () => base({ kind: 'user', userId: ids.users.alex, userType: 'consultant' });
  return {
    ids, asClient, asCandidate, asConsultant, T,
    request: async (roleCode, cand, client) => (await T(asClient(client), (c) => requestIntroduction(c, { roleId: ids.roles[roleCode], candidateRef: roleScopedRef(ids.roles[roleCode], ids.candidates[cand]), message: 'We would like to talk about this role.', idempotencyKey: randomUUID() }))).id,
    accept: async (introId, cand) => { await T(asCandidate(cand), (c) => acceptIntroduction(c, introId, randomUUID())); },
  };
}

/** Baseline validation before a dataset can become active. */
export async function validateDataset(ids: SeedIds, scenario: string | null) {
  const count = async (t: string) => ((await db().execute(sql`select count(*)::int as n from ${sql.identifier(t)} where dataset_id = ${ids.datasetId}`)).rows[0] as { n: number }).n;
  const problems: string[] = [];
  if (scenario === 'EMPTY') {
    if ((await count('users')) !== 2) problems.push('expected only the two consultant accounts');
    if (problems.length) throw new Error(`Seed validation failed: ${problems.join('; ')}`);
    return;
  }
  const nRoles = await count('roles');
  if ((await count('candidates')) !== 40) problems.push('expected 40 candidates');
  if ((await count('clients')) !== 3) problems.push('expected 3 clients');
  if (!scenario && nRoles !== 8) problems.push('expected 8 roles');
  const ws = await db().select().from(S.wallets).where(eq(S.wallets.datasetId, ids.datasetId));
  for (const w of ws) {
    const posted = await postedBalance({ tx: db() } as Ctx, w.id);
    if (posted !== BigInt(w.availableCachedUnits)) problems.push(`wallet cache mismatch for ${w.clientId}`);
  }
  if (!scenario) {
    const expect: Record<string, string> = { A: '9.5', B: '5.25', C: '3.75' };
    for (const [code, v] of Object.entries(expect)) {
      const w = ws.find((x) => x.clientId === ids.clients[code]);
      if (!w || formatCredits(await postedBalance({ tx: db() } as Ctx, w.id)) !== v) problems.push(`wallet ${code} expected ${v}`);
    }
  }
  // C05 must never be matched for Alder; C32 never for Beacon; paused C38 nowhere.
  const bad = await db().execute(sql`select m.id from matches m join roles r on r.id = m.role_id where m.dataset_id = ${ids.datasetId} and ((m.candidate_id = ${ids.candidates.C05} and r.client_id = ${ids.clients.A}) or (m.candidate_id = ${ids.candidates.C32} and r.client_id = ${ids.clients.B}) or m.candidate_id = ${ids.candidates.C38} or m.candidate_id = ${ids.candidates.C39})`);
  if (bad.rows.length) problems.push('blocked or undiscoverable candidates appear in matches');
  if (problems.length) throw new Error(`Seed validation failed: ${problems.join('; ')}`);
}

async function purgeDataset(datasetId: string) {
  const objs = await db().select({ k: S.files.objectKey }).from(S.files).where(eq(S.files.datasetId, datasetId));
  for (const o of objs) await storage().delete(o.k).catch(() => {});
  await db().delete(S.localObjects).where(like(S.localObjects.objectKey, `datasets/${datasetId}/%`));
  await db().transaction(async (tx) => {
    await tx.execute(sql`select set_config('bm.allow_dataset_purge', 'on', true)`);
    await tx.execute(sql`delete from datasets where id = ${datasetId}`);
  });
}

/**
 * Prepares a new generation, validates it, then switches the active dataset atomically.
 * If preparation fails, the old dataset stays active. AI usage rows have no dataset FK
 * and are preserved across resets.
 */
export async function resetDemo(opts: { scenarioCode?: string | null } = {}) {
  if (process.env.APP_MODE !== 'demo') throw new AppError('NOT_FOUND', 404, 'Not found.');
  const scenario = opts.scenarioCode ? SCENARIOS.find((s) => s.code === opts.scenarioCode) : null;
  if (opts.scenarioCode && !scenario) throw new AppError('NOT_FOUND', 404, 'Unknown scenario.');
  const client = await (await import('../db/client')).getPool().connect();
  try {
    const got = await client.query('select pg_try_advisory_lock(hashtextextended($1, 0)) as ok', ['demo-reset']);
    if (!got.rows[0].ok) throw new AppError('RESET_IN_PROGRESS', 409, 'A reset is already running.');
    let ids: SeedIds | null = null;
    try {
      ids = await seedDataset({ ...(scenario?.options ?? {}), name: scenario ? `${scenario.code} ${scenario.title}` : 'BondMoran demo baseline', scenarioCode: scenario?.code ?? null });
      await validateDataset(ids, scenario?.code ?? null);
      if (scenario?.setup) await scenario.setup(helpers(ids));
    } catch (e) {
      if (ids) await purgeDataset(ids.datasetId).catch(() => {});
      throw e;
    }
    const old = await db().execute(sql`select active_dataset_id from application_state where id = 1`);
    const oldId = (old.rows[0] as { active_dataset_id: string | null } | undefined)?.active_dataset_id ?? null;
    await db().transaction(async (tx) => {
      await tx.execute(sql`insert into application_state (id, active_dataset_id, maintenance, last_reset_at, updated_at) values (1, ${ids!.datasetId}, false, now(), now())
        on conflict (id) do update set active_dataset_id = excluded.active_dataset_id, maintenance = false, last_reset_at = now(), updated_at = now()`);
      await tx.update(S.datasets).set({ status: 'active' }).where(eq(S.datasets.id, ids!.datasetId));
      if (oldId) await tx.update(S.datasets).set({ status: 'archived' }).where(eq(S.datasets.id, oldId));
    });
    // Old-generation sessions are already invalid (dataset mismatch). Purge archived data now.
    const archived = await db().select({ id: S.datasets.id }).from(S.datasets).where(and(ne(S.datasets.id, ids.datasetId), inArray(S.datasets.status, ['archived', 'preparing'])));
    for (const a of archived) await purgeDataset(a.id).catch(() => {});
    return ids;
  } finally {
    await client.query('select pg_advisory_unlock(hashtextextended($1, 0))', ['demo-reset']).catch(() => {});
    client.release();
  }
}

/** Initial seed only: refuses to replace an existing active dataset. */
export async function initialSeed() {
  const r = await db().execute(sql`select active_dataset_id from application_state where id = 1`);
  if ((r.rows[0] as { active_dataset_id: string | null } | undefined)?.active_dataset_id) return { skipped: true as const };
  const ids = await resetDemo();
  return { skipped: false as const, ids };
}

export async function personaDirectory(datasetId: string) {
  const rows = await db().select({ id: S.users.id, email: S.users.emailNormalized, type: S.users.userType, displayName: S.users.displayName, ref: S.candidates.publicRef, name: S.candidateIdentity.fullName, status: S.candidates.status })
    .from(S.users).leftJoin(S.candidates, eq(S.candidates.userId, S.users.id)).leftJoin(S.candidateIdentity, eq(S.candidateIdentity.candidateId, S.candidates.id))
    .where(and(eq(S.users.datasetId, datasetId), eq(S.users.status, 'active')));
  return rows.map((r) => ({ userId: r.id, type: r.type, label: r.displayName ?? r.name ?? r.email, ref: r.ref, email: r.email, status: r.status }));
}

export { DEFAULT_OFFER, DEFAULT_START };
