import { describe, it, expect, afterEach } from 'vitest';
import { eq, and, sql } from 'drizzle-orm';
import { load } from './helpers';
import { db } from '../../src/server/db/client';
import * as S from '../../src/server/db/schema';
import { setProviderForTests, runAi, AiFailure } from '../../src/server/ai';
import { fixtureProvider } from '../../src/server/ai/providers/fixture';
import type { AiProvider } from '../../src/server/ai/providers/types';
import { recomputeRole, applyAssessment, assessmentInput } from '../../src/server/services/matching';
import { drainJobs } from '../../src/server/services/worker-handlers';
import { rebuildProfile } from '../../src/server/services/profiles';
import { createContractDraft, activateContract } from '../../src/server/services/contracts';
import { createDraftRole, activateRole } from '../../src/server/services/roles';
import { login } from '../../src/server/auth';
import { resetDemo } from '../../src/server/services/demo';

const usage = { inputTokens: 100, outputTokens: 50, cacheReadTokens: 0, cacheWriteTokens: 0, modelId: 'stand-in' };
const standIn = (over: Partial<AiProvider>): AiProvider => ({ ...fixtureProvider, name: 'anthropic', ...over });

afterEach(() => setProviderForTests(null));

describe('empty workspace', () => {
  it('has only the two consultants, and a consultant can build a client with a working login', async () => {
    const w = await load('EMPTY');
    const users = await db().select().from(S.users).where(eq(S.users.datasetId, w.ids.datasetId));
    expect(users.map((u) => u.userType).sort()).toEqual(['consultant', 'consultant']);
    expect(await db().select().from(S.candidates).where(eq(S.candidates.datasetId, w.ids.datasetId))).toHaveLength(0);
    // Create a client the same way the API does, then a contract and a role.
    const { ROUTES } = await import('../../src/server/api-routes');
    const r = ROUTES.find((x) => x.path === 'consultant/clients')!;
    const created = (await r.h({ req: {} as never, viewer: {} as never, base: w.consultant(), p: {}, body: { name: 'Test Co', contactName: 'Pat Example', contactEmail: 'pat@test.example', consultantUserId: w.ids.users.alex } })) as { id: string };
    const token = await login('pat@test.example', 'TestOnly2026!', 'test-ip');
    expect(token).toBeTruthy();
    const k = await w.T(w.consultant(), (c) => createContractDraft(c, { clientId: created.id, planType: 'annual', startDate: '2026-11-01', endDate: '2027-10-31', creditRatePounds: 3800, includedOpenRoles: 2, committedCredits: 10, instalmentCount: 12 }));
    await w.T(w.consultant(), (c) => activateContract(c, k.id));
    const role = await w.T(w.consultant(), (c) => createDraftRole(c, { clientId: created.id, vacancyKey: 'T-1', title: 'Analyst', roleFamily: 'finance', salaryPounds: 44000, locationRegion: 'london', workMode: 'hybrid', outcomes: ['Do good work'], criteria: [{ key: 'rec', label: 'Reconciliations', importance: 'essential', weight: 5, evidenceTags: ['reconciliations'] }, { key: 'rep', label: 'Reporting', importance: 'essential', weight: 3, evidenceTags: ['reporting'] }, { key: 'learn', label: 'Learning', importance: 'desirable', weight: 2, evidenceTags: ['learning'] }] }));
    const open = await w.T(w.consultant(), (c) => activateRole(c, role.id, { confirmExtraDeposit: false, idempotencyKey: w.key() }));
    expect(open.status).toBe('open');
    const [{ posted }] = (await db().execute(sql`select coalesce(sum(delta_units),0)::text as posted from credit_transactions where client_id = ${created.id}`)).rows as { posted: string }[];
    expect(posted).toBe('100000');
  });
});

describe('live assessment job (stand-in provider)', () => {
  it('queues stale pairs, applies validated AI levels, and rejects foreign evidence', async () => {
    const w = await load();
    const roleId = w.ids.roles.R1;
    setProviderForTests(standIn({
      async assessCriteria(i) {
        // Mark every criterion "specific" with the first evidence item, except one candidate gets a foreign ID.
        const bad = i.evidence.some((e) => e.safeClaim.includes('ticket sales'));
        return { provider: 'anthropic', usage, output: { criteria: i.criteria.map((c) => ({ criterionId: c.criterionId, level: 'specific' as const, evidenceIds: [bad ? '00000000-0000-4000-8000-000000000000' : i.evidence[0].id], reasonSafe: 'Relevant approved example.' })) } };
      },
    }));
    await w.T(w.consultant(), (c) => recomputeRole(c, roleId));
    const queued = await db().select().from(S.jobs).where(and(eq(S.jobs.kind, 'assess_match'), eq(S.jobs.subjectId, roleId)));
    expect(queued.length).toBeGreaterThan(0);
    await drainJobs();
    const ms = await db().select().from(S.matches).where(eq(S.matches.roleId, roleId));
    const c01 = ms.find((m) => m.candidateId === w.ids.candidates.C01)!;
    const c10 = ms.find((m) => m.candidateId === w.ids.candidates.C10)!;
    expect(c01.provider).toBe('anthropic');
    expect(c01.score).toBe(100);
    expect(c10.provider).toBe('fixture'); // foreign evidence ID rejected, deterministic result kept
    // A later recompute keeps the cached AI result while versions are unchanged.
    await w.T(w.consultant(), (c) => recomputeRole(c, roleId));
    const [again] = await db().select().from(S.matches).where(and(eq(S.matches.roleId, roleId), eq(S.matches.candidateId, w.ids.candidates.C01)));
    expect(again.provider).toBe('anthropic');
  });
  it('discards a result computed for an older role version', async () => {
    const w = await load();
    const roleId = w.ids.roles.R1;
    const prepared = (await assessmentInput({ tx: db() }, roleId, w.ids.candidates.C01))!;
    await db().update(S.roles).set({ roleVersion: prepared.roleVersion + 1 }).where(eq(S.roles.id, roleId));
    const out = await w.T(w.consultant(), (c) => applyAssessment(c, { roleId, candidateId: w.ids.candidates.C01, profileVersionId: prepared.profileVersionId, roleVersion: prepared.roleVersion, output: { criteria: [] } }));
    expect(out).toMatchObject({ applied: false, reason: 'stale_discarded' });
  });
});

describe('live feedback job', () => {
  it('keeps only strengths that cite the profile’s own evidence and leaves approved content unchanged', async () => {
    const w = await load();
    setProviderForTests(standIn({
      async feedback(i) {
        return { provider: 'anthropic', usage, output: { strengths: [{ text: 'Supported.', evidenceIds: [i.evidence[0].id] }, { text: 'Invented.', evidenceIds: ['00000000-0000-4000-8000-000000000000'] }], gaps: [{ text: 'Add an outcome.', topic: 'outcome' as const }], nextQuestion: 'What happened next?' } };
      },
    }));
    const [ev] = await db().select().from(S.evidenceItems).where(eq(S.evidenceItems.candidateId, w.ids.candidates.C02));
    await db().update(S.evidenceItems).set({ uncertainty: 'Edited for test' }).where(eq(S.evidenceItems.id, ev.id));
    await w.T(w.consultant(), (c) => rebuildProfile(c, w.ids.candidates.C02, { summary: 'Rebuilt for test.' }));
    await drainJobs();
    const [c] = await db().select().from(S.candidates).where(eq(S.candidates.id, w.ids.candidates.C02));
    const [pv] = await db().select().from(S.profileVersions).where(eq(S.profileVersions.id, c.latestProfileVersionId!));
    const live = pv.feedbackLive as { strengths: { text: string }[] };
    expect(live.strengths.map((s) => s.text)).toEqual(['Supported.']);
    expect(pv.summarySafe).toBe('Rebuilt for test.');
  });
});

describe('AI admission controls', () => {
  it('enforces the per-user hourly limit', async () => {
    await load();
    setProviderForTests(standIn({ async nextQuestion() { return { provider: 'anthropic', usage, output: { question: 'Q?', topic: 'experience', reason: 'r' } }; } }));
    const userId = crypto.randomUUID();
    for (let i = 0; i < 60; i++) await runAi({ task: 'question', userId, input: i }, (p) => p.nextQuestion({ topic: 'experience', recentMessages: [], evidenceSummary: [] }));
    await expect(runAi({ task: 'question', userId, input: 61 }, (p) => p.nextQuestion({ topic: 'experience', recentMessages: [], evidenceSummary: [] }))).rejects.toMatchObject({ code: 'user_rate_limited' });
  });
  it('refuses calls over the daily token budget, and the budget survives a demo reset', async () => {
    await load();
    setProviderForTests(standIn({}));
    const today = new Date().toISOString().slice(0, 10);
    await db().insert(S.aiBudgetReservations).values({ requestKey: crypto.randomUUID(), utcDate: today, reservedTokens: 200000, actualTokens: 200000, state: 'reconciled', expiresAt: new Date(Date.now() + 3600000) });
    await resetDemo();
    await expect(runAi({ task: 'question', input: 'x' }, (p) => p.nextQuestion({ topic: 'experience', recentMessages: [], evidenceSummary: [] }))).rejects.toBeInstanceOf(AiFailure);
    await db().delete(S.aiBudgetReservations).where(eq(S.aiBudgetReservations.utcDate, today));
  });
});
