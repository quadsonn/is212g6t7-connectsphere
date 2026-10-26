import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { useAuth } from '@/features/auth/hooks/use-auth';
import { calendarApi } from '@/features/calendar/api/calendar.api';
import type { CalendarEntry, CalendarView } from '@/types/api';
import { VenueCalendar } from './venue-calendar';

/**
 * UI tests for US-16 (Venue Availability Calendar): the Venue Staff
 * calendar page, rendered with React Testing Library, API mocked. What the
 * API returns for a window is proven by test/calendar.e2e-spec.ts; the
 * browser journey, desktop and phone, by e2e/us16-us19-venues.spec.ts.
 */

vi.mock('@/features/calendar/api/calendar.api', () => ({
  calendarApi: { get: vi.fn(), createBlock: vi.fn(), removeBlock: vi.fn() },
}));
vi.mock('@/features/auth/hooks/use-auth', () => ({ useAuth: vi.fn() }));

const api = vi.mocked(calendarApi);

/** Today at the given local hour, so the entry is in every default view. */
const today = (hour: number) => {
  const d = new Date();
  d.setHours(hour, 0, 0, 0);
  return d.toISOString();
};

const entry = (overrides: Partial<CalendarEntry>): CalendarEntry => ({
  id: 'BKG-010',
  kind: 'CONFIRMED',
  venueId: 'VEN-002',
  start: today(9),
  end: today(12),
  eventName: 'Gala',
  organiserName: 'Olivia Organiser',
  expectedAttendance: 80,
  reason: null,
  createdByName: null,
  needsReview: false,
  needsReviewReason: null,
  holdExpiresAt: null,
  ...overrides,
});

const view: CalendarView = {
  venues: [
    { id: 'VEN-002', name: 'Main Hall', location: 'Block A, Level 1', capacity: 300 },
    { id: 'VEN-038', name: 'Seminar Room', location: 'Block B, Level 3', capacity: 40 },
  ],
  entries: [
    entry({}),
    entry({
      id: 'BLK-001',
      kind: 'BLOCKED',
      venueId: 'VEN-038',
      start: today(13),
      end: today(17),
      eventName: null,
      organiserName: null,
      expectedAttendance: null,
      reason: 'Maintenance',
      createdByName: 'Vera Venue',
    }),
  ],
};

const renderPage = () =>
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <MemoryRouter>
        <VenueCalendar />
      </MemoryRouter>
    </QueryClientProvider>,
  );

/** Days covered by the window of the latest GET /calendar. */
const lastWindowDays = () => {
  const { from, to } = api.get.mock.calls.at(-1)![0];
  return Math.round((Date.parse(to) - Date.parse(from)) / 86_400_000);
};

beforeEach(() => {
  vi.clearAllMocks();
  // jsdom has no scrolling; the page scrolls the opened details into view.
  Element.prototype.scrollIntoView = vi.fn();
  api.get.mockResolvedValue(view);
  vi.mocked(useAuth).mockReturnValue({
    session: { userId: 'USR-010', role: 'VENUE_STAFF', email: 'venue.staff@example.com' },
  } as ReturnType<typeof useAuth>);
});

describe('US-16 AC-2: day, week and month views', () => {
  // TC-S2-10 · US-16 AC-2 · fails if a view could not be chosen, or the calendar did not load that view's window
  // Code: the "Calendar view" tabs set mode; visibleRange(mode) gives the from/to sent to GET /calendar.
  it('switches between Day, Week and Month, loading each one’s window', async () => {
    const user = userEvent.setup();
    renderPage();
    const tabs = within(await screen.findByRole('tablist', { name: 'Calendar view' }));

    expect(tabs.getByRole('tab', { name: 'Week' })).toHaveAttribute('aria-selected', 'true');
    expect(lastWindowDays()).toBe(7);

    await user.click(tabs.getByRole('tab', { name: 'Day' }));
    expect(tabs.getByRole('tab', { name: 'Day' })).toHaveAttribute('aria-selected', 'true');
    expect(lastWindowDays()).toBe(1);

    await user.click(tabs.getByRole('tab', { name: 'Month' }));
    expect(lastWindowDays()).toBeGreaterThanOrEqual(28);
    expect(lastWindowDays()).toBeLessThanOrEqual(42);
  });
});

describe('US-16 AC-4: a booked slot opens its details', () => {
  // TC-S2-10 · US-16 AC-4 · fails if clicking a booking did not show its event name, organiser, time and attendance
  // Code: selecting an entry renders EntryDetail with the event name, Organiser, time and Expected attendance.
  it('shows the event name, organiser, time and attendance of the clicked booking', async () => {
    const user = userEvent.setup();
    renderPage();

    await user.click((await screen.findAllByRole('button', { name: /Gala/ }))[0]);

    expect(await screen.findByRole('heading', { name: 'Gala' })).toBeInTheDocument();
    expect(screen.getByText('Olivia Organiser')).toBeInTheDocument();
    expect(screen.getByText('Expected attendance')).toBeInTheDocument();
  });
});

describe('US-16 AC-1, AC-6: blocked-out time is told apart from bookings', () => {
  // TC-S2-08 · US-16 AC-6 · fails if a blocked period looked like a booking, or did not say why it is blocked
  // Code: a BLOCKED entry is drawn with its own style and label, and its detail reads "Blocked out" with the reason.
  it('opens a blocked period as "Blocked out", with its reason and who set it', async () => {
    const user = userEvent.setup();
    renderPage();

    await user.click((await screen.findAllByRole('button', { name: /Blocked|Maintenance/ }))[0]);

    expect(await screen.findByRole('heading', { name: 'Blocked out' })).toBeInTheDocument();
    expect(screen.getByText('Reason')).toBeInTheDocument();
    expect(screen.getAllByText('Maintenance').length).toBeGreaterThanOrEqual(2); // on the calendar and in the details
    expect(screen.getByText('Blocked by')).toBeInTheDocument();
    expect(screen.getByText('Vera Venue')).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Gala' })).not.toBeInTheDocument();
  });
});
