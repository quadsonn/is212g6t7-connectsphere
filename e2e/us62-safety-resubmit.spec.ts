import { expect, test } from '@playwright/test';

import { USERS, signIn } from './support/auth';
import { given } from './support/db';

/**
 * US-62, E2E: the Coordinator sees why the Safety Officer sent the event back
 * (the reason, the stage to rework and what is flagged), sends it back with a
 * note, and sees it waiting for a new check with the note beside the feedback.
 *
 * Pre-conditions (reset the testDB first): test/fixtures/sql/base-users.sql,
 * tc-s3-177-setup.sql, tc-s3-177e-setup.sql ("Careers Fair" EVT-300 with Main
 * Hall approved) and tc-s4-80-setup.sql (changes requested, plan edited since).
 */
test.describe('US-62: the Coordinator responds to a safety check (browser)', () => {
  // TC-S4-81, TC-S4-85, TC-S4-86, TC-S4-87 · US-62 AC-2, AC-6 to AC-8 · setup: base-users + tc-s3-177-setup + tc-s3-177e-setup + tc-s4-80-setup · fails if the reasons, stage or flagged arrangements are not shown, or sending back with a note does not return it for a check with the note beside the feedback
  // Code: /coordinator/events/:id Safety check card -> POST /safety/events/:id/resubmit -> SafetyHistory
  test('sees the feedback, sends the event back with a note, and sees it waiting for a new check', async ({ page }) => {
    await given('base-users', 'tc-s3-177-setup', 'tc-s3-177e-setup', 'tc-s4-80-setup');
    await signIn(page, USERS.coordinator);
    await page.goto('/coordinator/events/EVT-300');

    await expect(page.getByText(/The Safety Officer asked for changes to the venue planning/)).toBeVisible();
    await expect(page.getByText('Only one exit for 150 people')).toBeVisible();
    await expect(page.getByText(/Returned to venue planning; the venue booking is flagged for re-review/)).toBeVisible();

    await page.getByLabel(/Comment for the Safety Officer/).fill('Added a second exit at the rear.');
    await page.getByRole('button', { name: 'Send back for safety check' }).click();

    await expect(page.getByText(/The event is waiting for the Safety\s+Officer/)).toBeVisible();
    await expect(page.getByText('Added a second exit at the rear.')).toBeVisible();
    await expect(page.getByText(/The Coordinator sent it back for a new check on/)).toBeVisible();
  });
});
