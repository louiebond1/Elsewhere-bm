import { test, expect } from '@playwright/test';
import { loadScenario, switchTo } from './helpers';

test('Mini Me globe: add a record (approved before saving), ask about it, see which record was used, confirm and delete it', async ({ page }) => {
  await loadScenario(page, null);
  await switchTo(page, 'Maya Ellis');
  await page.goto('/candidate/onboarding');
  await expect(page.getByRole('heading', { name: 'Mini Me' })).toBeVisible();
  await expect(page.getByText('An AI version of you, trained on your life, thoughts, and experiences.')).toBeVisible();

  // Add something to an area: shown first, saved only on approval.
  await page.getByRole('button', { name: /Interests and Hobbies/ }).click();
  await page.getByRole('button', { name: 'Add to Interests and Hobbies' }).click();
  await page.getByLabel('Heading').fill('Sailing');
  await page.getByLabel('In your own words').fill('I sail dinghies at a club on Sundays.');
  await page.getByRole('button', { name: 'Review', exact: true }).click();
  await expect(page.getByText('This will be added to Interests and Hobbies')).toBeVisible();
  await page.getByRole('button', { name: 'Add to Mini Me' }).click();
  await expect(page.getByText('Added to your Mini Me.')).toBeVisible();
  await page.getByRole('button', { name: 'Done' }).click();
  await expect(page.getByRole('button', { name: /Sailing/ })).toBeVisible();

  // Ask: the answer comes from that record, and it is listed as the source.
  await page.getByLabel('Ask your Mini Me').fill('Do I sail?');
  await page.getByRole('button', { name: 'Ask', exact: true }).click();
  await expect(page.getByText('I sail dinghies at a club on Sundays.').last()).toBeVisible();
  await page.getByText('Based on 1 record').click();
  await page.locator('section[aria-label="Ask Mini Me"]').getByRole('button', { name: /Sailing/ }).click();

  // The record: source, status, and the actions.
  await expect(page.getByText('Written by you')).toBeVisible();
  await expect(page.getByText('Confirmed', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Delete', exact: true }).click();
  await page.getByRole('button', { name: 'Delete', exact: true }).first().click();
  await expect(page.getByText('Delete for good?')).toHaveCount(0);
  await page.goto('/candidate/onboarding?view=knowledge');
  await expect(page.getByRole('heading', { name: 'Knowledge' })).toBeVisible();
  await expect(page.getByRole('button', { name: /Sailing/ })).toHaveCount(0);

  // Something it doesn't know is said plainly, with a way to teach it.
  await page.goto('/candidate/onboarding');
  await page.getByLabel('Ask your Mini Me').fill('What is my favourite opera?');
  await page.getByRole('button', { name: 'Ask', exact: true }).click();
  await expect(page.getByText(/I don’t know/)).toBeVisible();
  await expect(page.getByRole('button', { name: 'Teach it this' })).toBeVisible();

  // Interview mode offers the same questions real interviews use.
  await page.getByRole('tab', { name: /Test It/ }).click();
  await page.getByRole('button', { name: /Random interview question/ }).click();
  await expect(page.getByLabel('Interview question')).not.toHaveValue('');
});

test('Mini Me knowledge is the candidate’s alone: hiring managers cannot use it', async ({ page }) => {
  await loadScenario(page, null);
  await switchTo(page, 'Emma Stone');
  await expect(page).toHaveURL(/\/client\//);
  const res = await page.request.post('/api/knowledge/ask', { data: { question: 'What is Maya best at?' }, headers: { origin: new URL(page.url()).origin } });
  expect(res.ok()).toBeFalsy();
  // The router refuses other account types without saying the route exists.
  expect([401, 403, 404]).toContain(res.status());
});

test('@phone Mini Me globe fits a phone with no sideways scrolling', async ({ page }) => {
  await loadScenario(page, null);
  await switchTo(page, 'Maya Ellis');
  await page.goto('/candidate/onboarding');
  await expect(page.getByRole('heading', { name: 'Mini Me' })).toBeVisible();
  const w = await page.evaluate(() => [document.querySelector('.takeover')!.scrollWidth, window.innerWidth]);
  expect(w[0]).toBeLessThanOrEqual(w[1]);
  await expect(page.getByRole('tab', { name: 'Ask Mini Me' })).toBeVisible();
});
