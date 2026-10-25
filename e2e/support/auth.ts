import { expect, type Page } from '@playwright/test';

/** Every fixture user's password (test/fixtures/sql/base-users.sql). */
export const PASSWORD = 'correct-horse-battery-staple';

/** Users from base-users.sql, by role. */
export const USERS = {
  organiser: 'organiser@example.com',
  coordinator: 'coord.a@example.com',
  venueStaff: 'venue.staff@example.com',
  techSupport: 'tech.support@example.com',
  attendee: 'attendee@example.com',
} as const;

/** Signs in through the login form, as a user would. */
export async function signIn(page: Page, email: string, password = PASSWORD): Promise<void> {
  await page.goto('/login');
  await page.getByLabel('Email address').fill(email);
  await page.getByLabel('Password').fill(password);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page).not.toHaveURL(/\/login/);
}

/** Signs out through the user menu in the top bar. */
export async function signOut(page: Page): Promise<void> {
  await page.locator('button[aria-haspopup="menu"]').click();
  await page.getByRole('menuitem', { name: 'Sign out' }).click();
}
