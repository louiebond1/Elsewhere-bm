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

  it('their ChatGPT reads the checklist and saves straight into the profile; it can update its own answers but never ones they wrote', async () => {
    const w = await load();
    const tok = await token(w, 'C01');
    const list = await call(tok, 'get_my_onboarding_checklist');
    expect(list.result.structuredContent).toMatchObject({ total: ONBOARDING_QUESTIONS.length, answered: 0 });
    expect(list.result.content[0].text).toMatch(/mock interview/);
    expect(list.result.content[0].text).toMatch(/in batches/);
    expect(ONBOARDING_QUESTIONS.length).toBe(50);
    const saved = await call(tok, 'save_onboarding_answers', { answers: [{ key: 'current_role', answer: 'Finance assistant' }, { key: 'top_skills', answer: 'Reconciliations, Excel, staying calm' }, { key: 'made_up', answer: 'x' }, { key: 'salary', answer: '' }] });
    expect(saved.result.isError).toBeUndefined();
    expect(saved.result.content[0].text).toMatch(/Saved 2 answers straight into their profile/);
    expect(saved.result.content[0].text).toMatch(/made_up \(not a checklist question\)/);
    expect(await onboardingToCheck(readCtx(w.cand('C01')))).toBe(0); // no drafts

    let v = await onboardingView(readCtx(w.cand('C01')));
    expect(v.sections.flatMap((s) => s.questions).find((x) => x.key === 'current_role')).toMatchObject({ answer: 'Finance assistant', source: 'ai', provider: 'ChatGPT', approved: true });

    // They write one themselves; their AI tries again: it updates its own answer, never theirs.
    await w.T(w.cand('C01'), (c) => saveOwnAnswer(c, 'notice', 'Four weeks'));
    const again = await call(tok, 'save_onboarding_answers', { answers: [{ key: 'current_role', answer: 'Senior finance assistant' }, { key: 'notice', answer: 'Two weeks' }, { key: 'hours', answer: 'Full-time' }] });
    expect(again.result.content[0].text).toMatch(/Saved 2 answers.*notice \(they wrote this one themselves\)/);
    v = await onboardingView(readCtx(w.cand('C01')));
    const all = v.sections.flatMap((s) => s.questions);
    expect(all.find((x) => x.key === 'current_role')!.answer).toBe('Senior finance assistant');
    expect(all.find((x) => x.key === 'notice')!.answer).toBe('Four weeks');
    expect(v).toMatchObject({ answered: 4, approved: 4, toCheck: 0 });
    // Removing: an empty answer takes it out of the profile.
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
    expect(rows[0]).toMatchObject({ source: 'ai', aiProvider: 'Claude', status: 'approved' });
  });
});

describe('mini-me: follow-ups and extras, and everyone gets interviewed', () => {
  it('their AI adds follow-ups beyond the 50; they add their own; both show up and can be edited or removed', async () => {
    const w = await load();
    const tok = await token(w, 'C01');
    const r = await call(tok, 'add_to_my_mini_me', { items: [{ topic: 'How many invoices a week?', answer: 'About 300, across four entities.' }, { topic: '', answer: 'x' }] });
    expect(r.result.content[0].text).toMatch(/Added 1 item straight into their profile/);
    const { addExtras } = await import('../../src/server/services/onboarding');
    await w.T(w.cand('C01'), (c) => addExtras(c, [{ topic: 'The audit I helped prepare', answer: 'I pulled the samples and tracked every query to closure.' }], 'self'));
    let v = await onboardingView(readCtx(w.cand('C01')));
    expect(v.extras).toHaveLength(2);
    expect(v.extras.find((e) => e.text === 'How many invoices a week?')).toMatchObject({ approved: true, source: 'ai', provider: 'ChatGPT' });
    expect(v.extras.find((e) => e.text === 'The audit I helped prepare')).toMatchObject({ approved: true, source: 'self' });
    expect(v.toCheck).toBe(0);
    const list = await call(tok, 'get_my_onboarding_checklist');
    expect((list.result.structuredContent as { extras: unknown[] }).extras).toHaveLength(2);
    const aiKey = v.extras.find((e) => e.source === 'ai')!.key;
    await w.T(w.cand('C01'), (c) => saveOwnAnswer(c, aiKey, ''));
    v = await onboardingView(readCtx(w.cand('C01')));
    expect(v.extras).toHaveLength(1);
  });

  it('mini-me answers become interview material straight away; practical details only answer screening questions', async () => {
    const w = await load();
    const { miniMeEvidence } = await import('../../src/server/services/mini-me');
    await w.T(w.cand('C01'), (c) => saveAiAnswers(c, 'ChatGPT', [{ key: 'ex_improvement', answer: 'I rebuilt the month-end reconciliation checklist in Excel.' }, { key: 'salary', answer: '£40k' }]));
    const ev = await miniMeEvidence(readCtx(w.cand('C01')), w.ids.candidates.C01);
    expect(ev).toHaveLength(2);
    expect(ev.find((e) => e.id === 'mm:ex_improvement')).toMatchObject({ strength: 'partial', practical: false });
    expect(ev.find((e) => e.id === 'mm:ex_improvement')!.tags).toEqual(expect.arrayContaining(['reconciliations', 'month_end', 'excel', 'process_design']));
    // Salary only answers the salary screening question, never a skills question.
    expect(ev.find((e) => e.id === 'mm:salary')).toMatchObject({ practical: true, key: 'salary' });
    const { interviewQuestions, demoSimulation } = await import('../../src/server/services/simulation');
    const qs = interviewQuestions({ title: 'Assistant Accountant', outcomes: ['Own month-end'] }, []);
    expect(qs.length).toBeGreaterThanOrEqual(10);
    expect(qs.filter((q) => q.kind === 'screening')).toHaveLength(4);
    const sim = demoSimulation(qs, ev);
    expect(sim.built.find((x) => x.key === 'salary')).toMatchObject({ answer: '£40k', grounded: true, kind: 'screening' });
    expect(sim.built.find((x) => x.key === 'ex_improvement')).toMatchObject({ grounded: true });
    expect(sim.built.filter((x) => x.kind !== 'screening').every((x) => x.answer !== '£40k')).toBe(true);
  });
});

describe('always-on mode', () => {
  it('their AI saves things from any chat to the right place, and gets a few unasked questions to slip in', async () => {
    const w = await load();
    const tok = await token(w, 'C01');
    const next = await call(tok, 'next_mini_me_questions');
    expect(next.result.structuredContent).toMatchObject({ left: 50, total: 50 });
    expect((next.result.structuredContent as { suggestions: unknown[] }).suggestions).toHaveLength(6);
    expect(next.result.content[0].text).toMatch(/natural, conversational/);
    const r = await call(tok, 'remember_for_my_mini_me', { items: [
      { topic: 'Current job', detail: 'Finance assistant at a retailer', question_key: 'current_role' },
      { topic: 'Weekend football coaching', detail: 'Runs a kids’ team every Saturday: kit, rotas and parents.' },
      { topic: 'Bad key', detail: 'Goes to extras instead', question_key: 'not_a_question' },
    ] });
    expect(r.result.structuredContent).toMatchObject({ savedToChecklist: 1, savedAsExtras: 2 });
    const v = await onboardingView(readCtx(w.cand('C01')));
    expect(v.answered).toBe(1);
    expect(v.extras.map((e) => e.text)).toEqual(expect.arrayContaining(['Weekend football coaching', 'Bad key']));
    expect(((await call(tok, 'next_mini_me_questions')).result.structuredContent as { left: number }).left).toBe(49);
    // What they wrote themselves is never overwritten by always-on saves.
    await w.T(w.cand('C01'), (c) => saveOwnAnswer(c, 'current_role', 'Finance assistant (my words)'));
    const again = await call(tok, 'remember_for_my_mini_me', { items: [{ topic: 'Job', detail: 'Something else', question_key: 'current_role' }] });
    expect(again.result.structuredContent).toMatchObject({ savedToChecklist: 0 });
    // The story shows what happened, newest first, with who did it.
    const { miniMeStory } = await import('../../src/server/services/onboarding');
    const story = await miniMeStory(readCtx(w.cand('C01')));
    expect(story.map((x) => x.text)).toEqual(expect.arrayContaining(['You answered something yourself', 'ChatGPT added 1 thing', 'ChatGPT added 2 things beyond the usual questions']));
  });
});
