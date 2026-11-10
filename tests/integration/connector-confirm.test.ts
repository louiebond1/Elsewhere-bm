import { describe, it, expect } from 'vitest';
import { createHash, randomBytes } from 'node:crypto';
import { eq, and } from 'drizzle-orm';
import { load } from './helpers';
import { db } from '../../src/server/db/client';
import * as S from '../../src/server/db/schema';
import { readCtx } from '../../src/server/services/context';
import { onboardingView } from '../../src/server/services/onboarding';
import { registerClient, checkAuthorizeRequest, approve, tokenRequest, authenticate } from '../../src/server/connectors/oauth';
import { handleRpc, TRANSPARENCY_RULE } from '../../src/server/connectors/mcp';

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
const rpc = async (tok: string, method: string, params: Record<string, unknown> = {}) => {
  const auth = await authenticate(`Bearer ${tok}`);
  return (await handleRpc({ jsonrpc: '2.0', id: 1, method, params }, auth!)) as { result: { content: { text: string }[]; instructions?: string; tools?: { name: string; description: string }[] } };
};
const call = (tok: string, name: string, args: Record<string, unknown> = {}) => rpc(tok, 'tools/call', { name, arguments: args });
const nameOf = async (w: W, code: string) => (await db().select().from(S.candidateIdentity).where(eq(S.candidateIdentity.candidateId, w.ids.candidates[code])))[0].fullName;

describe('memory-first, but open about it; every reply says whose account and what is saved', () => {
  it('keeps the memory-first guidance and adds the transparency rule everywhere ChatGPT is guided', async () => {
    const w = await load();
    const tok = await token(w, 'C01');
    const init = await rpc(tok, 'initialize', { protocolVersion: '2025-06-18' });
    const checklist = (await call(tok, 'get_my_onboarding_checklist')).result.content[0].text;
    const questions = (await call(tok, 'get_my_unanswered_questions')).result.content[0].text;
    // Memory-first is kept.
    expect(checklist).toMatch(/answer every question you can from what you genuinely remember about this person/);
    expect(init.result.instructions).toMatch(/FIRST look at what you already know about this person from your memory/);
    // ...and every guidance text carries the transparency rule.
    for (const t of [init.result.instructions!, checklist]) expect(t).toContain(TRANSPARENCY_RULE);
    // The draft guidance comes with unanswered check-in questions (none waiting here gives a short reply instead).
    if (/unanswered check-in question/.test(questions)) expect(questions).toContain(TRANSPARENCY_RULE);
    expect(TRANSPARENCY_RULE).toMatch(/came from your memory of earlier chats/);
    expect(TRANSPARENCY_RULE).toMatch(/remove any item on their Elsewhere Mini-me page/);
    expect(TRANSPARENCY_RULE).toMatch(/Never call something you saved in this conversation "already saved"/);
    expect(TRANSPARENCY_RULE).toMatch(/Saved just now/);
    // The ask-first wording from the reverted change is not served.
    expect([init.result.instructions, checklist, questions].join('\n')).not.toMatch(/shall I save that\?/);
  });

  it('every read starts with "Account: name. Saved so far: N", N matching what the Mini-me page counts', async () => {
    const w = await load();
    const tok = await token(w, 'C01');
    const name = await nameOf(w, 'C01');
    for (const tool of ['get_my_profile', 'get_my_onboarding_checklist', 'next_mini_me_questions', 'get_my_cv', 'get_my_unanswered_questions', 'review_my_recent_interviews'])
      expect((await call(tok, tool)).result.content[0].text).toMatch(new RegExp(`^Account: ${name}\\. Saved so far: 0\\.\\n`));
    await call(tok, 'remember_for_my_mini_me', { items: [{ topic: 'Current role', detail: 'Assistant accountant at a logistics firm.', question_key: 'current_role' }, { topic: 'Proudest result', detail: 'Cut unmatched items by half.' }] });
    const page = await onboardingView(readCtx(w.cand('C01')));
    expect(page.feed.length).toBe(2);
    expect((await call(tok, 'get_my_profile')).result.content[0].text).toMatch(new RegExp(`^Account: ${name}\\. Saved so far: ${page.feed.length}\\.`));
  });

  it('every save says "Saved just now: ..." with what it saved, then the account line', async () => {
    const w = await load();
    const tok = await token(w, 'C01');
    const name = await nameOf(w, 'C01');
    const a = (await call(tok, 'save_onboarding_answers', { answers: [{ key: 'current_role', answer: 'Assistant accountant.' }] })).result.content[0].text;
    expect(a).toMatch(new RegExp(`^Saved just now: [^\\n]+ = "Assistant accountant\\."\\.\\nAccount: ${name}\\. Saved so far: 1\\.`));
    const b = (await call(tok, 'remember_for_my_mini_me', { items: [{ topic: 'Tools', detail: 'Excel and Xero every day.' }] })).result.content[0].text;
    expect(b).toMatch(/^Saved just now: Tools = "Excel and Xero every day\."\./);
    expect(b).toMatch(/Saved so far: 2\./);
    const c = (await call(tok, 'add_to_my_mini_me', { items: [{ topic: 'Volunteering', answer: 'Treasurer for a running club.' }] })).result.content[0].text;
    expect(c).toMatch(/^Saved just now: Volunteering = "Treasurer for a running club\."\./);
    // Errors are left as they are (nothing was saved).
    const e = (await call(tok, 'save_onboarding_answers', { answers: [] })).result.content[0].text;
    expect(e).toBe('No answers were given.');
    // The rows really are on this candidate.
    const rows = await db().select().from(S.onboardingAnswers).where(and(eq(S.onboardingAnswers.candidateId, w.ids.candidates.C01)));
    expect(rows).toHaveLength(3);
  });
});
