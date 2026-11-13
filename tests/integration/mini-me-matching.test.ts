import { describe, it, expect } from 'vitest';
import { eq, and } from 'drizzle-orm';
import { load } from './helpers';
import { db } from '../../src/server/db/client';
import * as S from '../../src/server/db/schema';
import { readCtx, type BaseCtx } from '../../src/server/services/context';
import { signupCandidate, resetMyProfile } from '../../src/server/services/candidates';
import { saveOwnAnswer } from '../../src/server/services/onboarding';
import { roleMatches, liveRoleMatches } from '../../src/server/views/client';

type W = Awaited<ReturnType<typeof load>>;
async function newCandidate(w: W, email: string) {
  const r = await w.T(w.consultant(), (c) => signupCandidate(c, { fullName: 'Ada Stone', email, password: 'long-enough-pw', region: 'london', workModes: ['hybrid'], roleFamilies: ['finance'], acceptTerms: true, acceptAi: true, wantsDiscovery: true, preferencesConfirmed: false }));
  const me: BaseCtx = { ...w.consultant(), actor: { kind: 'user', userId: r.user.id, userType: 'candidate', candidateId: r.candidate.id } };
  return { id: r.candidate.id, me };
}
const match = async (w: W, candidateId: string) => (await db().select().from(S.matches).where(and(eq(S.matches.roleId, w.ids.roles.R1), eq(S.matches.candidateId, candidateId))))[0];

describe('the mini-me feeds matching: visible from sign-up, more visible the more they add', () => {
  it('a new account is matched to open jobs straight away, with no one checking it first', async () => {
    const w = await load();
    const { id } = await newCandidate(w, 'ada@visible.test');
    const [c] = await db().select().from(S.candidates).where(eq(S.candidates.id, id));
    expect(c.status).toBe('active');
    expect(c.latestProfileVersionId).not.toBeNull();
    const m = await match(w, id);
    expect(m).toBeTruthy();
    expect(m.eligibility).toBe('needs_clarification'); // no job preferences yet: to discuss, never ruled out
    const view = await roleMatches(readCtx(w.client('A')), w.ids.roles.R1);
    expect(m.candidateId).toBe(id); // Matched immediately; an unassessed newcomer is not inserted into a delivered top 10.
    expect(view.all).toHaveLength(0);
    expect(JSON.stringify(view)).not.toContain('Ada');
  });

  it('what they tell their mini-me raises their score; answers naming people or firms are left out', async () => {
    const w = await load();
    const { id, me } = await newCandidate(w, 'ada@grow.test');
    const before = await match(w, id);
    await w.T(me, (c) => saveOwnAnswer(c, 'current_duties', 'I own the weekly bank reconciliation and built a spreadsheet check that cut unmatched items by half.'));
    const after = await match(w, id);
    expect(after.score).toBeGreaterThan(before.score);
    expect(after.coverageBps).toBeGreaterThan(before.coverageBps);
    // An answer with their own name in it never reaches a client.
    await w.T(me, (c) => saveOwnAnswer(c, 'past_roles', 'Ada Stone wrote the monthly report pack in Excel.'));
    const view = JSON.stringify(await liveRoleMatches(readCtx(w.consultant()), w.ids.roles.R1));
    expect(view).toContain('weekly bank reconciliation');
    expect(view).not.toContain('Ada Stone');
  });

  it('full reset clears the mini-me and preferences but keeps the login, and they stay visible', async () => {
    const w = await load();
    const { id, me } = await newCandidate(w, 'ada@reset.test');
    await w.T(me, (c) => saveOwnAnswer(c, 'current_duties', 'I own the weekly bank reconciliation.'));
    await expect(w.T(me, (c) => resetMyProfile(c, 'nope'))).rejects.toThrow(/RESET/);
    await w.T(me, (c) => resetMyProfile(c, 'RESET'));
    expect(await db().select().from(S.onboardingAnswers).where(eq(S.onboardingAnswers.candidateId, id))).toHaveLength(0);
    const [c] = await db().select().from(S.candidates).where(eq(S.candidates.id, id));
    expect(c.preferencesConfirmed).toBe(false);
    expect(c.status).toBe('active');
    const [u] = await db().select().from(S.users).where(eq(S.users.id, c.userId));
    expect(u.status).toBe('active');
    expect(await match(w, id)).toBeTruthy();
  });
});
