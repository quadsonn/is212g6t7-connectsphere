import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { venuesApi } from '@/features/venues/api/venues.api';
import type { AlternativesReport, BookingConflictReport, VenueBooking } from '@/types/api';
import { bookingsApi } from '../api/bookings.api';
import { BookingDecisionPanel } from './booking-decision-panel';

vi.mock('../api/bookings.api', () => ({
  bookingsApi: {
    conflicts: vi.fn(),
    approve: vi.fn(),
    reject: vi.fn(),
    reverse: vi.fn(),
    alternatives: vi.fn(),
  },
}));
vi.mock('@/features/venues/api/venues.api', () => ({ venuesApi: { list: vi.fn() } }));

const api = vi.mocked(bookingsApi);
const venues = vi.mocked(venuesApi);

const NONE: BookingConflictReport = { hardConflicts: [], softConflicts: [], blocks: [], hasHardConflict: false };

const booking = (overrides: Partial<VenueBooking> = {}) =>
  ({
    id: 'b1',
    eventId: 'e1',
    venueId: 'main',
    status: 'REQUESTED',
    start: '2030-10-01T09:00:00.000Z',
    end: '2030-10-01T12:00:00.000Z',
    expectedAttendance: 80,
    venue: { id: 'main', name: 'Main Hall', location: null, capacity: 200 },
    decisions: [],
    ...overrides,
  }) as VenueBooking;

const noAlternatives: AlternativesReport = {
  bookingId: 'b1',
  start: '2030-10-01T09:00:00.000Z',
  end: '2030-10-01T12:00:00.000Z',
  expectedAttendance: 80,
  candidates: [],
  others: [],
};

const renderPanel = (b: VenueBooking) =>
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <BookingDecisionPanel booking={b} />
    </QueryClientProvider>,
  );

beforeEach(() => {
  vi.resetAllMocks();
  api.conflicts.mockResolvedValue(NONE);
  api.alternatives.mockResolvedValue(noAlternatives);
  venues.list.mockResolvedValue([]);
});

describe('US-22 AC-2: a reason of only spaces is not a reason', () => {
  it('US-22 AC-2: whitespace-only reject reason refused', async () => {
    renderPanel(booking());
    const user = userEvent.setup();

    await user.click(await screen.findByRole('radio', { name: 'Reject' }));
    await user.type(screen.getByLabelText(/Reason for rejection/), '   ');

    const submit = screen.getByRole('button', { name: 'Submit decision' });
    expect(submit).toBeDisabled();
    await user.click(submit);
    expect(api.reject).not.toHaveBeenCalled();
  });

  it('US-22 AC-2: a normal reject reason is sent, trimmed', async () => {
    api.reject.mockResolvedValue(booking({ status: 'REJECTED' }));
    renderPanel(booking());
    const user = userEvent.setup();

    await user.click(await screen.findByRole('radio', { name: 'Reject' }));
    await user.type(screen.getByLabelText(/Reason for rejection/), '  Under maintenance  ');
    await waitFor(() => expect(screen.getByRole('button', { name: 'Submit decision' })).toBeEnabled());
    await user.click(screen.getByRole('button', { name: 'Submit decision' }));

    await waitFor(() => expect(api.reject).toHaveBeenCalledWith('b1', 'Under maintenance', []));
  });

  it('US-22 AC-2: whitespace-only reverse reason refused', async () => {
    renderPanel(booking({ status: 'APPROVED' }));
    const user = userEvent.setup();

    await user.click(screen.getByRole('button', { name: 'Reverse this decision' }));
    await user.type(screen.getByLabelText(/Reason for reversal/), '   ');

    const confirm = screen.getByRole('button', { name: 'Confirm reversal' });
    expect(confirm).toBeDisabled();
    await user.click(confirm);
    expect(api.reverse).not.toHaveBeenCalled();
  });

  it('US-22 AC-2: a normal reverse reason is sent, trimmed', async () => {
    api.reverse.mockResolvedValue(booking({ status: 'REJECTED' }));
    renderPanel(booking({ status: 'APPROVED' }));
    const user = userEvent.setup();

    await user.click(screen.getByRole('button', { name: 'Reverse this decision' }));
    await user.type(screen.getByLabelText(/Reason for reversal/), '  Double-booked  ');
    await user.click(screen.getByRole('button', { name: 'Confirm reversal' }));

    await waitFor(() => expect(api.reverse).toHaveBeenCalledWith('b1', 'Double-booked', []));
  });
});
