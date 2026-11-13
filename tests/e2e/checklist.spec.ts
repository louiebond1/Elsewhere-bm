import { test, expect } from '@playwright/test';
import { loadScenario, switchTo } from './helpers';

test('employer reviews and approves the exact job checklist @phone', async ({ page }) => {
  await loadScenario(page, null);
  await switchTo(page, 'Emma Stone');
  await page.goto('/client/roles?tab=draft');
  await page.getByRole('link', { name: /Accounts Assistant/ }).first().click();
  await page.getByRole('link', { name: 'Edit draft', exact: true }).click();
  await page.getByRole('button', { name: 'Save changes', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Your job checklist' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'These requirements are right' })).toBeVisible();
  await page.getByRole('button', { name: 'These requirements are right' }).click();
  await expect(page.getByText('Checklist approved.', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'These requirements are right' })).toHaveCount(0);
  await page.screenshot({ path: `/tmp/elsewhere-checklist-${test.info().project.name}.png`, fullPage: true });
});
