import { test, expect } from '@playwright/test';
import { loadScenario } from './helpers';

test('Demo entry: three doors; a blank client with 10 credits; your own candidate, with a full reset @phone', async ({ page }) => {
  await loadScenario(page, null);
  const origin = new URL(page.url()).origin;
  const su = await page.request.post('/api/auth/candidate-signup', { headers: { origin }, data: { fullName: 'Test Person', email: `t${Date.now()}@tester.test`, password: 'long-enough-pw', region: 'london', workModes: ['hybrid'], roleFamilies: ['finance'], acceptTerms: true, acceptAi: true, wantsDiscovery: true, preferencesConfirmed: false } });
  expect(su.ok()).toBeTruthy();

  await page.goto('/demo/personas');
  await expect(page.getByRole('heading', { name: 'Who are you today?' })).toBeVisible();
  await expect(page.getByRole('button', { name: /BondMoran/ })).toBeVisible();
  await expect(page.getByRole('link', { name: /Candidate/ })).toBeVisible();
  // Seeded fictional people stay on Tester tools, not here.
  await expect(page.getByText('Maya Ellis')).toHaveCount(0);

  await page.getByRole('link', { name: /Client/ }).click();
  await page.getByRole('button', { name: /New blank client/ }).click();
  await page.waitForURL(/\/client\/home$/, { timeout: 60_000 });
  await expect(page.getByText('10 credits').first()).toBeVisible();

  await page.goto('/demo/candidates');
  await expect(page.getByRole('link', { name: /Add new/ })).toBeVisible();
  await page.getByRole('button', { name: /Test Person/ }).click();
  await page.waitForURL(/\/candidate\/home$/);
  await page.goto('/candidate/privacy');
  await page.getByRole('button', { name: 'Full reset' }).click();
  const d = page.getByRole('dialog');
  await d.getByLabel('Type RESET to confirm').fill('RESET');
  await d.getByRole('button', { name: 'Reset everything' }).click();
  await page.waitForURL(/\/candidate\/home$/);
});
