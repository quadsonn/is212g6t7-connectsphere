import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { useAuth } from '@/features/auth/hooks/use-auth';
import { bookingsApi } from '@/features/bookings/api/bookings.api';
import { venuesApi } from '@/features/venues/api/venues.api';
import type { BookingQueueEntry, Venue } from '@/types/api';
import { VenueBookingQueue } from './venue-booking-queue';

/**
 * UI tests for US-21 (Venue Booking Request Queue): the Venue Staff queue
 * page, rendered with React Testing Library, API mocked. Which requests the
 * server returns for each sort, filter and view is proven by
 * test/bookings-queue.e2e-spec.ts; one row's look by queue-row.test.tsx; the
 * browser journey by e2e/us20-us23-bookings.spec.ts.
 */

vi.mock('@/features/bookings/api/bookings.api', () => ({ bookingsApi: { queue: vi.fn() } }));
vi.mock('@/features/venues/api/venues.api', () => ({ venuesApi: { list: vi.fn() } }));
vi.mock('@/features/auth/hooks/use-auth', () => ({ useAuth: vi.fn() }));

const api = vi.mocked(bookingsApi);

const inDays = (days: number) => new Date(Date.now() + days * 86_400_000).toISOString();

const entry = (id: string, name: string, startsInDays: number): BookingQueueEntry =>
  ({
    id,
    status: 'REQUESTED',
    start: inDays(startsInDays),
    end: inDays(startsInDays + 0.1),
    createdAt: inDays(-5),
    expectedAttendance: 80,
    needsReview: false,
    urgent: startsInDays < 7,
    daysUntilStart: Math.floor(startsInDays),
    venue: { id: 'VEN-002', name: 'Main Hall' },
    event: { id: 'EVT-1', name, status: 'APPROVED', organiser: { id: 'USR-006', name: 'Olivia Organiser', email: 'o@x' } },
    requestedBy: { id: 'USR-004', name: 'Cody Coordinator', email: 'c@x' },
  }) as BookingQueueEntry;

const lastQuery = () => api.queue.mock.calls.at(-1)?.[0];

const renderPage = () =>
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <MemoryRouter>
        <VenueBookingQueue />
      </MemoryRouter>
    </QueryClientProvider>,
  );

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(useAuth).mockReturnValue({
    session: { userId: 'USR-010', role: 'VENUE_STAFF', email: 'venue.staff@example.com' },
  } as ReturnType<typeof useAuth>);
  vi.mocked(venuesApi.list).mockResolvedValue([
    { id: 'VEN-002', name: 'Main Hall', managedById: 'USR-010', status: 'PUBLISHED' },
    { id: 'VEN-038', name: 'Seminar Room', managedById: 'USR-010', status: 'PUBLISHED' },
    { id: 'VEN-003', name: 'Other Hall', managedById: 'USR-011', status: 'PUBLISHED' },
  ] as Venue[]);
  api.queue.mockResolvedValue([entry('BKG-1', 'Soon', 2), entry('BKG-2', 'Next month', 30)]);
});

describe('US-21 AC-1, AC-5: pending requests, the ones due soon first', () => {
  // TC-S2-45 · US-21 AC-5 · fails if a request whose event is under a week away was not set apart at the top
  // Code: the Pending view splits entries by urgencyFor(start) into "Due this week" above "Later".
  it('groups requests due this week above the later ones', async () => {
    renderPage();

    const soon = await screen.findByRole('region', { name: /Due this week/ });
    const later = screen.getByRole('region', { name: /Later/ });
    expect(within(soon).getByText('Soon')).toBeInTheDocument();
    expect(within(later).getByText('Next month')).toBeInTheDocument();
    expect(soon.compareDocumentPosition(later) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(lastQuery()).toMatchObject({ view: 'pending', sortBy: 'eventDate', sortOrder: 'asc' });
  });
});

describe('US-21 AC-3, AC-4: sorting and filtering', () => {
  // TC-S2-43 · US-21 AC-3 · fails if the queue could not be sorted by submission date
  // Code: the "Sort by" select splits into sortBy and sortOrder for GET /bookings/queue.
  it('sorts by submission date when chosen', async () => {
    const user = userEvent.setup();
    renderPage();
    await screen.findByText('Soon');

    await user.selectOptions(screen.getByLabelText('Sort by'), 'submitted-asc');

    await waitFor(() => expect(lastQuery()).toMatchObject({ sortBy: 'submitted', sortOrder: 'asc' }));
  });

  // TC-S2-44 · US-21 AC-4 · fails if the venue filter offered someone else's venue, or was not sent
  // Code: the Venue filter lists only venues managedById = me; choosing one adds venueId to the query.
  it('filters by one of my venues, and never offers another manager’s', async () => {
    const user = userEvent.setup();
    renderPage();
    await screen.findByRole('option', { name: 'Seminar Room' });

    expect(screen.queryByRole('option', { name: 'Other Hall' })).not.toBeInTheDocument();
    await user.selectOptions(screen.getByLabelText('Venue'), 'VEN-038');

    await waitFor(() => expect(lastQuery()).toMatchObject({ venueId: 'VEN-038' }));
  });
});

describe('US-21 AC-7: decided requests have their own view', () => {
  // TC-S2-47 · US-21 AC-7 · fails if decided requests could not be seen apart from pending ones, or filtered by outcome
  // Code: the Decided tab sends view=decided and shows a Status filter; switching resets the sort to newest first.
  it('switches to the Decided view, with a status filter', async () => {
    const user = userEvent.setup();
    renderPage();
    await screen.findByText('Soon');

    await user.click(within(screen.getByRole('tablist', { name: 'Queue view' })).getByRole('tab', { name: 'Decided' }));
    await waitFor(() => expect(lastQuery()).toMatchObject({ view: 'decided', sortBy: 'submitted', sortOrder: 'desc' }));

    await user.selectOptions(screen.getByLabelText('Status'), 'REJECTED');
    await waitFor(() => expect(lastQuery()).toMatchObject({ view: 'decided', status: 'REJECTED' }));
  });
});
