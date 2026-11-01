import { expect, test, type Page } from '@playwright/test';

import { USERS, signIn } from './support/auth';
import { given } from './support/db';

/**
 * US-02 (Role-appropriate access restriction), E2E: what each role can see
 * and reach in the real app. The server-side rules are proven by
 * test/access-control.e2e-spec.ts; these check the screens agree with them.
 *
 * Pre-condition for every test: reset the testDB, then run
 * test/fixtures/sql/base-users.sql + tc-s1-22-setup.sql + tc-s1-67-setup.sql.
 */
const sideMenu = (page: Page) => page.getByRole('navigation', { name: 'Main' }).last();

test.describe('US-02 role-appropriate access (browser)', () => {
  test.beforeEach(async () => {
    await given('base-users', 'tc-s1-22-setup', 'tc-s1-67-setup');
  });

  // TC-S1-75 · US-02 AC-4 · setup: base-users + tc-s1-22-setup + tc-s1-67-setup · fails if a role's menu showed another role's screens
  // Code: AppShell renders NAV_BY_ROLE[session.role] only.
  test('AC-4: each role sees only its own menu', async ({ page }) => {
    await signIn(page, USERS.organiser);
    await expect(sideMenu(page).getByRole('link')).toHaveText(['My requests']);
    await page.context().clearCookies();
    await page.evaluate(() => localStorage.clear());

    await signIn(page, USERS.coordinator);
    await expect(sideMenu(page).getByRole('link')).toHaveText([
      'My events',
      'Change requests',
      'My venue requests',
      'Venues',
    ]);
    await expect(sideMenu(page).getByRole('link', { name: 'My requests' })).toHaveCount(0);
  });

  // TC-S1-75 · US-02 AC-3 · setup: base-users + tc-s1-22-setup + tc-s1-67-setup · fails if typing another role's URL opened that screen
  // Code: ProtectedRoute allow={['EVENT_COORDINATOR']} sends an Organiser back to their own home.
  test('AC-3: an Organiser who types a Coordinator URL is sent back to their own home', async ({ page }) => {
    await signIn(page, USERS.organiser);

    await page.goto('/coordinator');

    await expect(page).toHaveURL(/\/organiser$/);
    await expect(page.getByRole('heading', { name: 'My event requests' })).toBeVisible();
  });

  // TC-S1-71 · US-02 AC-5 · setup: base-users + tc-s1-22-setup + tc-s1-67-setup · fails if an Organiser saw, or could open, another Organiser's request
  // Code: GET /events (OWN scope) lists only theirs; GET /events/EVT-161 answers 404, so the page shows an error and no data.
  test('AC-5: an Organiser sees only their own requests, and another’s cannot be opened by URL', async ({ page }) => {
    await signIn(page, USERS.organiser);

    await expect(page.getByText('Event owned by A')).toBeVisible();
    await expect(page.getByText('Event owned by B')).toHaveCount(0);

    await page.goto('/organiser/EVT-161');
    await expect(page.getByRole('alert')).toBeVisible();
    await expect(page.getByText('Event owned by B')).toHaveCount(0);
  });

  // TC-S1-73 · US-02 AC-7 · setup: base-users + tc-s1-22-setup + tc-s1-67-setup · fails if an Attendee saw a draft or any internal planning text
  // Code: GET /events for an Attendee is PUBLIC scope and the public projection, so drafts and notes never arrive.
  test('AC-7: an Attendee sees confirmed events but no drafts and no internal planning text', async ({ page }) => {
    await signIn(page, USERS.attendee);

    await expect(page.getByRole('heading', { name: 'Browse events' })).toBeVisible();
    await expect(page.getByText('Event owned by A')).toBeVisible();
    await expect(page.getByText('Unreviewed draft')).toHaveCount(0);
    await expect(page.getByText(/INTERNAL/)).toHaveCount(0);
  });
});
