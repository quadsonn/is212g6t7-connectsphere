import { expect, test, type Page } from '@playwright/test';

import { USERS, signIn, signOut } from './support/auth';
import { given } from './support/db';

/**
 * US-13 to US-15, E2E: Venue Staff add a venue as a draft and publish it,
 * edit a venue that has a booking and are warned, and browse, look up and sort
 * the catalogue; Coordinators see only what is published, as last saved.
 *
 * Pre-conditions per test (reset the testDB first): test/fixtures/sql/
 * base-users.sql, plus base-venues.sql (Main Hall, Seminar Room, Rooftop
 * Terrace and the draft Annex, all managed by venue.staff) and, for US-14,
 * tc-s1-105-setup.sql (an upcoming booking on Main Hall).
 */
const row = (page: Page, name: string) => page.getByRole('row', { name: new RegExp(name) });
const venueNames = (page: Page) => page.locator('tbody tr td:nth-child(2) > span:first-child');

test.describe('US-13 to US-15: venues (browser)', () => {
  // TC-S1-102 · US-13 AC-1 to AC-6 · setup: base-users · fails if a Venue Staff member could not save an incomplete venue, publish it early, tell draft from published, or the Coordinator saw the draft or missed the published venue
  // Code: /venues/new (VenueDraftForm) -> POST /venues/drafts, PATCH /venues/:id, POST /venues/:id/publish;
  // the catalogue's State badge; the Coordinator's /coordinator/venues lists published venues only.
  test('US-13: Venue Staff save a draft, publish it once complete, and only then the Coordinator sees it', async ({ page }) => {
    await given('base-users');
    await signIn(page, USERS.venueStaff);
    await expect(page).toHaveURL(/\/venues$/);

    // AC-2: an incomplete venue is saved as a draft.
    await page.getByRole('button', { name: '+ Add venue' }).click();
    await page.getByLabel(/Venue name/).fill('Sandbox Auditorium');
    // AC-3: Publish is refused until name, location and capacity are in.
    await expect(page.getByRole('button', { name: 'Publish to catalogue' })).toBeDisabled();
    await page.getByRole('button', { name: 'Save draft' }).click();
    await expect(page.getByRole('status')).toHaveText('Draft saved.');
    await page.getByRole('button', { name: 'Back to venue catalogue' }).last().click();
    // AC-6: the catalogue marks it as a draft.
    await expect(row(page, 'Sandbox Auditorium')).toContainText('Draft');

    // AC-4: the Coordinator does not see the draft.
    await signOut(page);
    await signIn(page, USERS.coordinator);
    await page.goto('/coordinator/venues');
    await expect(page.getByText('No venues published yet')).toBeVisible();

    // AC-1: the rest of the details, then publish.
    await signOut(page);
    await signIn(page, USERS.venueStaff);
    await row(page, 'Sandbox Auditorium').getByRole('button', { name: 'Edit' }).click();
    await page.getByLabel(/Location/).fill('School of Computing, Level 1');
    await page.getByLabel(/Capacity/).fill('420');
    await page.getByRole('group', { name: 'Facilities' }).getByRole('button', { name: 'Projector' }).click();
    await page.getByRole('group', { name: 'Accessibility features' }).getByRole('button', { name: 'Step-free access' }).click();
    await page.getByRole('group', { name: 'Supported layouts' }).getByRole('button', { name: 'Theatre' }).click();
    await page.getByLabel(/Operating hours/).selectOption('08:00');
    await page.locator('#venue-operating-end').selectOption('22:00');
    await page.getByRole('button', { name: 'Publish to catalogue' }).click();
    await expect(page).toHaveURL(/\/venues$/);
    await expect(row(page, 'Sandbox Auditorium')).toContainText('Published');

    // AC-5: on the Coordinator's next load it is in the catalogue.
    await signOut(page);
    await signIn(page, USERS.coordinator);
    await page.goto('/coordinator/venues');
    await expect(page.getByText('Sandbox Auditorium')).toBeVisible();
    await expect(page.getByText(/School of Computing, Level 1 · 420 seats/)).toBeVisible();
  });

  // TC-S1-107 · US-14 AC-1 to AC-4 · setup: base-users + base-venues + tc-s1-105-setup · fails if an edit was not saved and shown to the Coordinator, the booking warning or notification was missing, or a blanked name was saved
  // Code: /venues/:id/edit -> PATCH /venues/:id; the form shows the returned warning; the bell counts the
  // VENUE_CHANGED_BOOKINGS_AFFECTED notification; a blank name on a published venue is refused (400).
  test('US-14: Venue Staff edit a booked venue, are warned, cannot blank the name, and the Coordinator sees the change', async ({ page }) => {
    await given('base-users', 'base-venues', 'tc-s1-105-setup');
    await signIn(page, USERS.venueStaff);

    // AC-1: open an existing venue and change a detail.
    await row(page, 'Main Hall').getByRole('button', { name: 'Edit' }).click();
    await expect(page.getByLabel(/Venue name/)).toHaveValue('Main Hall');
    await page.getByLabel(/Capacity/).fill('100');
    await page.getByRole('button', { name: 'Save changes' }).click();
    await expect(page.getByRole('status')).toHaveText('Changes saved.');

    // AC-3: Main Hall has an upcoming booking, so the reduction is flagged on screen and in the inbox.
    const warning = page.getByRole('alert').filter({ hasText: 'Existing bookings may need review' });
    await expect(warning).toContainText('capacity reduced from 300 to 100');
    await expect(page.getByRole('button', { name: /Notifications, 1 unread/ })).toBeVisible();

    // AC-4: a cleared name is refused, and the stored name is unchanged.
    await page.getByLabel(/Venue name/).fill('');
    await page.getByRole('button', { name: 'Save changes' }).click();
    await expect(page.locator('#venue-name-error')).toContainText(/name is required/i);
    await page.reload();
    await expect(page.getByLabel(/Venue name/)).toHaveValue('Main Hall');

    // AC-2: the Coordinator's next load shows the new capacity.
    await signOut(page);
    await signIn(page, USERS.coordinator);
    await page.goto('/coordinator/venues');
    await expect(page.getByText(/Block A, Level 1 · 100 seats/)).toBeVisible();
  });

  // TC-S1-111 · US-15 AC-1 to AC-3 · setup: base-users + base-venues · fails if the catalogue lacked a venue or its key details, could not look one up or sort, or opening a venue did not show its details
  // Code: /venues (VenueDashboard) -> GET /venues?search=&sortBy=&sortOrder=; Edit opens /venues/:id/edit.
  test('US-15: Venue Staff see every venue at a glance, look one up, sort, and open one for its full details', async ({ page }) => {
    await given('base-users', 'base-venues');
    await signIn(page, USERS.venueStaff);

    // AC-1: every venue, with name, location and capacity.
    await expect(page.locator('tbody tr')).toHaveCount(4);
    await expect(row(page, 'Main Hall')).toContainText('Block A, Level 1');
    await expect(row(page, 'Main Hall')).toContainText('300');
    await expect(row(page, 'Seminar Room')).toContainText('Block B, Level 3');

    // AC-3: look one up by name...
    const search = page.getByRole('searchbox', { name: 'Search venues by name' });
    await search.fill('hall');
    await expect(venueNames(page)).toHaveText(['Main Hall']);
    await search.fill('');
    // ...or sort (the manager's draft is listed first).
    await page.getByLabel('Sort venues by').selectOption('capacity');
    await expect(venueNames(page)).toHaveText(['Annex (draft)', 'Seminar Room', 'Rooftop Terrace', 'Main Hall']);
    await page.getByRole('button', { name: /click to sort descending/ }).click();
    await expect(venueNames(page)).toHaveText(['Annex (draft)', 'Main Hall', 'Rooftop Terrace', 'Seminar Room']);

    // AC-2: selecting a venue shows its facilities, accessibility, layouts and hours.
    await row(page, 'Main Hall').getByRole('button', { name: 'Edit' }).click();
    const pressed = (group: string) => page.getByRole('group', { name: group }).getByRole('button', { pressed: true });
    await expect(pressed('Facilities')).toHaveText(['Projector', 'Sound system', 'Stage']);
    await expect(pressed('Accessibility features')).toHaveCount(2);
    await expect(pressed('Supported layouts')).toHaveText(['Theatre', 'Banquet']);
    await expect(page.getByLabel(/Operating hours/)).toHaveValue('08:00');
    await expect(page.locator('#venue-operating-end')).toHaveValue('22:00');
  });
});
