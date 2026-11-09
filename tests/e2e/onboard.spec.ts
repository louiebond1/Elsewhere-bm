import { test, expect } from '@playwright/test';
import { loadScenario, switchTo } from './helpers';

test('BondMoran onboards a new client, who then logs in with the password they were given and can start a hire', async ({ page }) => {
  await loadScenario(page, null);
  await switchTo(page, 'Alex Morgan');
  await page.goto('/consultant/home');
  await page.getByRole('link', { name: 'Onboard someone new' }).click();
  await expect(page.getByRole('heading', { name: 'Onboard someone new' })).toBeVisible();
  await page.getByRole('button', { name: 'Create their account' }).click();
  await expect(page.getByText('Enter the company name')).toBeVisible();
  await page.getByLabel('Company name').fill('Thornfield Fabrics');
  await page.getByLabel('Hiring manager’s name').fill('Sam Rivers');
  await page.getByLabel('Their email').fill('sam@thornfield.test');
  await page.getByLabel('Starting password').fill('a-long-starting-pw');
  await page.getByLabel('Starting credits').fill('12');
  await page.getByRole('button', { name: 'Create their account' }).click();
  await expect(page.getByText('Thornfield Fabrics is ready')).toBeVisible();
  await expect(page.getByLabel('Login details to send')).toContainText('Password: a-long-starting-pw');

  // Now log in as the new client.
  await page.getByRole('button', { name: 'Sign out' }).click();
  await page.waitForURL(/\/login/);
  await page.getByLabel('Email').fill('sam@thornfield.test');
  await page.getByLabel('Password').fill('a-long-starting-pw');
  await page.getByRole('button', { name: 'Sign in' }).click();
  await page.waitForURL(/\/client\/home/);
  await expect(page.getByRole('heading', { name: 'Hi Sam' })).toBeVisible();
  await expect(page.getByText('12 credits')).toBeVisible();
  await page.getByRole('link', { name: 'Start a new hire' }).click();
  await expect(page.getByLabel('Your answer')).toBeVisible();
});
