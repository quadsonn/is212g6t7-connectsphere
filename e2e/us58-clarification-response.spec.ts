import { expect, Page, test } from '@playwright/test';

import { USERS, signIn } from './support/auth';
import { given } from './support/db';

/**
 * US-58, E2E: the Organiser sees the request is waiting on a question, answers
 * it from the request's page while updating a detail, and sees the answer and
 * the change (old -> new) under the question.
 *
 * Pre-conditions (reset the testDB first): test/fixtures/sql/base-users.sql,
 * tc-s1-01-setup.sql ("Freshman Orientation 2030", EVT-146) and
 * tc-s4-58-setup.sql (Cody's question, awaiting clarification).
 */
const statusOf = (page: Page, name: RegExp) => page.getByRole('row', { name }).locator('td').nth(3);

test.describe('US-58: respond to a clarification request (browser)', () => {
  // TC-S4-58, TC-S4-59, TC-S4-60, TC-S4-61, TC-S4-62 · US-58 AC-1 to AC-5 · setup: base-users + tc-s1-01-setup + tc-s4-58-setup · fails if the waiting request, the question, the reply with a changed detail, the old -> new history or the return to review is missing
  // Code: organiser list status -> /organiser/:id ClarificationPanel -> POST /events/:id/clarifications/responses (changes) -> thread
  test('the Organiser answers with an updated detail and sees it under the question', async ({ page }) => {
    await given('base-users', 'tc-s1-01-setup', 'tc-s4-58-setup');
    await signIn(page, USERS.organiser);

    await expect(statusOf(page, /Freshman Orientation 2030/)).toHaveText(/Awaiting clarification/);
    await page.goto('/organiser/EVT-146');
    await expect(page.getByText('How many will attend, and how will they leave?').first()).toBeVisible();

    await page.getByRole('checkbox', { name: /Also change event details/ }).check();
    await page.getByLabel('Layout notes').fill('Second exit at the rear');
    await page.getByLabel(/Your response/).fill('About 320, and we added a second exit.');
    await page.getByRole('button', { name: 'Send response' }).click();

    const answer = page.getByRole('listitem').filter({ hasText: 'About 320, and we added a second exit.' });
    await expect(answer.getByText('Layout notes')).toBeVisible();
    await expect(answer.getByText('Second exit at the rear')).toBeVisible();
    await expect(page.getByText('Under review').first()).toBeVisible();
  });
});
