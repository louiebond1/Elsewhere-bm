import { expect, type Page } from '@playwright/test';

export const GATE = process.env.E2E_GATE_PASSWORD ?? 'local-gate-password-1';

export async function enterGate(page: Page) {
  await page.goto('/demo');
  if (page.url().endsWith('/demo')) {
    await page.getByLabel('Access password').fill(GATE);
    await page.getByRole('button', { name: 'Enter private demo' }).click();
  }
  await page.waitForURL('**/demo/personas');
}

export async function loadScenario(page: Page, code: string | null) {
  await enterGate(page);
  const res = await page.request.post(code ? `/api/demo/scenario/${code}/load` : '/api/demo/reset', { data: { confirm: 'RESET' }, headers: { origin: new URL(page.url()).origin } });
  expect(res.ok()).toBeTruthy();
  await page.goto('/demo/personas');
}

export async function switchTo(page: Page, label: string) {
  await page.goto('/demo/personas');
  if (/^CAND-/.test(label)) {
    await page.locator('summary', { hasText: 'All fictional candidates' }).click();
    await page.getByRole('button', { name: new RegExp(label) }).click();
  } else {
    await page.getByRole('button', { name: new RegExp(label) }).first().click();
  }
  await page.waitForLoadState('networkidle');
}
