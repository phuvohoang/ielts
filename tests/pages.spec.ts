import { test, expect } from '@playwright/test';

test('GitHub Pages assets, hash navigation, and refresh work under the repository path', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('/ielts/');
  await expect(page.getByRole('heading', { name: 'Make room for progress.' })).toBeVisible();
  await page.getByRole('link', { name: 'Start learning', exact: true }).click();
  await expect(page).toHaveURL(/\/ielts\/#\/lessons$/);
  await expect(page.getByRole('heading', { name: 'Parts of Speech & Word Formation.' })).toBeVisible();
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Parts of Speech & Word Formation.' })).toBeVisible();
  await page.getByRole('link', { name: 'Practise 01A' }).click();
  await page.getByRole('button', { name: 'Start practice' }).click();
  await expect(page.locator('.practice-card h2')).toBeVisible();
  expect(errors).toEqual([]);
});
