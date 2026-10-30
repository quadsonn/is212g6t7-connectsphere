import { expect, test } from '@playwright/test';

import { USERS, signIn, signOut } from './support/auth';
import { given } from './support/db';

/**
 * US-36 and US-37, E2E: an Organiser requests a change to their event, which
 * keeps its original details beside the pending request; the Coordinator
 * rejects it with a reason, which the Organiser then sees. And a Coordinator
 * reviews a request that would overfill the booked venue: the warning shows
 * before deciding, and approving updates the event.
 *
 * Pre-conditions per test (reset the testDB first): test/fixtures/sql/
 * base-users.sql plus the scripts each test names.
 */
test.describe('US-36 and US-37: change requests (browser)', () => {
  // TC-S2-171 · US-36 AC-1, AC-8, AC-9, US-37 AC-3, AC-5 · setup: base-users + tc-s2-159-setup · fails if the Organiser couldn't request a change, the event lost its original details meanwhile, or a rejection's reason didn't reach the Organiser
  // Code: /organiser/:id "Request a change" (ChangeRequestForm) -> POST /events/:id/change-requests; PendingChangeRequest;
  // /coordinator/change-requests/:id -> POST /change-requests/:id/reject; the Organiser's page shows the decision.
  test('an Organiser requests a change; the Coordinator rejects it with a reason the Organiser sees', async ({ page }) => {
    await given('base-users', 'tc-s2-159-setup');
    await signIn(page, USERS.organiser);
    await page.goto('/organiser/EVT-063');

    await page.getByRole('button', { name: 'Request a change' }).click();
    await page.locator('#cr-attendance').selectOption('499');
    await page.getByLabel(/Reason for the change/).fill('More sign-ups than expected');
    await page.getByRole('button', { name: 'Submit change request' }).click();

    // AC-8, AC-9: the request is pending, beside the event's unchanged details.
    await expect(page.getByText('Pending change request', { exact: true })).toBeVisible();
    await expect(page.getByText('More sign-ups than expected')).toBeVisible();
    await expect(page.getByText('200 – 499').first()).toBeVisible();
    await expect(page.getByRole('button', { name: 'Request a change' })).toHaveCount(0);

    // US-37: the Coordinator rejects it with a reason.
    await signOut(page);
    await signIn(page, USERS.coordinator);
    await page.goto('/coordinator/change-requests');
    await page.getByRole('listitem').filter({ hasText: 'Tech Talk' }).getByRole('link').click();
    await page.getByRole('button', { name: 'Reject' }).click();
    await page.getByLabel(/Reason for rejecting/).fill('No larger room is free that day');
    await page.getByRole('button', { name: 'Confirm rejection' }).click();
    await expect(page.getByText('Rejected. Tech Talk is unchanged.')).toBeVisible();

    // US-37 AC-5: the Organiser sees the rejection and its reason.
    await signOut(page);
    await signIn(page, USERS.organiser);
    await page.goto('/organiser/EVT-063');
    await expect(page.getByText(/Your change request was rejected.*: No larger room is free that day/)).toBeVisible();
  });

  // TC-S2-181 · US-37 AC-1, AC-2, AC-4, AC-6 · setup: base-users + base-venues + tc-s2-159-setup + tc-s2-172-setup · fails if the Coordinator saw another's requests, the capacity warning was missing before deciding, or approving didn't update the event
  // Code: /coordinator/change-requests -> GET /change-requests/pending; the detail page's warning and comparison;
  // Approve -> POST /change-requests/:id/approve.
  test('a Coordinator sees only their requests, is warned about capacity, and approves', async ({ page }) => {
    await given('base-users', 'base-venues', 'tc-s2-159-setup', 'tc-s2-172-setup');
    await signIn(page, USERS.coordinator);
    await page.goto('/coordinator/change-requests');

    // AC-1: only this Coordinator's pending requests.
    await expect(page.getByRole('listitem').filter({ hasText: 'Open House' })).toBeVisible();
    await expect(page.getByRole('listitem').filter({ hasText: 'Tech Talk' })).toBeVisible();
    await expect(page.getByText("Casey's Event")).toHaveCount(0);

    // AC-2, AC-6: the reason, the side-by-side values, and the warning before deciding.
    await page.getByRole('listitem').filter({ hasText: 'Tech Talk' }).getByRole('link').click();
    await expect(page.getByText('More sign-ups than expected')).toBeVisible();
    await expect(page.getByRole('row', { name: /Expected attendance 120 350/ })).toBeVisible();
    await expect(page.getByRole('alert').filter({ hasText: 'Check before you decide' })).toContainText('Main Hall');

    // AC-4: approving updates the event.
    await page.getByRole('button', { name: 'Approve' }).click();
    await expect(page).toHaveURL(/\/coordinator\/change-requests$/);
    await expect(page.getByRole('listitem').filter({ hasText: 'Tech Talk' })).toHaveCount(0);
    await page.goto('/coordinator/events/EVT-063');
    await expect(page.getByRole('row', { name: /Expected attendance 120 350/ })).toBeVisible();
  });
});
