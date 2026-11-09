import { test, expect } from '@playwright/test';
import { createHash, randomBytes } from 'node:crypto';
import { loadScenario, switchTo } from './helpers';

const CALLBACK = 'https://claude.ai/api/mcp/auth_callback';

test('Let my AI do this: connect from inside the question, the draft appears, Use draft, then Send answer', async ({ page }) => {
  await loadScenario(page, null);
  await switchTo(page, 'Maya Ellis');
  await page.goto('/candidate/check-ins');
  await page.getByRole('button', { name: /Start check-in|Start your first conversation/ }).click();
  await page.waitForURL(/\/candidate\/conversation\//);
  const questionUrl = page.url();

  // Not connected yet: the same button opens the connect sheet; typed text stays.
  await page.getByLabel('Your answer').fill('My own start.');
  await page.getByRole('button', { name: 'Let my AI do this' }).click();
  const sheet = page.getByRole('dialog', { name: 'Let your AI help' });
  await sheet.getByRole('button', { name: 'Connect Claude' }).click();
  await expect(sheet.getByLabel('Connector address')).toContainText('/mcp');
  await sheet.getByRole('button', { name: 'I’ve connected, check again' }).click();
  await expect(sheet.getByText(/Not connected yet/)).toBeVisible();

  // Meanwhile, in Claude: it registers and the person presses Allow (in another tab).
  const reg = await page.request.post('/api/oauth/register', { data: { client_name: 'Claude', redirect_uris: [CALLBACK] } });
  expect(reg.status()).toBe(201);
  const { client_id } = await reg.json();
  const verifier = randomBytes(32).toString('base64url');
  const challenge = createHash('sha256').update(verifier).digest('base64url');
  const q = new URLSearchParams({ client_id, redirect_uri: CALLBACK, response_type: 'code', code_challenge: challenge, code_challenge_method: 'S256', state: 's1', scope: 'questions:read profile:read drafts:write' });
  const tab = await page.context().newPage();
  let redirected = '';
  await tab.route('https://claude.ai/**', (r) => { redirected = r.request().url(); return r.fulfill({ status: 200, body: 'ok' }); });
  await tab.goto(`/oauth/authorize?${q}`);
  await expect(tab.getByRole('heading', { name: 'Let Claude help with your answers?' })).toBeVisible();
  await tab.getByRole('button', { name: 'Allow Claude' }).click();
  await expect.poll(() => redirected).toContain(CALLBACK);
  await tab.close();
  const tok = await page.request.post('/api/oauth/token', { form: { grant_type: 'authorization_code', code: new URL(redirected).searchParams.get('code')!, code_verifier: verifier, client_id, redirect_uri: CALLBACK } });
  const { access_token } = await tok.json();
  const mcp = (body: unknown) => page.request.post('/mcp', { data: body, headers: { authorization: `Bearer ${access_token}`, accept: 'application/json, text/event-stream' } });

  // Back in Elsewhere: check again, connected, prepare my draft.
  await sheet.getByRole('button', { name: 'I’ve connected, check again' }).click();
  await expect(sheet.getByText('Connected to Claude')).toBeVisible();
  await sheet.getByRole('button', { name: 'Prepare my draft' }).click();
  await expect(page.getByText('Continue in Claude to prepare your draft')).toBeVisible();
  await expect(page.getByLabel('Your answer')).toHaveValue('My own start.');

  // Claude saves a draft; it appears in the task without reloading.
  const list = await (await mcp({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'get_my_unanswered_questions', arguments: {} } })).json();
  const qid = list.result.structuredContent.questions[0].question_id;
  await mcp({ jsonrpc: '2.0', id: 2, method: 'tools/call', params: { name: 'save_draft_answer', arguments: { question_id: qid, answer: 'I rebuilt the supplier reconciliation so it took one day, not three.' } } });
  const panel = page.getByRole('region', { name: 'Draft ready to check' });
  await expect(panel).toBeVisible({ timeout: 15_000 });
  await expect(panel.getByText('Made with your Claude · Not sent')).toBeVisible();
  // Something is already typed, so it asks: replace or add. Nothing is overwritten silently.
  await panel.getByRole('button', { name: 'Add to answer' }).click();
  await expect(page.getByLabel('Your answer')).toHaveValue(/My own start\.\n\nI rebuilt the supplier reconciliation/);
  await expect(page.getByText('Started with your Claude · Not sent')).toBeVisible();
  await page.getByLabel('Your answer').press('End');
  await page.getByLabel('Your answer').pressSequentially(' Done.');
  await expect(page.getByText('Started with your Claude · Edited by you · Not sent')).toBeVisible();
  await page.getByRole('button', { name: 'Send answer' }).click();
  await expect(page.locator('ol li', { hasText: 'supplier reconciliation' })).toBeVisible();

  // A second draft shows in the header inbox and opens straight to its question.
  const list2 = await (await mcp({ jsonrpc: '2.0', id: 3, method: 'tools/call', params: { name: 'get_my_unanswered_questions', arguments: {} } })).json();
  const qid2 = list2.result.structuredContent.questions[0].question_id;
  await mcp({ jsonrpc: '2.0', id: 4, method: 'tools/call', params: { name: 'save_draft_answer', arguments: { question_id: qid2, answer: 'Second draft.' } } });
  await page.goto('/candidate/home');
  await page.getByRole('link', { name: '1 draft ready' }).click();
  await page.getByRole('link', { name: 'Check and send' }).click();
  await expect(page.getByRole('region', { name: 'Draft ready to check' })).toContainText('Second draft.');
  await page.getByRole('button', { name: 'Discard' }).click();
  await expect(page.getByRole('button', { name: 'Let my AI do this' })).toBeVisible();
  expect(page.url()).toContain(questionUrl.split('?')[0]);

  // Disconnect: the key stops working at once.
  await page.goto('/candidate/ai');
  await page.getByRole('button', { name: 'Disconnect' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Disconnect' }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  expect((await mcp({ jsonrpc: '2.0', id: 5, method: 'tools/list' })).status()).toBe(401);
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
