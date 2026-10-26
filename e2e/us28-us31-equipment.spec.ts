import { expect, test } from '@playwright/test';

import { USERS, signIn } from './support/auth';
import { given } from './support/db';

/**
 * US-28 to US-31, E2E: Technical Support browse and look up the equipment
 * catalogue and open an item; check several types for one date and time;
 * read the events that have requirements and open one; and commit equipment
 * to an event, after which the same units can't be committed to an
 * overlapping one.
 *
 * Pre-conditions per test (reset the testDB first): test/fixtures/sql/
 * base-users.sql plus the scripts each test names.
 */
test.describe('US-28 to US-31: Technical Support and equipment (browser)', () => {
  // TC-S2-102 · US-28 AC-1, AC-2, AC-3 · setup: base-users + tc-s2-97-setup · fails if the catalogue lacked an item's details, the lookup didn't narrow it, or an item couldn't be opened with its status
  // Code: /equipment/inventory (EquipmentCatalogue) -> GET /equipment?search=; the type links to
  // /equipment/inventory/:id (EquipmentDetail) -> GET /equipment/:id.
  test('Technical Support look up an item in the catalogue and open it', async ({ page }) => {
    await given('base-users', 'tc-s2-97-setup');
    await signIn(page, USERS.techSupport);
    await page.goto('/equipment/inventory');

    // AC-1: every item, with its details at a glance.
    await expect(page.getByRole('row', { name: /Wireless microphone Handheld UHF mic\. 24 AV Store, Level 1/ })).toBeVisible();
    await expect(page.getByRole('row', { name: /Folding table — 40 —/ })).toBeVisible();

    // AC-3: lookup by type.
    await page.getByLabel('Look up equipment by type').fill('proj');
    await expect(page.getByRole('link', { name: 'Wireless microphone' })).toHaveCount(0);

    // AC-2: open it; its operational status is shown.
    await page.getByRole('link', { name: 'Projector (4K)' }).click();
    await expect(page).toHaveURL(/\/equipment\/inventory\/EQP-007$/);
    await expect(page.getByText('Under maintenance').first()).toBeVisible();
    await expect(page.getByText('Ceiling-mountable.')).toBeVisible();
  });

  // TC-S2-113 · US-29 AC-1, AC-2, AC-4, AC-5 · setup: base-users + tc-s2-103-setup + tc-s2-106-setup · fails if two types couldn't be checked for one window, units reserved elsewhere weren't excluded, or the shortfall wasn't shown
  // Code: /equipment/availability (EquipmentAvailability) -> one GET /equipment/:id/availability per row.
  test('Technical Support check two types for one date and time, and see the shortfall', async ({ page }) => {
    await given('base-users', 'tc-s2-103-setup', 'tc-s2-106-setup');
    await signIn(page, USERS.techSupport);
    const window = new URLSearchParams({
      start: '2030-10-01T09:00:00.000Z',
      end: '2030-10-01T17:00:00.000Z',
      equipmentId: 'EQP-004',
      quantity: '12',
    });
    await page.goto(`/equipment/availability?${window}`);

    await page.getByRole('button', { name: 'Add another equipment type' }).click();
    await page.getByLabel('Equipment type 2', { exact: true }).selectOption({ label: 'Portable PA system' });
    await page.getByLabel('Quantity for equipment type 2').fill('4');
    await page.getByRole('button', { name: 'Check availability' }).click();

    await expect(page.getByText('1 of 2 requested types are not fully available.')).toBeVisible();
    // 24 microphones, 10 committed at an overlapping time: 14 free for 12 wanted.
    await expect(page.getByRole('row', { name: /^Wireless microphone 12 14 None 10 0 24 Available$/ })).toBeVisible();
    // 6 PA systems, 4 committed: 2 free for 4 wanted, 2 short.
    await expect(page.getByRole('row', { name: /^Portable PA system 4 2 2 short 4 0 6 Short by 2$/ })).toBeVisible();
  });

  // TC-S2-120 · US-30 AC-1, AC-2, AC-3, AC-4 · setup: base-users + tc-s2-114-setup · fails if the list showed a draft or an event with nothing recorded, or an event's page didn't show what was asked for
  // Code: /equipment (EquipmentDashboard) -> GET /equipment/requirements; /equipment/requirements/:eventId
  // (RequirementsView) -> GET /equipment/requirements/:eventId.
  test('Technical Support see only events with requirements, and what each asks for', async ({ page }) => {
    await given('base-users', 'tc-s2-114-setup');
    await signIn(page, USERS.techSupport);
    await page.goto('/equipment');

    for (const name of ['Organiser Only', 'Rows Only', 'Notes Only', 'All Three']) {
      await expect(page.getByRole('button', { name: new RegExp(name) })).toBeVisible();
    }
    await expect(page.getByText('None Recorded')).toHaveCount(0);
    await expect(page.getByText('Draft With Everything')).toHaveCount(0);

    await page.getByRole('button', { name: /All Three/ }).click();
    await expect(page.getByText('Mics and a projector.')).toBeVisible();
    await expect(page.getByRole('row', { name: /PA system 1/ })).toBeVisible();
    await expect(page.getByText('Technician on call.')).toBeVisible();

    // AC-3: an event with nothing recorded says so when opened.
    await page.goto('/equipment/requirements/EVT-118');
    await expect(page.getByRole('note')).toHaveText('No equipment or technical requirements have been recorded for this event.');
  });

  // TC-S2-121 · US-31 AC-1, AC-2, AC-3 · setup: base-users + tc-s2-122-setup · fails if equipment couldn't be committed from the event, or the same units could be committed to an overlapping event without the reason shown
  // Code: CommitForm on /equipment/requirements/:eventId -> POST /equipment/reservations; a 409 shows the server's reason.
  test('Technical Support commit equipment to an event, and an overlapping event cannot take the same units', async ({ page }) => {
    await given('base-users', 'tc-s2-122-setup');
    await signIn(page, USERS.techSupport);

    // AC-1: 8 of the 10 microphones for Capstone Showcase.
    await page.goto('/equipment/requirements/EVT-060');
    await page.getByLabel(/Equipment item/).selectOption({ label: 'Wireless microphone — AV Store' });
    await page.getByLabel(/Quantity/).fill('8');
    await page.getByRole('button', { name: 'Commit to this event' }).click();
    await expect(page.getByRole('status')).toContainText('Committed 8 × Wireless microphone');

    // AC-2, AC-3: Industry Night overlaps it, so only 2 are left; asking for 3 is refused with the counts.
    await page.goto('/equipment/requirements/EVT-082');
    await page.getByLabel(/Equipment item/).selectOption({ label: 'Wireless microphone — AV Store' });
    await page.getByLabel(/Quantity/).fill('3');
    await page.getByRole('button', { name: 'Commit to this event' }).click();
    await expect(page.getByText(/Only 2 of the 3 Wireless microphone requested are free/)).toBeVisible();
    await expect(page.getByRole('status')).toHaveCount(0);
  });
});
