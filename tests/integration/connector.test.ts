import { describe, it, expect } from 'vitest';
import { createHash, randomBytes } from 'node:crypto';
import { eq, and } from 'drizzle-orm';
import { load } from './helpers';
import { db } from '../../src/server/db/client';
import * as S from '../../src/server/db/schema';
import { readCtx } from '../../src/server/services/context';
import { startConversation, getConversation, submitAnswer } from '../../src/server/services/conversations';
import { registerClient, checkAuthorizeRequest, approve, tokenRequest, authenticate, disconnect, myConnections, redirectAllowed, authorizationServerMetadata } from '../../src/server/connectors/oauth';
import { handleRpc } from '../../src/server/connectors/mcp';

type W = Awaited<ReturnType<typeof load>>;
const CLAUDE = 'https://claude.ai/api/mcp/auth_callback';
const pkce = () => { const verifier = randomBytes(32).toString('base64url'); return { verifier, challenge: createHash('sha256').update(verifier).digest('base64url') }; };

async function connect(w: W, cand: string, scope = 'questions:read profile:read drafts:write') {
  const client = await registerClient({ client_name: 'Claude', redirect_uris: [CLAUDE] });
  const { verifier, challenge } = pkce();
  const { params } = await checkAuthorizeRequest({ client_id: client.client_id, redirect_uri: CLAUDE, response_type: 'code', code_challenge: challenge, code_challenge_method: 'S256', state: 'xyz', scope });
  const { redirectTo } = await w.T(w.cand(cand), (c) => approve(c, params));
  const u = new URL(redirectTo);
  const tokens = await tokenRequest({ grant_type: 'authorization_code', code: u.searchParams.get('code')!, code_verifier: verifier, client_id: client.client_id, redirect_uri: CLAUDE });
  return { client, u, tokens, verifier };
}
const rpc = async (accessToken: string, method: string, params?: Record<string, unknown>) => {
  const auth = await authenticate(`Bearer ${accessToken}`);
  if (!auth) throw new Error('not authenticated');
  return handleRpc({ jsonrpc: '2.0', id: 1, method, params }, auth) as Promise<{ result?: { content: { text: string }[]; structuredContent?: unknown; isError?: boolean; tools?: { name: string }[] }; error?: unknown }>;
};

describe('AI assistant connector (Claude and ChatGPT)', () => {
  it('advertises standard sign-in and only accepts Claude, ChatGPT or local return addresses', async () => {
    await load();
    const m = authorizationServerMetadata();
    expect(m).toMatchObject({ code_challenge_methods_supported: ['S256'], token_endpoint_auth_methods_supported: ['none'], authorization_response_iss_parameter_supported: true });
    expect(m.registration_endpoint).toMatch(/\/api\/oauth\/register$/);
    expect(redirectAllowed(CLAUDE)).toBe(true);
    expect(redirectAllowed('https://chatgpt.com/connector/oauth/abc123')).toBe(true);
    expect(redirectAllowed('https://evil.example.com/callback')).toBe(false);
    expect(redirectAllowed('https://claude.ai.evil.com/api/mcp/auth_callback')).toBe(false);
    await expect(registerClient({ redirect_uris: ['https://evil.example.com/cb'] })).rejects.toMatchObject({ code: 'invalid_redirect_uri' });
  });

  it('full sign-in: one-use code with PKCE and issuer, then tokens; a wrong verifier or reused code fails', async () => {
    const w = await load();
    const { client, u, tokens, verifier } = await connect(w, 'C01');
    expect(u.origin + u.pathname).toBe(CLAUDE);
    expect(u.searchParams.get('state')).toBe('xyz');
    expect(u.searchParams.get('iss')).toBeTruthy();
    expect(tokens).toMatchObject({ token_type: 'Bearer', scope: 'questions:read profile:read drafts:write' });
    await expect(tokenRequest({ grant_type: 'authorization_code', code: u.searchParams.get('code')!, code_verifier: verifier, client_id: client.client_id, redirect_uri: CLAUDE })).rejects.toMatchObject({ oauthError: 'invalid_grant' });
    const second = await registerClient({ client_name: 'Claude', redirect_uris: [CLAUDE] });
    const { challenge } = pkce();
    const { params } = await checkAuthorizeRequest({ client_id: second.client_id, redirect_uri: CLAUDE, response_type: 'code', code_challenge: challenge, code_challenge_method: 'S256' });
    const r = new URL((await w.T(w.cand('C01'), (c) => approve(c, params))).redirectTo);
    await expect(tokenRequest({ grant_type: 'authorization_code', code: r.searchParams.get('code')!, code_verifier: 'wrong-verifier-wrong-verifier-wrong-verifier', client_id: second.client_id, redirect_uri: CLAUDE })).rejects.toMatchObject({ oauthError: 'invalid_grant' });
    // Refresh rotates: the old refresh token stops working.
    const next = await tokenRequest({ grant_type: 'refresh_token', refresh_token: tokens.refresh_token, client_id: client.client_id });
    expect(next.access_token).not.toBe(tokens.access_token);
    await expect(tokenRequest({ grant_type: 'refresh_token', refresh_token: tokens.refresh_token, client_id: client.client_id })).rejects.toMatchObject({ oauthError: 'invalid_grant' });
    expect(await authenticate(`Bearer ${tokens.access_token}`)).toBeNull();
    expect(await authenticate(`Bearer ${next.access_token}`)).not.toBeNull();
    // Only candidates can approve.
    await expect(w.T(w.client('A'), (c) => approve(c, params))).rejects.toMatchObject({ status: 403 });
  });

  it('their AI lists their unanswered question, saves a draft, and sending it keeps the AI-assisted label', async () => {
    const w = await load();
    const conv = await w.T(w.cand('C01'), (c) => startConversation(c, 'check_in'));
    const { tokens } = await connect(w, 'C01');
    const init = await rpc(tokens.access_token, 'initialize', { protocolVersion: '2025-06-18' });
    expect(init.result).toMatchObject({ protocolVersion: '2025-06-18', serverInfo: { name: 'elsewhere' } });
    const list = await rpc(tokens.access_token, 'tools/list');
    expect(list.result!.tools!.map((t) => t.name)).toEqual(['get_my_unanswered_questions', 'get_my_profile', 'save_draft_answer']);
    const qs = (await rpc(tokens.access_token, 'tools/call', { name: 'get_my_unanswered_questions', arguments: {} })).result!.structuredContent as { questions: { question_id: string }[] };
    expect(qs.questions.length).toBeGreaterThan(0);
    const qid = qs.questions[0].question_id;
    const saved = await rpc(tokens.access_token, 'tools/call', { name: 'save_draft_answer', arguments: { question_id: qid, answer: 'I rebuilt the month-end checklist so the close took two days less.' } });
    expect(saved.result!.isError).toBeUndefined();
    expect(saved.result!.content[0].text).toMatch(/not been sent/);
    const view = await getConversation(readCtx(w.cand('C01')), (conv as { id: string }).id);
    const q = view.questions.find((x) => x.id === qid)!;
    expect(q.draft?.body).toMatch(/month-end checklist/);
    expect(q.answer).toBeNull();
    await w.T(w.cand('C01'), (c) => submitAnswer(c, (conv as { id: string }).id, qid, 'I rebuilt the month-end checklist so the close took two days less (edited).'));
    const answers = await db().select().from(S.checkInAnswers).where(eq(S.checkInAnswers.questionId, qid));
    expect(answers.find((a) => a.status === 'submitted')).toMatchObject({ assistance: 'candidate_declared_ai', inputMode: 'imported_assisted' });
    expect(answers.find((a) => a.status === 'draft')).toBeUndefined();
  });

  it('can never touch another candidate, and permissions and disconnect are enforced', async () => {
    const w = await load();
    const other = await w.T(w.cand('C02'), (c) => startConversation(c, 'check_in'));
    const [theirQ] = await db().select().from(S.checkInQuestions).where(and(eq(S.checkInQuestions.conversationId, (other as { id: string }).id), eq(S.checkInQuestions.state, 'unanswered')));
    const { tokens } = await connect(w, 'C01');
    const qs = (await rpc(tokens.access_token, 'tools/call', { name: 'get_my_unanswered_questions', arguments: {} })).result!.structuredContent as { questions: { question_id: string }[] };
    expect(qs.questions.map((q) => q.question_id)).not.toContain(theirQ.id);
    const attempt = await rpc(tokens.access_token, 'tools/call', { name: 'save_draft_answer', arguments: { question_id: theirQ.id, answer: 'x' } });
    expect(attempt.result).toMatchObject({ isError: true });
    expect(await db().select().from(S.checkInAnswers).where(eq(S.checkInAnswers.questionId, theirQ.id))).toHaveLength(0);
    // A read-only connection cannot save drafts.
    const ro = await connect(w, 'C01', 'questions:read');
    expect((await rpc(ro.tokens.access_token, 'tools/list')).result!.tools!.map((t) => t.name)).toEqual(['get_my_unanswered_questions']);
    expect((await rpc(ro.tokens.access_token, 'tools/call', { name: 'save_draft_answer', arguments: { question_id: theirQ.id, answer: 'x' } })).result).toMatchObject({ isError: true });
    // Disconnect from the Privacy page: access ends immediately.
    const conns = await myConnections(readCtx(w.cand('C01')));
    expect(conns.length).toBe(2);
    for (const c of conns) await w.T(w.cand('C01'), (x) => disconnect(x, c.id));
    expect(await authenticate(`Bearer ${tokens.access_token}`)).toBeNull();
    await expect(w.T(w.cand('C02'), (x) => disconnect(x, conns[0].id))).rejects.toMatchObject({ status: 404 });
  });
});
