import { describe, it, expect } from 'vitest';
import { createHash, randomBytes } from 'node:crypto';
import { eq, and } from 'drizzle-orm';
import { load } from './helpers';
import { db } from '../../src/server/db/client';
import * as S from '../../src/server/db/schema';
import { readCtx } from '../../src/server/services/context';
import { onboardingView } from '../../src/server/services/onboarding';
import { registerClient, checkAuthorizeRequest, approve, tokenRequest, authenticate } from '../../src/server/connectors/oauth';
import { handleRpc, CONFIRM_RULE } from '../../src/server/connectors/mcp';

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

describe('the connector never saves from memory on its own, and says whose account and what is saved', () => {
  it('instructions and tool descriptions ask before saving anything remembered; the old "fill it in from memory" wording is gone', async () => {
    const w = await load();
    const tok = await token(w, 'C01');
    const init = await rpc(tok, 'initialize', { protocolVersion: '2025-06-18' });
    const tools = (await rpc(tok, 'tools/list')).result.tools!;
    const checklist = (await call(tok, 'get_my_onboarding_checklist')).result.content[0].text;
    const profile = (await call(tok, 'get_my_profile')).result.content[0].text;
    const everything = [init.result.instructions!, ...tools.map((t) => t.description), checklist, profile].join('\n');
    expect(init.result.instructions).toContain(CONFIRM_RULE);
    expect(checklist).toContain(CONFIRM_RULE);
    expect(CONFIRM_RULE).toMatch(/shall I save that\?/);
    for (const banned of [/answer every question you can from what you/i, /FIRST look at what you already know/i, /prefer a new or better example you know from your own memory/i, /Skip anything you already know about them from memory/i, /what you remember about them is more useful/i, /fill in the whole checklist in one go/i])
      expect(everything).not.toMatch(banned);
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
