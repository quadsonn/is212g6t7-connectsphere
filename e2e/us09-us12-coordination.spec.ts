import { expect, test, type Page } from '@playwright/test';

import { USERS, signIn, signOut } from './support/auth';
import { given } from './support/db';

/**
 * US-09 to US-12, E2E: clarification through the system (question, answer,
 * notification, audit trail), the Lead assigning the main point of contact,
 * the status following each action, and the Coordinator's full view.
 *
 * Pre-conditions per test (reset the testDB first): test/fixtures/sql/
 * base-users.sql plus tc-s1-01-setup.sql (EVT-146, SUBMITTED, assigned to
 * coord.a), tc-s1-25-setup.sql + tc-s1-84-setup.sql (the Lead, and EVT-164
 * waiting in the unassigned queue) or tc-s1-54-setup.sql (EVT-153, every
 * detail filled in).
 */
const statusOf = (page: Page, name: RegExp) => page.getByRole('row', { name }).locator('td').nth(3);

test.describe('US-09 to US-12: coordinating a request (browser)', () => {
  // TC-S1-15 · US-09 AC-1 to AC-5, US-11 AC-3 · setup: base-users + tc-s1-01-setup · fails if the question form, the status changes, the Coordinator's notification or the dated thread were missing
  // Code: "Request clarification" opens a text field (Submit disabled until it has text) -> POST /events/:id/clarifications;
  // the Organiser's ClarificationPanel -> POST .../responses; the bell reads /notifications/unread-count; ClarificationThread lists sender and time.
  test('US-09: the Coordinator asks in a text field, the Organiser answers, and the Coordinator is notified and sees the dated thread', async ({ page }) => {
    await given('base-users', 'tc-s1-01-setup');
    await signIn(page, USERS.coordinator);
    await page.goto('/coordinator/events/EVT-146');

    // AC-1: a text field for the question.
    await page.getByLabel('Decision').selectOption({ label: 'Request clarification' });
    const question = page.getByLabel(/Clarification question/);
    await expect(question).toBeVisible();
    await expect(page.getByRole('button', { name: 'Submit decision' })).toBeDisabled();
    await question.fill('Will there be a stage?');
    await page.getByRole('button', { name: 'Submit decision' }).click();
    // AC-3: Awaiting clarification, for the Coordinator...
    await expect(page.getByText('Awaiting clarification').first()).toBeVisible();

    await signOut(page);
    await signIn(page, USERS.organiser);
    // ...and for the Organiser (US-11 AC-3: the status followed the action).
    await expect(statusOf(page, /Freshman Orientation 2030/)).toHaveText(/Awaiting clarification/);
    await page.goto('/organiser/EVT-146');
    await expect(page.getByText('Will there be a stage?')).toBeVisible();
    await page.getByLabel('Your response').fill('Yes, a small one');
    await page.getByRole('button', { name: 'Send response' }).click();
    await expect(page.getByText('Yes, a small one')).toBeVisible();

    await signOut(page);
    await signIn(page, USERS.coordinator);
    // AC-4: the Coordinator is notified.
    await expect(page.getByRole('button', { name: /Notifications, 1 unread/ })).toBeVisible();
    // AC-5: the whole exchange, with who and when.
    await page.goto('/coordinator/events/EVT-146');
    await expect(page.getByText('Under review').first()).toBeVisible();
    const thread = page.locator('li').filter({ hasText: 'Will there be a stage?' }).first();
    await expect(thread.locator('time')).toHaveCount(1);
    await expect(page.locator('li').filter({ hasText: 'Yes, a small one' }).first().getByText('Olivia Organiser')).toBeVisible();
  });

  // TC-S1-93 · US-10 AC-1, AC-3 · setup: base-users + tc-s1-25-setup + tc-s1-84-setup · fails if the Lead could not assign a contact on screen, or the Organiser and Coordinator could not see who it is
  // Code: the Lead's queue page posts /assignments/queue/:id/assign; the Organiser's page shows "Assigned coordinator"; the Coordinator's list gains it.
  test('US-10: the Lead assigns a Coordinator, who becomes the contact the Organiser sees', async ({ page }) => {
    await given('base-users', 'tc-s1-25-setup', 'tc-s1-84-setup');
    await signIn(page, USERS.lead);
    await page.goto('/lead/unassigned/EVT-164');

    await page.getByLabel('Coordinator').selectOption('USR-004'); // Cody Coordinator
    await page.getByRole('button', { name: 'Assign' }).click();
    await expect(page.getByText(/Assigned to Cody Coordinator/)).toBeVisible();

    await signOut(page);
    await signIn(page, USERS.organiser);
    await page.goto('/organiser/EVT-164');
    await expect(page.getByText('Cody Coordinator (coord.a@example.com)')).toBeVisible();

    await signOut(page);
    await signIn(page, USERS.coordinator);
    await expect(page.getByText('Waiting for the Lead')).toBeVisible();
  });

  // TC-S1-94 · US-12 AC-1, AC-2 · setup: base-users + tc-s1-54-setup · fails if the review page left out a core detail, the venue or accessibility needs, the equipment needs or the registration setting
  // Code: /coordinator/events/:id renders the whole of GET /events/assigned/:id, including equipmentNeeds and registrationEnabled.
  test('US-12: the assigned Coordinator sees every detail of the request, including equipment and registration', async ({ page }) => {
    await given('base-users', 'tc-s1-54-setup');
    await signIn(page, USERS.coordinator);
    await page.goto('/coordinator/events/EVT-153');

    for (const text of [
      'Freshman Orientation 2030',
      'Welcome new students and introduce campus services',
      'Full-day programme with talks, booths and a closing social',
      '320',
      'Theatre',
      'Step-free access',
      'Ramp access to the stage',
      'Six wireless microphones, two projectors',
      'Open to attendees',
    ]) {
      await expect(page.getByText(text, { exact: false }).first()).toBeVisible();
    }
    await expect(page.getByText(/1 Oct 2030/).first()).toBeVisible();
  });
});
