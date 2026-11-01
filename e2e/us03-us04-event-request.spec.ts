import { expect, test, type Page } from '@playwright/test';

import { USERS, signIn } from './support/auth';
import { given, prisma } from './support/db';

/**
 * US-03 (Submit a new event request) and US-04 (Save an incomplete request
 * as a draft), E2E: an Organiser fills in the real form in Chromium, and the
 * request lands in the local test database.
 *
 * Pre-condition for every test: reset the testDB, then run
 * test/fixtures/sql/base-users.sql.
 */

/** Picks the 15th of next month in a DatePicker (the start picker opens on today). */
async function pickDay(page: Page, label: 'Start date' | 'End date', nextMonth: boolean) {
  await page.getByRole('button', { name: new RegExp(`^${label}:`) }).click();
  const dialog = page.getByRole('dialog', { name: `Choose ${label.toLowerCase()}` });
  if (nextMonth) await dialog.getByRole('button', { name: 'Next month' }).click();
  await dialog.getByRole('button', { name: /\b15 / }).click();
}

/** Fills every field submission requires (the name only when asked). */
async function fillRequired(page: Page, { name }: { name?: string }) {
  if (name) await page.getByLabel(/Event name/).fill(name);
  await page.getByLabel(/Category/).fill('Student engagement');
  await page.getByLabel(/Purpose/).fill('Welcome new students');
  await page.getByLabel(/Description/).fill('Talks, booths and a closing social');
  await pickDay(page, 'Start date', true);
  await page.getByLabel('Start time').selectOption('09:00');
  // The end picker opens on the chosen start month.
  await pickDay(page, 'End date', false);
  await page.getByLabel('End time').selectOption('17:00');
  await page.getByLabel(/Expected attendance/).selectOption({ label: '200 – 499' });
}

test.describe('US-03 and US-04: raising an event request (browser)', () => {
  test.beforeEach(async () => {
    await given('base-users');
  });

  // TC-S1-76 · US-03 AC-3 · setup: base-users · fails if an empty form was accepted, or the missing fields were not flagged on screen
  // Code: POST /events answers 400 with one message per field; OrganiserNewRequest shows each under its input.
  test('US-03 AC-3: submitting an empty form is blocked and each missing field is flagged', async ({ page }) => {
    await signIn(page, USERS.organiser);
    await page.goto('/organiser/new');

    await page.getByRole('button', { name: 'Submit for review' }).click();

    await expect(page.getByText('Please correct the highlighted fields.')).toBeVisible();
    await expect(page.getByText('Please enter an event name.')).toBeVisible();
    await expect(page.getByText('Please select or enter a category.')).toBeVisible();
    await expect(page.getByLabel(/Event name/)).toHaveAttribute('aria-invalid', 'true');
    expect(await prisma.eventRequest.count()).toBe(0);
  });

  // TC-S1-76 · US-03 AC-1/AC-2/AC-4 · setup: base-users · fails if a complete request was not submitted, confirmed and listed as Submitted
  // Code: createAndSubmit() saves it SUBMITTED; the form confirms with a toast and the list shows its status badge.
  test('US-03 AC-1/AC-2: a complete request is submitted, confirmed on screen and listed as Submitted', async ({ page }) => {
    await signIn(page, USERS.organiser);
    await page.goto('/organiser/new');

    await fillRequired(page, { name: 'Freshman Orientation' });
    await page.getByRole('button', { name: 'Submit for review' }).click();

    await expect(page.getByText('Request submitted for review.')).toBeVisible();
    await expect(page).toHaveURL(/\/organiser$/);
    const row = page.getByRole('row', { name: /Freshman Orientation/ });
    await expect(row.getByText('Submitted')).toBeVisible();

    const saved = await prisma.eventRequest.findFirstOrThrow({ where: { name: 'Freshman Orientation' } });
    expect(saved).toMatchObject({ status: 'SUBMITTED', organiserId: 'USR-006', coordinatorId: null, expectedAttendance: 499 });
  });

  // TC-S1-77 · US-04 AC-1/AC-3/AC-4 · setup: base-users · fails if a half-filled draft could not be saved, looked like a submitted request, or could not be completed and submitted later
  // Code: "Save as draft" -> POST /events/drafts (DRAFT); the edit page PATCHes then POSTs /events/:id/submit (SUBMITTED).
  test('US-04: a half-filled draft is saved, shown as Draft, then completed and submitted', async ({ page }) => {
    await signIn(page, USERS.organiser);
    await page.goto('/organiser/new');

    await page.getByLabel(/Event name/).fill('Half-planned social');
    await page.getByRole('button', { name: 'Save as draft' }).click();

    await expect(page.getByText('Draft saved.')).toBeVisible();
    const draftRow = page.getByRole('row', { name: /Half-planned social/ });
    await expect(draftRow.getByText('Draft')).toBeVisible();

    const draft = await prisma.eventRequest.findFirstOrThrow({ where: { name: 'Half-planned social' } });
    expect(draft.status).toBe('DRAFT');

    // AC-2: come back later and finish it.
    await page.goto(`/organiser/${draft.id}/edit`);
    await expect(page.getByLabel(/Event name/)).toHaveValue('Half-planned social');
    await fillRequired(page, {});
    await page.getByRole('button', { name: 'Submit for review' }).click();

    await expect(page.getByText('Request submitted for review.')).toBeVisible();
    expect((await prisma.eventRequest.findUniqueOrThrow({ where: { id: draft.id } })).status).toBe('SUBMITTED');
  });
});
