import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AxiosError, type AxiosResponse } from 'axios';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { BookingConflictReport, VenueBooking } from '@/types/api';
import { bookingsApi } from '../api/bookings.api';
import { BookingDecisionPanel } from './booking-decision-panel';

vi.mock('../api/bookings.api', () => ({
  bookingsApi: { conflicts: vi.fn(), approve: vi.fn(), reject: vi.fn(), reverse: vi.fn() },
}));

const api = vi.mocked(bookingsApi);

const booking = {
  id: 'b1',
  status: 'REQUESTED',
  start: '2030-10-01T09:00:00.000Z',
  end: '2030-10-01T12:00:00.000Z',
  expectedAttendance: 80,
  venue: { id: 'main', name: 'Main Hall', location: null, capacity: 200 },
} as VenueBooking;

const NONE: BookingConflictReport = { hardConflicts: [], softConflicts: [], blocks: [], hasHardConflict: false };
const HARD: BookingConflictReport = {
  ...NONE,
  hardConflicts: [{ bookingId: 'x', eventName: 'Gala', start: booking.start, end: booking.end }],
  hasHardConflict: true,
};
const SOFT: BookingConflictReport = {
  ...NONE,
  softConflicts: [{ bookingId: 'p', eventName: 'Workshop', start: booking.start, end: booking.end }],
};

const renderPanel = () =>
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <BookingDecisionPanel booking={booking} />
    </QueryClientProvider>,
  );

const approveOption = () => screen.getByRole('radio', { name: 'Approve' });
const rejectOption = () => screen.getByRole('radio', { name: 'Reject' });

beforeEach(() => vi.resetAllMocks());

describe('US-24 booking decision panel', () => {
  it('US-24: a hard conflict disables Approve, says why, and leaves Reject available', async () => {
    api.conflicts.mockResolvedValue(HARD);
    renderPanel();

    expect(await screen.findByText(/cannot be approved/)).toBeInTheDocument();
    expect(screen.getByText('Gala')).toBeInTheDocument();
    expect(approveOption()).toBeDisabled();
    expect(screen.getByText(/Approve is unavailable/)).toBeInTheDocument();
    expect(rejectOption()).toBeEnabled();
  });

  it('US-24: a soft conflict is a warning only and never disables Approve', async () => {
    api.conflicts.mockResolvedValue(SOFT);
    renderPanel();

    expect(await screen.findByText(/Other pending requests overlap/)).toBeInTheDocument();
    expect(screen.getByText('Workshop')).toBeInTheDocument();
    expect(approveOption()).toBeEnabled();
    expect(screen.queryByText(/Approve is unavailable/)).not.toBeInTheDocument();
  });

  it('US-24 AC-7: re-checks just before approving, and stops if a hard conflict appeared', async () => {
    api.conflicts.mockResolvedValueOnce(NONE).mockResolvedValue(HARD);
    renderPanel();
    const user = userEvent.setup();

    await screen.findByText(/No other bookings overlap/);
    await user.click(approveOption());
    await user.click(screen.getByRole('button', { name: 'Submit decision' }));

    expect(await screen.findByText(/can no longer be approved/)).toBeInTheDocument();
    expect(api.approve).not.toHaveBeenCalled();
    expect(approveOption()).toBeDisabled();
  });

  it('US-24: a 409 from approval refreshes the conflicts and explains what changed', async () => {
    api.conflicts
      .mockResolvedValueOnce(NONE) // page load
      .mockResolvedValueOnce(NONE) // pre-approval re-check — still clear
      .mockResolvedValue(HARD); // after losing the race
    api.approve.mockRejectedValue(
      new AxiosError('Conflict', 'ERR_BAD_REQUEST', undefined, undefined, {
        status: 409,
        data: { statusCode: 409, message: 'conflict', code: 'BOOKING_HARD_CONFLICT' },
      } as AxiosResponse),
    );
    renderPanel();
    const user = userEvent.setup();

    await screen.findByText(/No other bookings overlap/);
    await user.click(approveOption());
    await user.click(screen.getByRole('button', { name: 'Submit decision' }));

    expect(await screen.findByText(/Another booking was confirmed/)).toBeInTheDocument();
    await waitFor(() => expect(screen.getByText('Gala')).toBeInTheDocument());
    expect(api.conflicts).toHaveBeenCalledTimes(3);
    expect(approveOption()).toBeDisabled();
  });

  it('US-24: approves normally when nothing is in the way', async () => {
    api.conflicts.mockResolvedValue(NONE);
    api.approve.mockResolvedValue({ ...booking, status: 'APPROVED', warnings: [] });
    renderPanel();
    const user = userEvent.setup();

    await screen.findByText(/No other bookings overlap/);
    await user.click(approveOption());
    await user.click(screen.getByRole('button', { name: 'Submit decision' }));

    await waitFor(() => expect(api.approve).toHaveBeenCalledWith('b1', undefined));
  });
});
