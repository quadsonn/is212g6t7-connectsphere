import { expect, test, type APIRequestContext } from '@playwright/test';
import { authHeaders, seedIds } from './support';

/**
 * Story: As a Coordinator, I want the system to flag whether a venue appears
 * suitable for my event before I submit a request, so that I can catch
 * mismatches early instead of waiting for a rejection.
 *
 * The suitability rules (ACs 1, 2, 3, 5) are checked straight against the API,
 * which takes milliseconds. The browser tests only prove the flags reach the
 * screen in both places (booking form and venue page) and that flags don't
 * block submitting (AC4).
 *
 * Seed data used (capacity / accessibility):
 *   Lecture Theatre 1 — 120, step-free + accessible restrooms
 *   Main Auditorium   — 200, all accessibility features
 *   Seminar Room B    — 80, none
 * Events: Inclusive Design Forum (100, step-free + wheelchair seating +
 * hearing loop), Robotics Showcase (120), Alumni Evening (150),
 * Hackathon Kickoff (60). All want a Theatre layout.
 */

const FORUM = 'Inclusive Design Forum 2027';
const ROBOTICS = 'Robotics Showcase 2027';
const ALUMNI = 'Alumni Evening 2027';
const HACKATHON = 'Hackathon Kickoff 2027';
const LT1 = 'Lecture Theatre 1';
const AUDITORIUM = 'Main Auditorium';
const SEMINAR = 'Seminar Room B';

async function suitability(
  request: APIRequestContext,
  venue: string,
  event: string,
  expectedAttendance?: number,
) {
  const ids = await seedIds(request);
  const params: Record<string, string> = { eventId: ids.events[event] };
  if (expectedAttendance !== undefined) params.expectedAttendance = String(expectedAttendance);

  const started = Date.now();
  const res = await request.get(`/api/venues/${ids.venues[venue]}/suitability`, {
    params,
    headers: authHeaders(),
  });
  const ms = Date.now() - started;
  expect(res.ok()).toBeTruthy();
  return { body: await res.json(), ms };
}

test.describe('API: suitability rules', () => {
  test('AC1: attendance above capacity is flagged', async ({ request }) => {
    const { body } = await suitability(request, SEMINAR, FORUM, 81);
    expect(body.capacity).toMatchObject({ status: 'UNMET', venueCapacity: 80, expectedAttendance: 81 });
    expect(body.overallSuitable).toBe(false);
  });

  test('AC1 edge: attendance equal to capacity is not flagged', async ({ request }) => {
    const { body } = await suitability(request, SEMINAR, FORUM, 80);
    expect(body.capacity.status).toBe('MET');
  });

  test('AC1 edge: attendance just below capacity is not flagged', async ({ request }) => {
    const { body } = await suitability(request, SEMINAR, FORUM, 79);
    expect(body.capacity.status).toBe('MET');
  });

  test("AC1: falls back to the event's recorded attendance", async ({ request }) => {
    const { body } = await suitability(request, LT1, ALUMNI);
    expect(body.capacity).toMatchObject({ status: 'UNMET', expectedAttendance: 150 });
  });

  test('AC2: each unmet accessibility requirement is listed individually', async ({ request }) => {
    const { body } = await suitability(request, LT1, FORUM);
    expect(body.accessibility.status).toBe('UNMET');
    expect(body.accessibility.items).toEqual(
      expect.arrayContaining([
        { requirement: 'STEP_FREE_ACCESS', met: true },
        { requirement: 'WHEELCHAIR_SEATING', met: false },
        { requirement: 'HEARING_LOOP', met: false },
      ]),
    );
  });

  test('AC2: a venue with no features fails every requirement separately', async ({ request }) => {
    const { body } = await suitability(request, SEMINAR, FORUM);
    const missing = body.accessibility.items.filter((i: { met: boolean }) => !i.met);
    expect(missing.map((i: { requirement: string }) => i.requirement).sort()).toEqual(
      ['HEARING_LOOP', 'STEP_FREE_ACCESS', 'WHEELCHAIR_SEATING'],
    );
  });

  test('AC2 edge: an event with no accessibility needs raises no accessibility flag', async ({ request }) => {
    const { body } = await suitability(request, SEMINAR, HACKATHON);
    expect(body.accessibility.status).not.toBe('UNMET');
  });

  test('AC3: a venue meeting every check is marked suitable', async ({ request }) => {
    const { body } = await suitability(request, AUDITORIUM, FORUM);
    expect(body.overallSuitable).toBe(true);
    expect(body.capacity.status).toBe('MET');
    expect(body.accessibility.status).toBe('MET');
    expect(body.layout.status).toBe('MET');
  });

  test('AC5: every venue/event check returns within 2 seconds', async ({ request }) => {
    const pairs = [LT1, AUDITORIUM, SEMINAR].flatMap((venue) =>
      [FORUM, ROBOTICS, ALUMNI, HACKATHON].map((event) => ({ venue, event })),
    );
    const results = await Promise.all(
      pairs.map(({ venue, event }) => suitability(request, venue, event)),
    );
    for (const [i, { ms }] of results.entries()) {
      expect(ms, `${pairs[i].venue} × ${pairs[i].event}`).toBeLessThan(2000);
    }
  });
});

test.describe('UI: booking form (flags visible before submitting)', () => {
  test('AC1–3: capacity flag and suitable indicator update as attendance changes', async ({ page, request }) => {
    const ids = await seedIds(request);
    await page.goto(`/coordinator/events/${ids.events[FORUM]}`);
    await page.getByRole('combobox', { name: /^Venue/ }).selectOption({ label: 'Main Auditorium (capacity 200)' });

    const panel = page.getByRole('region', { name: 'Venue suitability' });
    const attendance = page.getByRole('spinbutton', { name: /Expected attendance/ });
    await expect(panel).toContainText('Appears suitable');

    // Main Auditorium meets every accessibility and layout need, so capacity
    // is the only thing that can change the verdict here.
    await attendance.fill('201');
    await expect(panel).toContainText('200 seats · 201 expected');
    await expect(panel).toContainText('May not be suitable');

    await attendance.fill('200');
    await expect(panel).toContainText('200 seats · 200 expected');
    await expect(panel).toContainText('Appears suitable');
  });

  test('AC2: missing accessibility requirements are listed one per line', async ({ page, request }) => {
    const ids = await seedIds(request);
    await page.goto(`/coordinator/events/${ids.events[FORUM]}`);
    await page.getByRole('combobox', { name: /^Venue/ }).selectOption({ label: 'Lecture Theatre 1 (capacity 120)' });

    await expect(page.getByRole('list', { name: 'Missing accessibility requirements' }).getByRole('listitem'))
      .toHaveText(['Missing: Wheelchair seating spaces', 'Missing: Hearing loop']);
  });

  // The only test that writes data, and the only one that touches Alumni
  // Evening, so it can't disturb the others when running in parallel.
  test('AC4: Coordinator can still submit when flags are raised', async ({ page, request }) => {
    const ids = await seedIds(request);
    await page.goto(`/coordinator/events/${ids.events[ALUMNI]}`);
    await page.getByRole('combobox', { name: /^Venue/ }).selectOption({ label: 'Lecture Theatre 1 (capacity 120)' });
    await expect(page.getByRole('region', { name: 'Venue suitability' })).toContainText('May not be suitable');

    await page.getByRole('button', { name: 'Submit booking request' }).click();
    await expect(page.getByText('Booking request submitted — pending Venue Staff approval.')).toBeVisible();
  });
});

test.describe('UI: venue page Suitability tab', () => {
  async function checkAgainst(page: import('@playwright/test').Page, venueId: string, event: string) {
    await page.goto(`/coordinator/venues/${venueId}?tab=suitability`);
    const select = page.getByRole('combobox', { name: 'Check against' });
    const value = await select.locator('option', { hasText: event }).getAttribute('value');
    await select.selectOption(value!);
    return page.getByRole('tabpanel', { name: 'Suitability' });
  }

  test('AC1 edge: attendance equal to capacity shows as suitable', async ({ page, request }) => {
    const ids = await seedIds(request);
    const panel = await checkAgainst(page, ids.venues[LT1], ROBOTICS);
    await expect(panel).toContainText('120 seats · 120 expected');
    await expect(panel).toContainText('Appears suitable');
  });

  test('AC2: missing accessibility requirements are listed individually', async ({ page, request }) => {
    const ids = await seedIds(request);
    const panel = await checkAgainst(page, ids.venues[LT1], FORUM);
    await expect(panel).toContainText('Missing: Wheelchair seating spaces');
    await expect(panel).toContainText('Missing: Hearing loop');
  });
});
