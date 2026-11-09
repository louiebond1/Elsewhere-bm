import { describe, it, expect } from 'vitest';
import { createHash, randomBytes } from 'node:crypto';
import { eq, and } from 'drizzle-orm';
import { load } from './helpers';
import { db } from '../../src/server/db/client';
import * as S from '../../src/server/db/schema';
import { readCtx } from '../../src/server/services/context';
import { signupCandidate } from '../../src/server/services/candidates';
import { onboardingView, saveOwnAnswer, approveAnswers, saveAiAnswers, onboardingToCheck } from '../../src/server/services/onboarding';
import { registerClient, checkAuthorizeRequest, approve, tokenRequest, authenticate } from '../../src/server/connectors/oauth';
import { handleRpc } from '../../src/server/connectors/mcp';
import { ONBOARDING_QUESTIONS } from '../../src/config/onboarding';

type W = Awaited<ReturnType<typeof load>>;
const CB = 'https://chatgpt.com/connector_platform_oauth_redirect';
async function token(w: W, cand: string) {
  const client = await registerClient({ client_name: 'ChatGPT', redirect_uris: [CB] });
  const v = randomBytes(32).toString('base64url');
  const { params } = await checkAuthorizeRequest({ client_id: client.client_id, redirect_uri: CB, response_type: 'code', code_challenge: createHash('sha256').update(v).digest('base64url'), code_challenge_method: 'S256', scope: 'questions:read profile:read drafts:write' });
  const { redirectTo } = await w.T(w.cand(cand), (c) => approve(c, params));
  const t = await tokenRequest({ grant_type: 'authorization_code', code: new URL(redirectTo).searchParams.get('code')!, code_verifier: v, client_id: client.client_id, redirect_uri: CB });
  return t.access_token as string;
}
const call = async (tok: string, name: string, args: Record<string, unknown> = {}) => {
  const auth = await authenticate(`Bearer ${tok}`);
  return (await handleRpc({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name, arguments: args } }, auth!)) as { result: { content: { text: string }[]; structuredContent?: Record<string, unknown>; isError?: boolean } };
};

describe('candidate onboarding: welcome email and the 50-question checklist', () => {
  it('a new candidate gets a recorded welcome email', async () => {
    const w = await load();
    const r = await w.T(w.consultant(), (c) => signupCandidate(c, { fullName: 'Ada Stone', email: 'ada@new.test', password: 'long-enough-pw', region: 'london', workModes: ['hybrid'], roleFamilies: ['finance'], fictionalConfirmed: true, acceptTerms: true, acceptAi: true }));
    const mail = await db().select().from(S.emailOutbox).where(eq(S.emailOutbox.recipientUserId, r.user.id));
    expect(mail).toHaveLength(1);
    expect(mail[0]).toMatchObject({ notificationType: 'welcome', subject: 'Welcome to BondMoran Elsewhere', linkPath: '/candidate/welcome' });
  });

  it('their ChatGPT reads the checklist and saves many drafts; they check, edit and approve; approved answers are never overwritten', async () => {
    const w = await load();
    const tok = await token(w, 'C01');
    const list = await call(tok, 'get_my_onboarding_checklist');
    expect(list.result.structuredContent).toMatchObject({ total: ONBOARDING_QUESTIONS.length, answered: 0 });
    expect(ONBOARDING_QUESTIONS.length).toBe(50);
    const saved = await call(tok, 'save_onboarding_answers', { answers: [{ key: 'current_role', answer: 'Finance assistant' }, { key: 'top_skills', answer: 'Reconciliations, Excel, staying calm' }, { key: 'made_up', answer: 'x' }, { key: 'salary', answer: '' }] });
    expect(saved.result.isError).toBeUndefined();
    expect(saved.result.content[0].text).toMatch(/Saved 2 draft answers.*Nothing has been sent/);
    expect(saved.result.content[0].text).toMatch(/made_up \(not a checklist question\)/);
    expect(await onboardingToCheck(readCtx(w.cand('C01')))).toBe(2);

    let v = await onboardingView(readCtx(w.cand('C01')));
    const q = v.sections.flatMap((s) => s.questions).find((x) => x.key === 'current_role')!;
    expect(q).toMatchObject({ answer: 'Finance assistant', source: 'ai', provider: 'ChatGPT', approved: false });

    // They approve one, and write another themselves.
    await w.T(w.cand('C01'), (c) => approveAnswers(c, ['current_role']));
    await w.T(w.cand('C01'), (c) => saveOwnAnswer(c, 'notice', 'Four weeks'));
    // Their AI tries again: approved and self-written answers are skipped.
    const again = await call(tok, 'save_onboarding_answers', { answers: [{ key: 'current_role', answer: 'Something else' }, { key: 'notice', answer: 'Two weeks' }, { key: 'hours', answer: 'Full-time' }] });
    expect(again.result.content[0].text).toMatch(/Saved 1 draft answer\..*current_role \(already approved by them\), notice \(already approved by them\)/);
    v = await onboardingView(readCtx(w.cand('C01')));
    expect(v.sections.flatMap((s) => s.questions).find((x) => x.key === 'current_role')!.answer).toBe('Finance assistant');
    expect(v).toMatchObject({ answered: 4, approved: 2, toCheck: 2 });
    await w.T(w.cand('C01'), (c) => approveAnswers(c, 'all'));
    expect((await onboardingView(readCtx(w.cand('C01'))))).toMatchObject({ approved: 4, toCheck: 0 });
    // An empty answer removes it.
    await w.T(w.cand('C01'), (c) => saveOwnAnswer(c, 'hours', ''));
    expect((await onboardingView(readCtx(w.cand('C01')))).answered).toBe(3);
  });

  it('answers stay private to the candidate and are refused when too long or not on the list', async () => {
    const w = await load();
    await w.T(w.cand('C01'), (c) => saveAiAnswers(c, 'Claude', [{ key: 'current_role', answer: 'Mine' }]));
    expect((await onboardingView(readCtx(w.cand('C02')))).answered).toBe(0);
    await expect(w.T(w.cand('C01'), (c) => saveOwnAnswer(c, 'not_real', 'x'))).rejects.toMatchObject({ status: 400 });
    await expect(w.T(w.cand('C01'), (c) => saveOwnAnswer(c, 'extra', 'x'.repeat(1501)))).rejects.toMatchObject({ status: 400 });
    await expect(w.T(w.client('A'), (c) => saveOwnAnswer(c, 'extra', 'x'))).rejects.toMatchObject({ status: 403 });
    const rows = await db().select().from(S.onboardingAnswers).where(and(eq(S.onboardingAnswers.candidateId, w.ids.candidates.C01), eq(S.onboardingAnswers.questionKey, 'current_role')));
    expect(rows[0]).toMatchObject({ source: 'ai', aiProvider: 'Claude', status: 'draft' });
  });
});

describe('mini-me: follow-ups and extras, and everyone gets interviewed', () => {
  it('their AI adds follow-ups beyond the 50; they add their own; both show up and can be edited or removed', async () => {
    const w = await load();
    const tok = await token(w, 'C01');
    const r = await call(tok, 'add_to_my_mini_me', { items: [{ topic: 'How many invoices a week?', answer: 'About 300, across four entities.' }, { topic: '', answer: 'x' }] });
    expect(r.result.content[0].text).toMatch(/Added 1 item to their mini-me as drafts/);
    const { addExtras } = await import('../../src/server/services/onboarding');
    await w.T(w.cand('C01'), (c) => addExtras(c, [{ topic: 'The audit I helped prepare', answer: 'I pulled the samples and tracked every query to closure.' }], 'self'));
    let v = await onboardingView(readCtx(w.cand('C01')));
    expect(v.extras).toHaveLength(2);
    expect(v.extras.find((e) => e.text === 'How many invoices a week?')).toMatchObject({ approved: false, provider: 'ChatGPT' });
    expect(v.extras.find((e) => e.text === 'The audit I helped prepare')).toMatchObject({ approved: true, source: 'self' });
    expect(v.toCheck).toBe(1);
    const list = await call(tok, 'get_my_onboarding_checklist');
    expect((list.result.structuredContent as { extras: unknown[] }).extras).toHaveLength(2);
    const aiKey = v.extras.find((e) => !e.approved)!.key;
    await w.T(w.cand('C01'), (c) => approveAnswers(c, [aiKey]));
    await w.T(w.cand('C01'), (c) => saveOwnAnswer(c, aiKey, ''));
    v = await onboardingView(readCtx(w.cand('C01')));
    expect(v.extras).toHaveLength(1);
  });

  it('approved mini-me answers become interview material; practical details and anything identifying are left out', async () => {
    const w = await load();
    const { miniMeEvidence } = await import('../../src/server/services/mini-me');
    await w.T(w.cand('C01'), (c) => saveAiAnswers(c, 'ChatGPT', [{ key: 'ex_improvement', answer: 'I rebuilt the month-end reconciliation checklist in Excel.' }, { key: 'salary', answer: '£40k' }]));
    expect(await miniMeEvidence(readCtx(w.cand('C01')), w.ids.candidates.C01)).toHaveLength(0); // not approved yet
    await w.T(w.cand('C01'), (c) => approveAnswers(c, 'all'));
    const ev = await miniMeEvidence(readCtx(w.cand('C01')), w.ids.candidates.C01);
    expect(ev).toHaveLength(1);
    expect(ev[0]).toMatchObject({ id: 'mm:ex_improvement', strength: 'partial' });
    expect(ev[0].tags).toEqual(expect.arrayContaining(['reconciliations', 'month_end', 'excel', 'process_design']));
  });
});
