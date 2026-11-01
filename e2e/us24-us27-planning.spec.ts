import { expect, test } from '@playwright/test';

import { USERS, signIn, signOut } from './support/auth';
import { given } from './support/db';

/**
 * US-24 to US-27, E2E: a Coordinator edits an event in planning, and a change
 * to a confirmed booking is flagged and kept in the change history, where Venue
 * Staff see the new value; the Lead reassigns the event to another Coordinator,
 * who gets it with the handover in its history while the previous one is told;
 * a Coordinator records equipment and support needs, and Technical Support see
 * them.
 *
 * Pre-conditions per test (reset the testDB first): test/fixtures/sql/
 * base-users.sql plus the scripts each test names.
 */
test.describe('US-24 to US-27: planning an event (browser)', () => {
  // TC-S2-71 · US-24 AC-1, AC-2, AC-3, US-25 AC-1, AC-2 · setup: base-users + base-venues + tc-s2-68-setup + tc-s2-71-setup · fails if an edit to an event with a confirmed booking was not saved, flagged and recorded, or Venue Staff saw the old value
  // Code: /coordinator/events/:id "Edit details" (PlanningEditForm) -> PATCH /events/:id/planning; ChangeHistory ->
  // GET /events/:id/history; /venues/events/:id (RelatedEventDetail) -> GET /events/:id.
  test('an attendance change to an event with a confirmed booking is flagged, recorded, and seen by Venue Staff', async ({ page }) => {
    await given('base-users', 'base-venues', 'tc-s2-68-setup', 'tc-s2-71-setup');
    await signIn(page, USERS.coordinator);
    await page.goto('/coordinator/events/EVT-105');

    // US-25 AC-3: nothing changed yet.
    await expect(page.getByText('No changes have been recorded for this event since it was created.')).toBeVisible();

    // US-24 AC-1, AC-2: the edit is saved, and flagged because the Main Hall booking is approved.
    await page.getByRole('button', { name: 'Edit details' }).click();
    await page.locator('#plan-attendance').selectOption('500');
    await page.getByRole('button', { name: 'Save changes' }).click();
    await expect(page.getByRole('status').filter({ hasText: 'flagged for review' })).toContainText('Confirmed venue booking');

    // US-25 AC-1, AC-2: the history has the change, its before and after, and the flag.
    await expect(page.getByRole('row', { name: /Expected attendance 320 500/ })).toBeVisible();
    await expect(page.getByText('Requires review')).toBeVisible();
    await expect(page.getByText(/Cody Coordinator \(Event Coordinator\)/)).toBeVisible();

    // US-24 AC-3: Venue Staff, whose venue is booked, see the saved value.
    await signOut(page);
    await signIn(page, USERS.venueStaff);
    await page.goto('/venues/events/EVT-105');
    await expect(page.getByText('500 or more').first()).toBeVisible();
  });

  // TC-S2-85 · US-26 AC-1, AC-2, AC-3, AC-4 · setup: base-users + tc-s1-25-setup + tc-s2-83-setup · fails if the Lead could not hand the event to another Coordinator, the new one did not get it with the handover in its history, or the previous one was not told
  // Code: /lead/assignments (ReassignControl) -> POST /assignments/events/:id/reassign; the new Coordinator's
  // /coordinator list and ChangeHistory; the previous Coordinator's /notifications.
  test('the Lead reassigns an event; the new Coordinator has it and its history, the previous one is told', async ({ page }) => {
    await given('base-users', 'tc-s1-25-setup', 'tc-s2-83-setup');

    // AC-1, AC-2: the Lead picks a different Coordinator and confirms.
    await signIn(page, USERS.lead);
    await page.goto('/lead/assignments');
    const row = page.getByRole('listitem').filter({ hasText: 'Freshman Orientation 2030' });
    await row.getByRole('button', { name: 'Reassign' }).click();
    await row.getByLabel('Reassign to').selectOption({ label: 'Casey Coordinator' });
    await row.getByRole('button', { name: 'Confirm' }).click();
    await expect(page.getByRole('status')).toContainText('moved from Cody Coordinator to Casey Coordinator. Both have been notified.');

    // AC-2, AC-4: the new Coordinator has the event, and its history records the handover.
    await signOut(page);
    await signIn(page, 'coord.b@example.com');
    await page.goto('/coordinator');
    await expect(page.getByRole('main').getByText('Freshman Orientation 2030')).toBeVisible();
    await page.goto('/coordinator/events/EVT-107');
    await expect(page.getByRole('row', { name: 'Coordinator Cody Coordinator Casey Coordinator' })).toBeVisible();

    // AC-3: the previous Coordinator is told.
    await signOut(page);
    await signIn(page, USERS.coordinator);
    await page.goto('/notifications');
    await expect(page.getByText('"Freshman Orientation 2030" has been reassigned from you to Casey Coordinator.')).toBeVisible();
  });

  // TC-S2-93 · US-27 AC-1, AC-2, AC-3 · setup: base-users + tc-s2-68-setup · fails if the Coordinator could not record equipment and support needs, or Technical Support did not see them
  // Code: TechnicalRequirementsCard -> PATCH /events/:id/technical-requirements; /equipment/requirements/:eventId
  // (RequirementsView) -> GET /equipment/requirements/:eventId.
  test('a Coordinator records equipment and support needs, and Technical Support see them', async ({ page }) => {
    await given('base-users', 'tc-s2-68-setup');
    await signIn(page, USERS.coordinator);
    await page.goto('/coordinator/events/EVT-105');

    await page.getByRole('button', { name: 'Edit requirements' }).click();
    await page.getByRole('button', { name: 'Add item' }).click();
    await page.getByLabel('Equipment item, row 1').selectOption({ label: 'Other (not in catalogue)…' });
    await page.getByLabel('Equipment type, row 1').fill('Laser projector');
    await page.getByLabel('Quantity, row 1').fill('2');
    await page.getByLabel(/Technical support needed/).fill('Hybrid setup with Zoom');
    await page.getByRole('button', { name: 'Save requirements' }).click();
    await expect(page.getByText('Requirements saved. Technical Support can now see them on this event.')).toBeVisible();

    await signOut(page);
    await signIn(page, USERS.techSupport);
    await page.goto('/equipment/requirements/EVT-105');
    await expect(page.getByText(/Laser projector/).first()).toBeVisible();
    await expect(page.getByText('Hybrid setup with Zoom')).toBeVisible();
  });
});
