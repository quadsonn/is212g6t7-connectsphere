import { expect, test } from '@playwright/test';

import { USERS, signIn, signOut } from './support/auth';
import { given } from './support/db';

/**
 * US-32 to US-35, E2E: an Organiser cancels an event and Technical Support see
 * its equipment released; an Attendee registers for an event and sees it in My
 * registrations; and an Attendee withdraws, with a confirmation step, where
 * the cutoff and status allow.
 *
 * Pre-conditions per test (reset the testDB first): test/fixtures/sql/
 * base-users.sql plus the scripts each test names.
 */
test.describe('US-32 to US-35: releasing equipment, and registering (browser)', () => {
  // TC-S2-135 · US-32 AC-1, AC-3 · setup: base-users + tc-s2-122-setup + tc-s2-130-setup · fails if cancelling an event in the app left its equipment held, or Technical Support couldn't see the release
  // Code: /organiser/:id "Cancel event" (CancelEventPanel) -> POST /events/:id/cancel -> setStatus(CANCELLED);
  // /equipment/released (EquipmentReleased) -> GET /equipment/reservations/released.
  test('an Organiser cancels an event, and Technical Support see its equipment released', async ({ page }) => {
    await given('base-users', 'tc-s2-122-setup', 'tc-s2-130-setup');
    await signIn(page, USERS.organiser);
    await page.goto('/organiser/EVT-060');

    await page.getByRole('button', { name: 'Cancel event' }).click();
    await page.getByLabel(/Reason for cancelling/).fill('Speaker withdrew');
    await page.getByRole('button', { name: 'Confirm cancellation' }).click();
    await expect(page.getByText('Cancelled').first()).toBeVisible();

    await signOut(page);
    await signIn(page, USERS.techSupport);
    await page.goto('/equipment/released');
    await expect(page.getByRole('row', { name: /Capstone Showcase Wireless microphone 1 Event cancelled/ })).toBeVisible();
    // The rejected reservation held nothing, so it isn't listed.
    await expect(page.getByRole('row', { name: /Portable PA system/ })).toHaveCount(0);
  });

  // TC-S2-144 · US-33 AC-1, AC-2, AC-3, US-34 AC-1 · setup: base-users + tc-s2-136-setup · fails if an Attendee couldn't register from Browse events, an invalid phone wasn't flagged, or the registration wasn't confirmed and listed
  // Code: /events (AttendeeDashboard) -> RegisterAction, RegisterForm -> POST /registrations; /events/mine -> GET /registrations/me.
  test('an Attendee registers for an event and finds it in My registrations', async ({ page }) => {
    await given('base-users', 'tc-s2-136-setup');
    await signIn(page, USERS.attendee);
    await page.goto('/events');

    const gala = page.getByRole('listitem').filter({ hasText: 'Spring Gala' });
    await gala.getByRole('button', { name: 'Register' }).click();

    // AC-2: an invalid phone is flagged and nothing is saved.
    await gala.getByLabel(/Phone number/).fill('12');
    await gala.getByRole('button', { name: 'Confirm registration' }).click();
    await expect(gala.getByLabel(/Phone number/)).toHaveAttribute('aria-invalid', 'true');

    // AC-3: a valid one registers, with a confirmation.
    await gala.getByLabel(/Phone number/).fill('+65 9123 4567');
    await gala.getByRole('button', { name: 'Confirm registration' }).click();
    await expect(page.getByRole('status')).toContainText('You are registered for Spring Gala.');

    // US-34 AC-1: it is in My registrations as Registered.
    await page.getByRole('link', { name: 'View my registrations' }).click();
    const row = page.getByRole('listitem').filter({ hasText: 'Spring Gala' });
    await expect(row.getByText('Registration: Registered')).toBeVisible();
    await expect(row.getByRole('button', { name: 'Withdraw' })).toBeEnabled();
  });

  // TC-S2-158 · US-35 AC-1, AC-2, AC-3, AC-5, AC-6 · setup: base-users + tc-s2-142-setup + tc-s2-151-setup · fails if withdrawing skipped the confirmation, "Keep my place" changed anything, or withdrawal was offered past the cutoff or on a withdrawn registration
  // Code: /events/mine (AttendeeRegistrations): Withdraw -> prompt -> POST /registrations/:id/withdraw.
  test('an Attendee withdraws after confirming; past the cutoff, or once withdrawn, it is not offered', async ({ page }) => {
    await given('base-users', 'tc-s2-142-setup', 'tc-s2-151-setup');
    await signIn(page, USERS.attendee);
    await page.goto('/events/mine');

    const dinner = page.getByRole('listitem').filter({ hasText: 'Charity Dinner' });
    // AC-2: cancelling the prompt changes nothing.
    await dinner.getByRole('button', { name: 'Withdraw' }).click();
    await dinner.getByRole('button', { name: 'Keep my place' }).click();
    await expect(dinner.getByText('Registration: Registered')).toBeVisible();

    // AC-3: confirming withdraws it.
    await dinner.getByRole('button', { name: 'Withdraw' }).click();
    await dinner.getByRole('button', { name: 'Yes, withdraw' }).click();
    await expect(dinner.getByText('Registration: Withdrawn')).toBeVisible();
    await expect(dinner.getByRole('button', { name: 'Withdraw' })).toHaveCount(0);

    // AC-5: past the cutoff, Withdraw is unavailable and the deadline is shown.
    const lecture = page.getByRole('listitem').filter({ hasText: 'Late Lecture' });
    await expect(lecture.getByRole('button', { name: 'Withdraw' })).toBeDisabled();
    await expect(lecture.getByText(/The deadline to withdraw was/)).toBeVisible();

    // AC-6: an already-withdrawn registration has no Withdraw option.
    const film = page.getByRole('listitem').filter({ hasText: 'Film Night' });
    await expect(film.getByRole('button', { name: 'Withdraw' })).toHaveCount(0);
  });
});
