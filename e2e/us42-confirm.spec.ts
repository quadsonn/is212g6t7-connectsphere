import { expect, test } from '@playwright/test';

import { USERS, signIn, signOut } from './support/auth';
import { given } from './support/db';

/**
 * US-42, E2E: the assigned Coordinator confirms an event only once its
 * arrangements are ready, and the Organiser sees that it is confirmed.
 *
 * Pre-conditions per test (reset the testDB first): test/fixtures/sql/
 * base-users.sql plus the scripts each test names. The "Graduation showcase"
 * is EVT-203 (tc-s3-70-setup.sql).
 */
test.describe('US-42: confirm an event when arrangements are ready (browser)', () => {
  // TC-S3-70, TC-S3-71 · US-42 AC-1, AC-2 · setup: base-users + tc-s3-70-setup + tc-s3-71-setup · fails if Confirm can be pressed while the venue is still pending, or the checklist does not say what is missing
  // Code: /coordinator/events/:id ConfirmArrangementsCard -> GET /events/:id/confirmation-readiness
  test('Confirm stays disabled and the checklist names what is missing', async ({ page }) => {
    await given('base-users', 'tc-s3-70-setup', 'tc-s3-71-setup');
    await signIn(page, USERS.coordinator);
    await page.goto('/coordinator/events/EVT-203');

    await expect(page.getByRole('button', { name: 'Confirm arrangements' })).toBeDisabled();
    await expect(page.getByRole('list', { name: 'Arrangements checklist' })).toContainText(
      'Venue booking at Hall A still pending',
    );
  });

  // TC-S3-70, TC-S3-73, TC-S3-74 · US-42 AC-1, AC-4, AC-5 · setup: base-users + tc-s3-70-setup + tc-s3-70b-setup · fails if a ready event cannot be confirmed, or the Organiser does not see it confirmed
  // Code: ConfirmArrangementsCard -> POST /events/:id/confirm; /organiser/:id status badge (lib/status.ts)
  test('a ready event is confirmed, and the Organiser sees it', async ({ page }) => {
    await given('base-users', 'tc-s3-70-setup', 'tc-s3-70b-setup');
    await signIn(page, USERS.coordinator);
    await page.goto('/coordinator/events/EVT-203');

    await page.getByRole('button', { name: 'Confirm arrangements' }).click();
    await page.getByRole('button', { name: 'Confirm', exact: true }).click();
    await expect(page.getByText('Arrangements confirmed. The event is now awaiting its safety review.')).toBeVisible();

    await signOut(page);
    await signIn(page, USERS.organiser);
    await page.goto('/organiser/EVT-203');
    await expect(page.getByText('Arrangements confirmed - awaiting safety review').first()).toBeVisible();
  });
});
