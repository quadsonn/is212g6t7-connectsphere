import { expect, test } from '@playwright/test';

import { USERS, signIn } from './support/auth';
import { given } from './support/db';

/**
 * US-43, E2E: the Organiser cancels their own event from its page, with a
 * reason and a confirmation; an event that cannot be cancelled offers no
 * option at all.
 *
 * Pre-conditions (reset the testDB first): test/fixtures/sql/base-users.sql,
 * base-venues.sql, tc-s3-75-setup.sql ("Autumn Festival", EVT-205, in
 * planning) and tc-s3-75b-setup.sql (a draft, EVT-206).
 */
test.describe('US-43: cancel an event (browser)', () => {
  // TC-S3-75, TC-S3-76, TC-S3-77 · US-43 AC-1, AC-2, AC-3 · setup: base-users + base-venues + tc-s3-75-setup + tc-s3-75b-setup · fails if a draft offers Cancel, or a live event cannot be cancelled with a reason and confirmation
  // Code: /organiser/:id canCancel (CANCELLABLE_EVENT_STATUSES, start in the future) -> CancelEventPanel -> POST /events/:id/cancel
  test('a draft offers no Cancel; a live event is cancelled with a reason and shows Cancelled', async ({ page }) => {
    await given('base-users', 'base-venues', 'tc-s3-75-setup', 'tc-s3-75b-setup');
    await signIn(page, USERS.organiser);

    await page.goto('/organiser/EVT-206');
    await expect(page.getByRole('heading', { name: 'Draft fair' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Cancel event' })).toHaveCount(0);

    await page.goto('/organiser/EVT-205');
    await page.getByRole('button', { name: 'Cancel event' }).click();
    await page.getByLabel('Reason for cancelling').fill('Keynote speaker withdrew');
    await page.getByRole('button', { name: 'Confirm cancellation' }).click();

    await expect(page.getByText('Cancelled').first()).toBeVisible();
    await expect(page.getByRole('button', { name: 'Cancel event' })).toHaveCount(0);
  });
});
