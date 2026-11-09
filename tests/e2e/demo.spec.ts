import { test, expect } from '@playwright/test';
import { enterGate, loadScenario, switchTo } from './helpers';

test('gate blocks everything until the access password is entered', async ({ page }) => {
  await page.context().clearCookies();
  await page.goto('/client/home');
  await expect(page).toHaveURL(/\/demo$/);
  const api = await page.request.get('/api/notifications');
  expect(api.status()).toBe(401);
});

test('S01 anonymous match: no name or employer anywhere before acceptance, including network payloads', async ({ page }) => {
  await loadScenario(page, null);
  await switchTo(page, 'Emma Stone');
  const bodies: string[] = [];
  page.on('response', async (r) => { try { if (r.url().startsWith(new URL(page.url()).origin)) bodies.push(await r.text()); } catch {} });
  await page.getByRole('link', { name: /Assistant Accountant/ }).first().click();
  const rail = page.locator('aside').filter({ hasText: 'Your hire price' });
  await expect(rail).toBeVisible();
  await expect(rail.getByText(/£8,800/)).toBeVisible();
  await page.getByRole('link', { name: 'View evidence' }).first().click();
  await expect(page.getByText(/18 to 4/).first()).toBeVisible();
  const html = await page.content();
  for (const s of ['Maya', 'Ellis', 'Mallow', 'candidate.c01']) expect(html).not.toContain(s);
  for (const b of bodies) for (const s of ['Maya Ellis', 'Mallow Retail', 'candidate.c01']) expect(b).not.toContain(s);
});

test('S02 deposit on acceptance, balance on hire, reload safe', async ({ page }) => {
  await loadScenario(page, 'S02');
  await switchTo(page, 'Maya Ellis');
  await page.goto('/candidate/introductions');
  await page.getByRole('button', { name: 'Accept introduction' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Accept introduction' }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await page.goto('/candidate/introductions?tab=accepted');
  await expect(page.getByRole('link', { name: 'Interview prep' })).toBeVisible();
  await switchTo(page, 'Emma Stone');
  await page.goto('/client/roles');
  await page.getByRole('link', { name: 'Assistant Accountant' }).click();
  await page.waitForURL(/\/client\/roles\/[0-9a-f-]{36}/);
  await page.goto(page.url().split('?')[0] + '?tab=pipeline');
  await expect(page.getByText('Maya Ellis').first()).toBeVisible();
  await page.getByRole('button', { name: 'Record hire' }).first().click();
  await expect(page.getByText(/charges 0.75 credits \(£2,850\) now/)).toBeVisible();
  await page.getByRole('button', { name: 'Confirm hire' }).click();
  await expect(page.getByText('Hire recorded.')).toBeVisible();
  await page.goto('/client/credits');
  await expect(page.getByText('8.5 credits').first()).toBeVisible();
  await page.reload();
  await expect(page.getByText('8.5 credits').first()).toBeVisible();
});

test('S12 employer hiding: C05 is invisible to Alder and a guessed URL is a 404', async ({ page }) => {
  await loadScenario(page, null);
  await switchTo(page, 'Emma Stone');
  await page.goto('/client/roles');
  await page.getByRole('link', { name: 'Assistant Accountant' }).click();
  await page.waitForURL(/\/client\/roles\/[0-9a-f-]{36}/);
  const roleUrl = page.url().split('?')[0];
  expect(await page.content()).not.toContain('Hannah');
  const r = await page.goto(roleUrl + '/candidates/R0000000000000000000a');
  expect(r?.status()).toBe(404);
  await switchTo(page, 'Hannah Cole');
  await page.goto('/candidate/privacy');
  await expect(page.locator('li').filter({ hasText: 'Alder Works' }).first()).toBeVisible();
});

test('mutations without CSRF or from another origin fail', async ({ page }) => {
  await loadScenario(page, null);
  await switchTo(page, 'Emma Stone');
  const noCsrf = await page.request.post('/api/notifications/read-all', { data: {}, headers: { origin: new URL(page.url()).origin } });
  expect(noCsrf.status()).toBe(403);
  const s = await (await page.request.get('/api/auth/session')).json();
  const foreign = await page.request.post('/api/notifications/read-all', { data: {}, headers: { origin: 'https://evil.example', 'x-csrf-token': s.data.csrfToken } });
  expect(foreign.status()).toBe(403);
  const ok = await page.request.post('/api/notifications/read-all', { data: {}, headers: { origin: new URL(page.url()).origin, 'x-csrf-token': s.data.csrfToken } });
  expect(ok.status()).toBe(200);
});

test('dialog keyboard support: Escape closes and focus returns @phone', async ({ page }) => {
  await loadScenario(page, null);
  await switchTo(page, 'Emma Stone');
  await page.goto('/client/roles');
  await page.getByRole('link', { name: 'Assistant Accountant' }).click();
  const close = page.getByRole('button', { name: 'Close role' });
  await close.focus();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(close).toBeFocused();
});

test('primary routes have no horizontal page scroll at phone width @phone', async ({ page }) => {
  await enterGate(page);
  await switchTo(page, 'Emma Stone');
  for (const u of ['/client/home', '/client/roles', '/client/credits', '/client/credits/buy', '/client/roles/new', '/client/hires', '/client/onboarding']) {
    await page.goto(u);
    const over = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(over, u).toBeLessThanOrEqual(1);
  }
});

test('B2 + S24: typing in the hire dialog keeps every character, and a changed salary is refused with the review message', async ({ page }) => {
  await loadScenario(page, 'S24');
  await switchTo(page, 'Emma Stone');
  await page.goto('/client/roles');
  await page.getByRole('link', { name: 'Assistant Accountant' }).click();
  await page.waitForURL(/\/client\/roles\/[0-9a-f-]{36}/);
  await page.goto(page.url().split('?')[0] + '?tab=pipeline');
  await page.getByRole('button', { name: 'Record hire' }).first().click();
  await expect(page.getByText('This records the hire')).toBeVisible();
  const salary = page.getByLabel(/Agreed annual salary/);
  await salary.click();
  await page.keyboard.press('ControlOrMeta+A');
  await page.keyboard.type('45000', { delay: 80 });
  await expect(salary).toHaveValue('45000');
  await expect(salary).toBeFocused();
  await page.getByRole('button', { name: 'Confirm hire' }).click();
  await expect(page.getByText('This offer salary differs from the agreed quote. Ask BondMoran to review the pricing before recording the hire.')).toBeVisible();
  await page.keyboard.press('Escape');
  await page.goto('/client/credits');
  await expect(page.getByText('9.25 credits').first()).toBeVisible();
});

test('B1: an already-recorded outside hire shows no review button and no charge (S10)', async ({ page }) => {
  await loadScenario(page, 'S10');
  await switchTo(page, 'Jamie Patel');
  await page.goto('/consultant/hires/outside');
  await page.getByLabel('Client').selectOption({ label: 'Cedar Labs' });
  await page.getByRole('button', { name: 'Show accepted introductions' }).click();
  await expect(page.getByText(/Hire recorded with start date/)).toBeVisible();
  await expect(page.getByRole('button', { name: 'Review outside hire' })).toHaveCount(0);
});

test('B4: in the empty workspace the default contract start allows a role to be opened, and a future start is warned', async ({ page }) => {
  await loadScenario(page, 'EMPTY');
  await switchTo(page, 'Alex Morgan');
  await page.goto('/consultant/clients');
  await page.getByLabel('Organisation name (fictional)').first().fill('B4 Test Co');
  await page.getByLabel('Contact name').fill('Robin Test');
  await page.getByLabel(/Contact email/).fill('robin@b4.example.test');
  await page.getByRole('button', { name: 'Create client' }).click();
  await page.waitForURL(/consultant\/clients\/[0-9a-f-]{36}/);
  const clientUrl = page.url().split('?')[0];
  await page.goto(clientUrl + '/contract');
  const start = page.getByLabel('Start');
  await expect(start).toHaveValue('2026-11-06');
  await start.fill('2026-12-01');
  await expect(page.getByText(/after today.s business date/)).toBeVisible();
  await start.fill('2026-11-06');
  await expect(page.getByText(/after today.s business date/)).toHaveCount(0);
  await page.getByRole('button', { name: 'Save draft contract' }).click();
  await expect(page.getByText('Draft saved.')).toBeVisible();
  await page.getByRole('button', { name: 'Activate contract' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Activate' }).click();
  await expect(page.getByRole('button', { name: 'Activate contract' })).toHaveCount(0);
  await page.goto(clientUrl + '?tab=roles');
  await page.getByRole('link', { name: 'Add role for this client' }).click();
  await page.getByLabel('Vacancy reference').fill('B4-001');
  await page.getByLabel('Role title').fill('Analyst');
  await page.getByLabel(/Annual salary/).fill('44000');
  await page.getByLabel(/^Outcomes/).fill('Produce reliable reporting');
  const labels = page.getByLabel('Label');
  for (const [i, l] of ['Reconciliations', 'Reporting', 'Learning'].entries()) await labels.nth(i).fill(l);
  const skills = page.getByRole('group', { name: /Skills this covers/ });
  for (const [i, t] of ['Reconciliations', 'Reporting', 'Learning quickly'].entries()) await skills.nth(i).getByText(t, { exact: true }).click();
  await page.getByRole('button', { name: 'Save draft' }).click();
  await page.waitForURL(/consultant\/roles\/[0-9a-f-]{36}/);
  await page.getByRole('button', { name: 'Make role live' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Make it live' }).click();
  await expect(page.getByText('Open', { exact: true }).first()).toBeVisible();
});

test('Demo checkout: decline keeps input and balance; success adds credits once and survives reload', async ({ page }) => {
  await loadScenario(page, null);
  await switchTo(page, 'Emma Stone');
  await page.goto('/client/credits');
  const spendable = page.locator('div').filter({ hasText: /^Spendable/ }).first();
  const before = await spendable.textContent();
  await page.getByRole('link', { name: 'Buy credits (demo)' }).click();
  await expect(page.getByText(/Demo only: no money charged/)).toBeVisible();
  expect(await page.locator('input[autocomplete^="cc-"], input[name*="card" i]').count()).toBe(0);
  await page.getByLabel('Credits to buy').fill('2');
  await page.getByRole('button', { name: 'Continue to demo checkout' }).click();
  await page.waitForURL(/\/client\/credits\/checkout\/[0-9a-f-]{36}/);
  await expect(page.getByText(/Demo only: no money charged/)).toBeVisible();
  await page.getByRole('button', { name: 'Simulate decline' }).click();
  await expect(page.getByText(/Simulated decline\. Nothing was added or charged/)).toBeVisible();
  await expect(page.getByRole('button', { name: 'Simulate success' })).toHaveCount(0);
  await page.getByRole('link', { name: 'Try again' }).click();
  await expect(page.getByLabel('Credits to buy')).toHaveValue('2');
  await page.goto('/client/credits');
  expect(await spendable.textContent()).toBe(before);
  await expect(page.getByRole('link', { name: 'Simulated purchase' })).toHaveCount(0);
  await page.goto('/client/credits/buy?credits=2');
  await page.getByRole('button', { name: 'Continue to demo checkout' }).click();
  await page.waitForURL(/\/client\/credits\/checkout\/[0-9a-f-]{36}/);
  await page.getByRole('button', { name: 'Simulate success' }).click();
  await expect(page.getByText(/Simulated success\. 2 credits were added to your balance once/)).toBeVisible();
  await page.reload();
  await expect(page.getByText(/Simulated success\. 2 credits were added/)).toBeVisible();
  await expect(page.getByRole('button', { name: 'Simulate success' })).toHaveCount(0);
  await page.goto('/client/credits');
  await expect(page.getByRole('link', { name: 'Simulated purchase' })).toHaveCount(1);
});

test('Guided walkthrough: gated, read-only, reachable from demo accounts, labels the unrun hire flow @phone', async ({ page }) => {
  await page.context().clearCookies();
  await page.goto('/demo/guide');
  await expect(page).toHaveURL(/\/demo$/);
  await enterGate(page);
  await page.goto('/demo/personas');
  await page.getByRole('link', { name: 'Read the guided walkthrough' }).click();
  await expect(page).toHaveURL(/\/demo\/guide$/);
  await expect(page.getByRole('heading', { name: 'Guided walkthrough (read-only)' })).toBeVisible();
  await expect(page.getByText(/^NOT RUN END-TO-END/)).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Requirements coverage' })).toBeVisible();
  expect(await page.locator('main button, main form, main input').count()).toBe(0);
  expect(await page.getByText('Explanation only, not performed').count()).toBeGreaterThan(0);
  const over = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(over).toBeLessThanOrEqual(1);
});

test('Hiring assistant: a client describes the role in conversation, taps quick answers, creates it and makes it live', async ({ page }) => {
  await loadScenario(page, null);
  await switchTo(page, 'Emma Stone');
  await page.goto('/client/roles');
  await page.getByRole('link', { name: /Add (a )?role/ }).first().click();
  await expect(page).toHaveURL(/\/client\/roles\/new$/);
  await expect(page.getByText(/Hi Emma, I'm your hiring assistant/)).toBeVisible();
  await expect(page.getByText(/Demo mode: the assistant picks out key words/)).toBeVisible();
  const box = page.getByLabel('Your answer');
  const send = async (t: string) => { await box.fill(t); await box.press('Enter'); await expect(page.getByText(t, { exact: true }).last()).toBeVisible(); await expect(page.getByText('Your assistant is thinking…')).toHaveCount(0); };
  await send('We need a finance assistant to help with payroll and reconciliations.');
  await expect(page.getByText(/Job: Finance Assistant/)).toBeVisible();
  await send('In six months they should run payroll on their own.');
  await send('Reporting matters too, and Excel would be a bonus.');
  await page.getByRole('button', { name: 'We will teach our systems' }).click();
  await expect(page.getByText(/What is the salary/).last()).toBeVisible();
  await send('38k');
  await page.getByRole('button', { name: 'London', exact: true }).click();
  await expect(page.getByText('How will they work?').last()).toBeVisible();
  await page.getByRole('button', { name: 'Hybrid', exact: true }).click();
  await expect(page.getByText(/That’s everything I need/)).toBeVisible();
  const summary = page.getByRole('complementary');
  await expect(summary.getByText('£38,000')).toBeVisible();
  await expect(summary.getByText('Excel')).toBeVisible();
  await expect(page.getByText(/criteri/i)).toHaveCount(0);
  await page.getByRole('button', { name: 'Create role' }).click();
  await page.waitForURL(/\/client\/roles\/[0-9a-f-]{36}/);
  await expect(page.getByText('Finance Assistant').first()).toBeVisible();
  await expect(page.getByText('What matters')).toBeVisible();
  await page.getByRole('button', { name: 'Make role live' }).click();
  await page.getByRole('dialog').getByRole('button', { name: /make it live/i }).click();
  await expect(page.getByText('Open', { exact: true }).first()).toBeVisible();
  await page.goto('/client/roles/new');
  await expect(page.getByText(/Welcome back, Emma/)).toBeVisible();
  await page.getByText(/What I’ve learned about how you hire/).click();
  await expect(page.getByText('Usually hires for hybrid roles in London')).toBeVisible();
});
