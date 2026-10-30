import { expect, test } from '@playwright/test';

import { PASSWORD, USERS, signIn, signOut } from './support/auth';
import { given } from './support/db';

/**
 * US-01 (Log in securely), E2E: the real login screen, the real API and the
 * local test database, in Chromium.
 *
 * Pre-condition for every test: reset the testDB, then run
 * test/fixtures/sql/base-users.sql.
 */
test.describe('US-01 log in securely (browser)', () => {
  test.beforeEach(async () => {
    await given('base-users');
  });

  // TC-S1-58 · US-01 AC-3 · setup: base-users · fails if a protected page opened without a session, or showed its data
  // Code: ProtectedRoute (frontend) finds no session and <Navigate>s to /login before the page renders.
  test('AC-3: opening a protected page directly while signed out lands on the login page', async ({ page }) => {
    await page.goto('/organiser');

    await expect(page).toHaveURL(/\/login$/);
    await expect(page.getByRole('heading', { name: 'Sign in' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'My event requests' })).toHaveCount(0);
  });

  // TC-S1-64 · US-01 AC-2 · setup: base-users · fails if a wrong password signed in, or the message said which field was wrong
  // Code: POST /auth/login answers 401 "invalid email or password" for both cases; LoginPage shows it and stores no token.
  test('AC-2: a wrong password and an unknown email show the same generic error and stay on the login page', async ({ page }) => {
    const messages: string[] = [];
    for (const [email, password] of [
      [USERS.organiser, 'wrong-password'],
      ['nobody@example.com', PASSWORD],
    ]) {
      await page.goto('/login');
      await page.getByLabel('Email address').fill(email);
      await page.getByLabel('Password').fill(password);
      await page.getByRole('button', { name: 'Sign in' }).click();

      const alert = page.getByRole('alert').first();
      await expect(alert).toBeVisible();
      messages.push((await alert.innerText()).trim());
      await expect(page).toHaveURL(/\/login$/);
    }

    expect(messages[0]).toMatch(/invalid email or password/i);
    expect(messages[1]).toBe(messages[0]);
    expect(await page.evaluate(() => localStorage.getItem('connectsphere.token'))).toBeNull();
  });

  // TC-S1-64 · US-01 AC-1 · setup: base-users · fails if valid credentials did not open the user's own dashboard
  // Code: AuthProvider.signIn stores the JWT; LoginPage navigates to HOME_BY_ROLE[role] (/organiser for an Organiser).
  test('AC-1: valid credentials sign in and open the user’s own dashboard', async ({ page }) => {
    await signIn(page, USERS.organiser);

    await expect(page).toHaveURL(/\/organiser$/);
    await expect(page.getByRole('heading', { name: 'My event requests' })).toBeVisible();
  });

  // TC-S1-65 · US-01 AC-4 · setup: base-users · fails if signing out left the session usable, or a protected page still opened
  // Code: signOut() calls POST /auth/logout (revokes the token's jti), clears the stored token, and ProtectedRoute then redirects.
  test('AC-4: signing out ends the session; protected pages need signing in again', async ({ page }) => {
    await signIn(page, USERS.organiser);
    const token = await page.evaluate(() => localStorage.getItem('connectsphere.token'));

    await signOut(page);

    await expect(page).toHaveURL(/\/login/);
    await page.goto('/organiser');
    await expect(page).toHaveURL(/\/login$/);

    // The old token is revoked server-side, not just forgotten by the browser.
    const status = await page.evaluate(async (old) => {
      const res = await fetch('/api/auth/me', { headers: { Authorization: `Bearer ${old}` } });
      return res.status;
    }, token);
    expect(status).toBe(401);
  });
});
