import { expect, test } from '@playwright/test';

import { USERS, signIn, signOut } from './support/auth';
import { given } from './support/db';

/**
 * US-20 to US-23, E2E: a Coordinator requests a venue for an approved event;
 * Venue Staff find it in their queue, see the overlap check and the event's
 * requirements, and decide it; the Coordinator sees the decision; a request
 * that hard-conflicts with a confirmed booking can't be approved.
 *
 * Pre-conditions per test (reset the testDB first): test/fixtures/sql/
 * base-users.sql + base-venues.sql, plus the scripts each test names.
 */
test.describe('US-20 to US-23: booking a venue (browser)', () => {
  // TC-S2-187 · US-20 AC-1, AC-5, AC-6, US-21 AC-1, AC-6, AC-7, US-22 AC-1, AC-2, AC-5, AC-7, US-23 AC-3 · setup: base-users + base-venues + tc-s2-34-setup + tc-s2-38-setup · fails if any step of request -> queue -> review -> reject -> see the decision broke
  // Code: BookingRequestForm -> POST /bookings; /venues/bookings (VenueBookingQueue) -> GET /bookings/queue;
  // /venues/bookings/:id (BookingDetails, BookingDecisionPanel) -> POST /bookings/:id/reject; /coordinator/bookings.
  test('a request travels from the Coordinator to Venue Staff and back with its decision', async ({ page }) => {
    await given('base-users', 'base-venues', 'tc-s2-34-setup', 'tc-s2-38-setup');

    // US-20: the Coordinator requests Main Hall; a pending request overlaps, so it is accepted with a warning.
    await signIn(page, USERS.coordinator);
    await page.goto('/coordinator/events/EVT-102');
    await page.locator('#booking-venue').selectOption('VEN-002');
    await page.getByRole('button', { name: 'Submit booking request' }).click();
    await expect(page.getByText('Booking request submitted — pending Venue Staff approval.')).toBeVisible();
    await expect(page.getByRole('alert').filter({ hasText: 'Another pending request overlaps' })).toContainText('Hackathon');
    await page.getByRole('link', { name: 'View my venue requests' }).click();
    await expect(page.getByText('Orientation').first()).toBeVisible();

    // US-21: Venue Staff see it in their pending queue and open it.
    await signOut(page);
    await signIn(page, USERS.venueStaff);
    await page.goto('/venues/bookings');
    await page.getByRole('link', { name: /Orientation/ }).click();
    await expect(page.getByRole('heading', { name: 'Orientation' })).toBeVisible();
    // US-21 AC-6: the special requirements are on the request.
    await expect(page.getByText('Two hearing aid users')).toBeVisible();
    // US-23 AC-3: the pending overlap is a warning, not a block.
    await expect(page.getByText('Hackathon').first()).toBeVisible();
    await expect(page.getByRole('radio', { name: 'Approve' })).toBeEnabled();

    // US-22 AC-2: Reject needs a reason.
    await page.getByRole('radio', { name: 'Reject' }).click();
    await expect(page.getByRole('button', { name: 'Submit decision' })).toBeDisabled();
    await page.getByLabel(/Reason for rejection/).fill('Main Hall is closed that morning');
    await page.getByRole('button', { name: 'Submit decision' }).click();
    // US-22 AC-7: decided, so Approve and Reject are gone.
    await expect(page.getByText(/This request has been rejected/)).toBeVisible();
    await expect(page.getByRole('radio', { name: 'Approve' })).toHaveCount(0);

    // US-21 AC-7: it has moved to the Decided view.
    await page.goto('/venues/bookings');
    await expect(page.getByRole('link', { name: /Orientation/ })).toHaveCount(0);
    await page.getByRole('tablist', { name: 'Queue view' }).getByRole('tab', { name: 'Decided' }).click();
    await expect(page.getByRole('link', { name: /Orientation/ })).toBeVisible();

    // US-22 AC-5: the Coordinator sees the decision and the reason.
    await signOut(page);
    await signIn(page, USERS.coordinator);
    await page.goto('/coordinator/bookings');
    await page.getByRole('link', { name: /Orientation/ }).first().click();
    await expect(page.getByText('Main Hall is closed that morning').first()).toBeVisible();
  });

  // TC-S2-82 · US-23 AC-1, AC-2, AC-4, AC-5 · setup: base-users + base-venues + tc-s2-48-setup + tc-s2-61-setup · fails if a request overlapping a confirmed booking could be approved, or the clash was not named
  // Code: BookingDecisionPanel -> GET /bookings/:id/conflicts; hasHardConflict disables Approve; Reject stays available.
  test('a request overlapping a confirmed booking shows the clash and cannot be approved', async ({ page }) => {
    await given('base-users', 'base-venues', 'tc-s2-48-setup', 'tc-s2-61-setup');
    await signIn(page, USERS.venueStaff);
    await page.goto('/venues/bookings/BKG-031');

    await expect(page.getByRole('heading', { name: 'Showcase' })).toBeVisible();
    await expect(page.getByText('Confirmed').first()).toBeVisible();
    await expect(page.getByRole('radio', { name: 'Approve' })).toBeDisabled();
    await expect(page.getByRole('radio', { name: 'Reject' })).toBeEnabled();
  });
});
