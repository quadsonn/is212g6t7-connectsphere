import { expect, test, type Page } from '@playwright/test';

import { USERS, signIn, signOut } from './support/auth';
import { given, prisma } from './support/db';

/**
 * US-05 to US-08, E2E: the Coordinator reviews a request on the real review
 * page (approve, reject, return, ask), the Organiser sees the outcome on
 * theirs, and layout/accessibility preferences travel between the two.
 *
 * Pre-conditions per test (reset the testDB first): test/fixtures/sql/
 * base-users.sql plus tc-s1-01-setup.sql (EVT-146, SUBMITTED, assigned to
 * coord.a) or tc-s1-54-setup.sql (EVT-153, with layout and accessibility).
 */
const REQUEST = 'EVT-146';

/** Picks a decision on the Coordinator's review card and, if needed, types its text. */
async function decide(page: Page, decision: string, text?: string) {
  await page.getByLabel('Decision').selectOption({ label: decision });
  const submit = page.getByRole('button', { name: 'Submit decision' });
  if (text !== undefined) {
    // US-08 AC-2: confirmation is blocked until a reason is entered.
    await expect(submit).toBeDisabled();
    await page.locator('#review-decision-note').fill(text);
  }
  await expect(submit).toBeEnabled();
  await submit.click();
}

test.describe('US-05 to US-08: reviewing a request (browser)', () => {
  // TC-S1-82 · US-07 AC-1/AC-2/AC-3, US-05 AC-4 · setup: base-users + tc-s1-01-setup · fails if the Coordinator could not see the request's status and details, or approving did not show Approved to both
  // Code: /coordinator/events/:id reads GET /events/assigned/:id; "Approve" calls POST /events/:id/approve (setStatus APPROVED).
  test('US-07: the assigned Coordinator sees the status and details, approves, and the Organiser sees Approved', async ({ page }) => {
    await given('base-users', 'tc-s1-01-setup');
    await signIn(page, USERS.coordinator);
    await page.goto(`/coordinator/events/${REQUEST}`);

    await expect(page.getByRole('heading', { name: 'Freshman Orientation 2030' })).toBeVisible();
    await expect(page.getByText('Submitted').first()).toBeVisible();
    await expect(page.getByText('Welcome new students')).toBeVisible();
    await expect(page.getByText('Full-day programme with talks and booths')).toBeVisible();

    await decide(page, 'Approve');

    await expect(page.getByText('Approved').first()).toBeVisible();
    expect((await prisma.eventRequest.findUniqueOrThrow({ where: { id: REQUEST } })).status).toBe('APPROVED');

    await signOut(page);
    await signIn(page, USERS.organiser);
    await expect(page.getByRole('row', { name: /Freshman Orientation 2030/ }).getByText('Approved')).toBeVisible();
  });

  // TC-S1-83 · US-08 AC-1/AC-2/AC-3/AC-4, US-05 AC-2 · setup: base-users + tc-s1-01-setup · fails if Reject could be confirmed without a reason, or the Organiser did not see the reason
  // Code: the Submit button stays disabled until the reason has text; POST /events/:id/reject stores REJECTED + decisionReason, shown on the Organiser's page.
  test('US-08: Reject needs a reason before it can be confirmed, and the Organiser then sees the reason', async ({ page }) => {
    await given('base-users', 'tc-s1-01-setup');
    await signIn(page, USERS.coordinator);
    await page.goto(`/coordinator/events/${REQUEST}`);

    await decide(page, 'Reject', 'Clashes with the exam period');

    await expect(page.getByText('Rejected').first()).toBeVisible();
    await signOut(page);
    await signIn(page, USERS.organiser);
    await page.goto(`/organiser/${REQUEST}`);
    await expect(page.getByText('Rejected: Clashes with the exam period')).toBeVisible();
  });

  // TC-S1-83 · US-08 AC-1/AC-3/AC-4 · setup: base-users + tc-s1-01-setup · fails if Return behaved like Reject, or the Organiser could not see why or amend it
  // Code: POST /events/:id/return stores RETURNED + clarificationRequest; RETURNED stays editable for the Organiser.
  test('US-08: Return for changes is a separate action; the Organiser sees why and can amend the request', async ({ page }) => {
    await given('base-users', 'tc-s1-01-setup');
    await signIn(page, USERS.coordinator);
    await page.goto(`/coordinator/events/${REQUEST}`);

    await decide(page, 'Return for changes', 'Please add the programme');

    await expect(page.getByText('Returned').first()).toBeVisible();
    expect((await prisma.eventRequest.findUniqueOrThrow({ where: { id: REQUEST } })).status).toBe('RETURNED');

    await signOut(page);
    await signIn(page, USERS.organiser);
    await page.goto(`/organiser/${REQUEST}`);
    await expect(page.getByText('Please add the programme')).toBeVisible();
    await page.goto(`/organiser/${REQUEST}/edit`);
    await expect(page.getByRole('button', { name: 'Submit for review' })).toBeVisible();
  });

  // TC-S1-80 · US-05 AC-3 · setup: base-users + tc-s1-01-setup · fails if the Organiser could not see that clarification is needed, or what was asked
  // Code: "Request clarification" -> POST /events/:id/clarifications (AWAITING_CLARIFICATION); the Organiser's page shows the status and the question.
  test('US-05: after the Coordinator asks a question, the Organiser sees clarification is needed and what is asked', async ({ page }) => {
    await given('base-users', 'tc-s1-01-setup');
    await signIn(page, USERS.coordinator);
    await page.goto(`/coordinator/events/${REQUEST}`);

    await decide(page, 'Request clarification', 'How many speakers will there be?');

    await signOut(page);
    await signIn(page, USERS.organiser);
    await expect(page.getByRole('row', { name: /Freshman Orientation 2030/ }).getByText('Awaiting clarification')).toBeVisible();
    await page.goto(`/organiser/${REQUEST}`);
    await expect(page.getByText('How many speakers will there be?')).toBeVisible();
  });

  // TC-S1-81 · US-06 AC-6 · setup: base-users + tc-s1-54-setup · fails if the assigned Coordinator's review page hid the layout or accessibility the Organiser entered
  // Code: /coordinator/events/:id shows preferredLayout, layoutNotes, each accessibility requirement and its notes.
  test('US-06: the assigned Coordinator sees the layout and accessibility the Organiser entered', async ({ page }) => {
    await given('base-users', 'tc-s1-54-setup');
    await signIn(page, USERS.coordinator);
    await page.goto('/coordinator/events/EVT-153');

    await expect(page.getByText('Theatre').first()).toBeVisible();
    await expect(page.getByText('Centre aisle, front row reserved')).toBeVisible();
    await expect(page.getByText('Step-free access').first()).toBeVisible();
    await expect(page.getByText('Hearing loop').first()).toBeVisible();
    await expect(page.getByText('Ramp access to the stage')).toBeVisible();
  });

  // TC-S1-81 · US-06 AC-1/AC-3/AC-4 · setup: base-users · fails if several accessibility requirements could not be chosen, or reopening the draft lost any
  // Code: the accessibility ChipGroup sends the whole list; mapExistingToForm() reloads every stored requirement.
  test('US-06: an Organiser picks a layout and two accessibility needs, and both are still selected when the draft is reopened', async ({ page }) => {
    await given('base-users');
    await signIn(page, USERS.organiser);
    await page.goto('/organiser/new');

    await page.getByLabel(/Event name/).fill('Accessible social');
    await page.getByLabel('Preferred layout').selectOption({ label: 'Banquet' });
    const needs = page.getByRole('group', { name: 'Accessibility requirements' });
    await needs.getByRole('button', { name: 'Step-free access' }).click();
    await needs.getByRole('button', { name: 'Hearing loop' }).click();
    await page.getByRole('button', { name: 'Save as draft' }).click();
    await expect(page.getByText('Draft saved.')).toBeVisible();

    const draft = await prisma.eventRequest.findFirstOrThrow({ where: { name: 'Accessible social' } });
    expect(draft.accessibilityRequirements).toEqual(['STEP_FREE_ACCESS', 'HEARING_LOOP']);

    await page.goto(`/organiser/${draft.id}/edit`);
    await expect(page.getByLabel('Preferred layout')).toHaveValue('BANQUET');
    await expect(needs.getByRole('button', { name: 'Step-free access' })).toHaveAttribute('aria-pressed', 'true');
    await expect(needs.getByRole('button', { name: 'Hearing loop' })).toHaveAttribute('aria-pressed', 'true');
  });
});
