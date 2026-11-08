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
  for (const u of ['/client/home', '/client/roles', '/client/credits', '/client/hires', '/client/onboarding']) {
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
