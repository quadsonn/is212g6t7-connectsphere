import { expect, test } from '@playwright/test';

/**
 * Smoke test — proves the runner, the app and the seed data line up before any
 * agent-generated test is trusted. Mirrors the setup smoke prompt: log in as
 * the Coordinator and read the venue list.
 *
 * Should pass on BOTH branches; the planted bugs don't touch login or listing.
 */
// Start logged out: this test checks the real login form, not the saved session.
test.use({ storageState: { cookies: [], origins: [] } });

test('Coordinator can log in and see the seeded venues', async ({ page }) => {
  await page.goto('/login');
  await page.getByLabel('Email address').fill('coordinator@connectsphere.local');
  await page.getByLabel('Password').fill('12345678');
  await page.getByRole('button', { name: 'Sign in' }).click();

  await page.getByRole('link', { name: 'Venues' }).click();

  await expect(page.getByRole('heading', { name: 'Venues' })).toBeVisible();
  for (const venue of ['Seminar Room B', 'Lecture Theatre 1', 'Main Auditorium']) {
    await expect(page.getByText(venue).first()).toBeVisible();
  }
});
