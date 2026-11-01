import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AxiosError } from 'axios';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { venuesApi } from '@/features/venues/api/venues.api';
import type { CoordinatorRequestView, Venue } from '@/types/api';
import { bookingsApi } from '../api/bookings.api';
import { BookingRequestForm } from './booking-request-form';

/**
 * UI tests for US-20 (Submit a request to book a venue with timing and
 * requirements): the booking request form on the Coordinator's event page,
 * rendered with React Testing Library, API mocked. The server's rules are
 * proven by test/bookings-request.e2e-spec.ts; the browser journey by
 * e2e/us20-us23-bookings.spec.ts.
 */

vi.mock('../api/bookings.api', () => ({ bookingsApi: { create: vi.fn() } }));
vi.mock('@/features/venues/api/venues.api', () => ({ venuesApi: { list: vi.fn() } }));

const api = vi.mocked(bookingsApi);

/** tc-s2-34-setup.sql's Orientation: 1 Oct 2030 09:00-12:00 UTC, 120 expected. */
const event = {
  id: 'EVT-102',
  name: 'Orientation',
  proposedStart: '2030-10-01T09:00:00.000Z',
  proposedEnd: '2030-10-01T12:00:00.000Z',
  expectedAttendance: 120,
  preferredLayout: 'THEATRE',
  layoutNotes: null,
  accessibilityRequirements: ['HEARING_LOOP'],
  accessibilityNotes: 'Two hearing aid users',
  equipmentNeeds: '2 wireless mics',
} as unknown as CoordinatorRequestView;

const renderForm = (initialVenueId = '') =>
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <MemoryRouter>
        <BookingRequestForm event={event} initialVenueId={initialVenueId} />
      </MemoryRouter>
    </QueryClientProvider>,
  );

const conflict = {
  kind: 'BOOKING',
  bookingId: 'BKG-028',
  eventName: 'Hackathon',
  start: '2030-10-01T10:00:00.000Z',
  end: '2030-10-01T13:00:00.000Z',
};

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(venuesApi.list).mockResolvedValue([
    { id: 'VEN-002', name: 'Main Hall', capacity: 300, status: 'PUBLISHED' },
  ] as Venue[]);
});

describe('US-20 AC-1: date, times and attendance are required', () => {
  // TC-S2-34 · US-20 AC-1 · fails if the request could be sent without a venue, a date, start/end times or attendance
  // Code: complete requires venueId, date, startTime, endTime and attendance > 0; Submit is disabled until it holds.
  it('keeps Submit disabled until the venue, date, times and attendance are all filled in', async () => {
    const user = userEvent.setup();
    renderForm();
    await screen.findByRole('option', { name: /Main Hall/ });
    const submit = screen.getByRole('button', { name: 'Submit booking request' });

    expect(submit).toBeDisabled(); // no venue yet; the rest comes from the event
    await user.selectOptions(screen.getByLabelText(/^Venue/), 'VEN-002');
    expect(submit).toBeEnabled();

    await user.selectOptions(screen.getByLabelText(/Start time/), '');
    expect(submit).toBeDisabled();
  });
});

describe('US-20 AC-4, AC-5, AC-6: what happens on submit', () => {
  // TC-S2-36 · US-20 AC-4 · fails if a request blocked by a confirmed booking was not explained, or the clash not named
  // Code: a 409 with conflicts renders "already confirmed or blocked out" and ConflictList (event name and time).
  it('shows which confirmed booking blocks the request', async () => {
    const user = userEvent.setup();
    api.create.mockRejectedValue(
      new AxiosError('Conflict', 'ERR_BAD_REQUEST', undefined, undefined, {
        status: 409,
        data: { statusCode: 409, message: 'venue is already booked', conflicts: [conflict] },
      } as never),
    );
    renderForm('VEN-002');
    await screen.findByRole('option', { name: /Main Hall/ });

    await user.click(screen.getByRole('button', { name: 'Submit booking request' }));

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('already confirmed or blocked out');
    expect(alert).toHaveTextContent('Hackathon');
  });

  // TC-S2-38, TC-S2-39 · US-20 AC-5, AC-6 · fails if a successful request gave no confirmation, or a pending overlap was not warned about
  // Code: onSuccess shows "Booking request submitted — pending Venue Staff approval." and each warning with its
  // ConflictList; "View my venue requests" leads to the Coordinator's history.
  it('confirms the request, warns about the overlapping pending one, and links to my requests', async () => {
    const user = userEvent.setup();
    api.create.mockResolvedValue({
      id: 'BKG-030',
      status: 'REQUESTED',
      venue: { id: 'VEN-002', name: 'Main Hall' },
      start: event.proposedStart,
      end: event.proposedEnd,
      warnings: [{ code: 'OVERLAPS_PENDING_REQUEST', conflicts: [{ ...conflict, eventName: 'Careers talk' }] }],
    } as never);
    renderForm('VEN-002');
    await screen.findByRole('option', { name: /Main Hall/ });

    await user.click(screen.getByRole('button', { name: 'Submit booking request' }));

    expect(await screen.findByText('Booking request submitted — pending Venue Staff approval.')).toBeInTheDocument();
    expect(screen.getByRole('alert')).toHaveTextContent('Another pending request overlaps this time');
    expect(screen.getByRole('alert')).toHaveTextContent('Careers talk');
    expect(screen.getByRole('link', { name: 'View my venue requests' })).toHaveAttribute('href', '/coordinator/bookings');
    expect(api.create).toHaveBeenCalledWith(
      expect.objectContaining({ eventId: 'EVT-102', venueId: 'VEN-002', expectedAttendance: 120 }),
    );
  });
});
