import { expect, test, type Page } from '@playwright/test';

import { USERS, signIn } from './support/auth';
import { given } from './support/db';

/**
 * US-16 to US-19, E2E: Venue Staff's availability calendar (views, a slot's
 * details, blocked time, on desktop and phone); a Coordinator's view of one
 * venue's availability; searching venues with filters; and the suitability
 * check, which flags a misfit but never stops the request.
 *
 * The Venue Staff calendar opens on today, so its booking comes from
 * tc-s2-10-setup.sql, which is dated relative to now. The Coordinator's
 * calendar is moved forward to March 2027 with its Next month button. Times
 * are Singapore time.
 *
 * Pre-conditions per test (reset the testDB first): test/fixtures/sql/
 * base-users.sql plus the scripts each test names.
 */
test.use({ timezoneId: 'Asia/Singapore' });

/** Clicks the Coordinator calendar's Next month button until a month shows. */
async function showMonth(page: Page, month: string) {
  for (let i = 0; i < 24 && !(await page.getByRole('heading', { name: month }).isVisible()); i++) {
    await page.getByRole('button', { name: 'Next month' }).click();
  }
  await expect(page.getByRole('heading', { name: month })).toBeVisible();
}

test.describe('US-16 to US-19: finding and checking a venue (browser)', () => {
  // TC-S2-10 · US-16 AC-1, AC-2, AC-4, AC-6 · setup: base-users + base-venues + tc-s2-10-setup · fails if Venue Staff could not switch views, open a booking's details, or tell blocked time from bookings
  // Code: /venues/calendar (VenueCalendar) -> GET /calendar for the view's window; a pill opens EntryDetail.
  test('US-16: Venue Staff switch views, open a booking, and see blocked time apart from bookings', async ({ page }) => {
    await given('base-users', 'base-venues', 'tc-s2-10-setup');
    await signIn(page, USERS.venueStaff);
    await page.goto('/venues/calendar');

    // AC-2: the three views.
    const views = page.getByRole('tablist', { name: 'Calendar view' });
    for (const view of ['Day', 'Month', 'Week']) {
      await views.getByRole('tab', { name: view }).click();
      await expect(views.getByRole('tab', { name: view })).toHaveAttribute('aria-selected', 'true');
      await expect(page.getByRole('button', { name: /Gala today/ }).first()).toBeVisible();
    }

    // AC-4: a booked slot opens its details.
    await page.getByRole('button', { name: /Gala today/ }).first().click();
    await expect(page.getByRole('heading', { name: 'Gala today' })).toBeVisible();
    await expect(page.getByText('Olivia Organiser')).toBeVisible();
    await page.getByRole('button', { name: 'Close details' }).click();

    // AC-1, AC-6: the blocked period is shown, and opens as blocked, not as a booking.
    await page.getByRole('button', { name: /Maintenance/ }).first().click();
    await expect(page.getByRole('heading', { name: 'Blocked out' })).toBeVisible();
    // Scoped to the page: the entry's hover tooltip also names who blocked it.
    await expect(page.getByRole('main').getByText('Vera Venue')).toBeVisible();
  });

  // TC-S2-11 · US-16 AC-7 · setup: base-users + base-venues + tc-s2-10-setup · fails if the calendar could not be used on a phone-sized screen
  // Code: the calendar page's layout wraps at small widths; the filter panel collapses; the page never scrolls sideways.
  test('US-16: the calendar works on a phone-sized screen', async ({ page }) => {
    await given('base-users', 'base-venues', 'tc-s2-10-setup');
    await page.setViewportSize({ width: 390, height: 844 });
    await signIn(page, USERS.venueStaff);
    await page.goto('/venues/calendar');

    const views = page.getByRole('tablist', { name: 'Calendar view' });
    for (const view of ['Week', 'Month', 'Day']) {
      await views.getByRole('tab', { name: view }).click();
      await expect(page.getByRole('button', { name: /Gala today/ }).first()).toBeVisible();
    }
    await page.getByRole('button', { name: /Gala today/ }).first().click();
    await expect(page.getByRole('heading', { name: 'Gala today' })).toBeVisible();
    const sideways = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(sideways).toBeLessThanOrEqual(0);
  });

  // TC-S2-17 · US-17 AC-1, AC-3, AC-4 · setup: base-users + base-venues + tc-s2-14-setup · fails if booked, tentative and free days were not told apart, or another booking's event showed
  // Code: /coordinator/venues/:id?tab=availability (VenueAvailabilityCalendar) -> GET /venues/:id/availability.
  test('US-17: a Coordinator sees booked, tentative and free days apart, and nothing about the other event', async ({ page }) => {
    await given('base-users', 'base-venues', 'tc-s2-14-setup');
    await signIn(page, USERS.coordinator);
    await page.goto('/coordinator/venues/VEN-002?tab=availability');
    await showMonth(page, 'March 2027');

    await expect(page.getByRole('button', { name: 'Wednesday 10 March: Booked' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Friday 12 March: Tentatively held' })).toBeVisible();
    await expect(page.getByText('Tuesday 16 March: Free')).toBeAttached();
    await expect(page.getByText('Secret Board Offsite')).toHaveCount(0);
    await expect(page.getByText('Olivia Organiser')).toHaveCount(0);
  });

  // TC-S2-185 · US-18 AC-2, AC-6 · setup: base-users + base-venues · fails if the capacity filter did not narrow the results, or no match showed a broken list
  // Code: /coordinator/venues -> VenueFilterPanel -> GET /venues/search; an empty result shows "No venues match your filters".
  test('US-18: a Coordinator filters venues by capacity, and sees a clear message when nothing matches', async ({ page }) => {
    await given('base-users', 'base-venues');
    await signIn(page, USERS.coordinator);
    await page.goto('/coordinator/venues');
    const results = page.getByRole('region', { name: 'Results' });
    await expect(results.getByText('Seminar Room')).toBeVisible();

    await page.getByLabel('Minimum capacity').fill('100');
    await page.getByRole('button', { name: 'Apply filters' }).click();
    await expect(results.getByText('Seminar Room')).toHaveCount(0);
    await expect(results.getByText('Main Hall')).toBeVisible();
    await expect(results.getByText('Rooftop Terrace')).toBeVisible();

    await page.getByLabel('Minimum capacity').fill('5000');
    await page.getByRole('button', { name: 'Apply filters' }).click();
    await expect(page.getByText('No venues match your filters')).toBeVisible();
  });

  // TC-S2-186 · US-19 AC-2, AC-5 · setup: base-users + tc-s2-28-setup + tc-s2-31-setup · fails if a missing requirement was not flagged on screen, or the flag stopped the Coordinator requesting the venue
  // Code: the venue page's Suitability tab -> GET /venues/:id/suitability; "Request this venue" opens the event's
  // booking form with the venue chosen (fixed in this regeneration); POST /bookings accepts it as pending.
  test('US-19: a misfit is flagged, and the Coordinator can still request the venue', async ({ page }) => {
    await given('base-users', 'tc-s2-28-setup', 'tc-s2-31-setup');
    await signIn(page, USERS.coordinator);
    await page.goto('/coordinator/venues/VEN-035?tab=suitability');

    await page.getByLabel('Check against').selectOption('EVT-091');
    await expect(page.getByText('May not be suitable')).toBeVisible();
    await expect(page.getByText('Missing: Hearing loop')).toBeVisible();

    await page.getByRole('link', { name: 'Request this venue' }).click();
    await expect(page).toHaveURL(/\/coordinator\/events\/EVT-091\?venueId=VEN-035/);
    await expect(page.locator('#booking-venue')).toHaveValue('VEN-035');
    await page.getByRole('button', { name: 'Submit booking request' }).click();
    await expect(page.getByText('Booking request submitted — pending Venue Staff approval.')).toBeVisible();
  });
});
