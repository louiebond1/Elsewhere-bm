import { test, expect } from '@playwright/test';
import { createHash, randomBytes } from 'node:crypto';
import { loadScenario, switchTo } from './helpers';

const CALLBACK = 'https://claude.ai/api/mcp/auth_callback';

test('AI helper: connect ChatGPT/Claude, press Allow, the AI saves a draft, the candidate checks and sends it', async ({ page }) => {
  await loadScenario(page, null);
  await switchTo(page, 'Maya Ellis');
  // A question to answer.
  await page.goto('/candidate/check-ins');
  await page.getByRole('button', { name: /Start check-in|Start your first conversation/ }).click();
  await page.waitForURL(/\/candidate\/conversation\//);

  // The AI app registers itself and opens the Elsewhere sign-in window.
  const reg = await page.request.post('/api/oauth/register', { data: { client_name: 'Claude', redirect_uris: [CALLBACK] } });
  expect(reg.status()).toBe(201);
  const { client_id } = await reg.json();
  const verifier = randomBytes(32).toString('base64url');
  const challenge = createHash('sha256').update(verifier).digest('base64url');
  const q = new URLSearchParams({ client_id, redirect_uri: CALLBACK, response_type: 'code', code_challenge: challenge, code_challenge_method: 'S256', state: 's1', scope: 'questions:read profile:read drafts:write' });
  let redirected = '';
  await page.route('https://claude.ai/**', (r) => { redirected = r.request().url(); return r.fulfill({ status: 200, body: 'ok' }); });
  await page.goto(`/oauth/authorize?${q}`);
  await expect(page.getByRole('heading', { name: 'Let Claude help with your answers?' })).toBeVisible();
  await expect(page.getByText('It can’t send anything for you')).toBeVisible();
  await page.getByRole('button', { name: 'Allow Claude' }).click();
  await expect.poll(() => redirected).toContain(CALLBACK);
  const code = new URL(redirected).searchParams.get('code')!;

  // The AI swaps the code for a key and uses it.
  const tok = await page.request.post('/api/oauth/token', { form: { grant_type: 'authorization_code', code, code_verifier: verifier, client_id, redirect_uri: CALLBACK } });
  expect(tok.status()).toBe(200);
  const { access_token } = await tok.json();
  const mcp = (body: unknown) => page.request.post('/mcp', { data: body, headers: { authorization: `Bearer ${access_token}`, accept: 'application/json, text/event-stream' } });
  const list = await (await mcp({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'get_my_unanswered_questions', arguments: {} } })).json();
  const qid = list.result.structuredContent.questions[0].question_id;
  const saved = await (await mcp({ jsonrpc: '2.0', id: 2, method: 'tools/call', params: { name: 'save_draft_answer', arguments: { question_id: qid, answer: 'I rebuilt the supplier reconciliation so it took one day, not three.' } } })).json();
  expect(saved.result.isError).toBeUndefined();

  // Back in Elsewhere: the draft is waiting, and nothing was sent.
  await page.unroute('https://claude.ai/**');
  await page.goto('/candidate/ai');
  await expect(page.locator('span.font-medium', { hasText: /^Claude$/ })).toBeVisible();
  await expect(page.getByText('1 answer ready to check')).toBeVisible();
  await page.getByRole('link', { name: 'Check and send' }).click();
  await expect(page.getByText(/Drafted with your AI assistant/)).toBeVisible();
  await expect(page.getByLabel('Your answer')).toHaveValue(/supplier reconciliation/);
  await page.getByRole('button', { name: 'Send' }).click();
  await expect(page.locator('ol li', { hasText: 'supplier reconciliation' })).toBeVisible();
  await page.goto('/candidate/ai');
  await expect(page.getByText('ready to check')).toHaveCount(0);

  // Disconnect: the key stops working at once.
  await page.getByRole('button', { name: 'Disconnect' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Disconnect' }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  expect((await mcp({ jsonrpc: '2.0', id: 3, method: 'tools/list' })).status()).toBe(401);
});

test('AI helper page fits a phone and shows both apps @phone', async ({ page }) => {
  await loadScenario(page, null);
  await switchTo(page, 'Maya Ellis');
  await page.goto('/candidate/ai');
  await expect(page.getByRole('link', { name: 'ChatGPT' })).toBeVisible();
  await page.getByRole('link', { name: 'Claude' }).click();
  await expect(page.getByText('Choose Add custom connector')).toBeVisible();
  await expect(page.getByLabel('Connector address')).toContainText('/mcp');
  const w = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(w).toBeLessThanOrEqual(0);
});
