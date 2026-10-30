import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AxiosError, type AxiosResponse } from 'axios';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { BookingConflictReport, VenueBooking } from '@/types/api';
import { bookingsApi } from '../api/bookings.api';
import { BookingDecisionPanel } from './booking-decision-panel';

vi.mock('../api/bookings.api', () => ({
  bookingsApi: { conflicts: vi.fn(), approve: vi.fn(), reject: vi.fn(), reverse: vi.fn(), alternatives: vi.fn() },
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

const renderPanel = (shown: VenueBooking = booking) =>
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <BookingDecisionPanel booking={shown} />
    </QueryClientProvider>,
  );

const approveOption = () => screen.getByRole('radio', { name: 'Approve' });
const rejectOption = () => screen.getByRole('radio', { name: 'Reject' });

beforeEach(() => vi.resetAllMocks());

describe('US-23 booking decision panel', () => {
  // TC-S2-82 · US-23 AC-2, AC-5 · fails if Approve stayed available over a confirmed overlap, or the reason was not shown
  // Code: useBookingConflicts() -> hasHardConflict disables the Approve option with an
  // explanation; Reject stays available.
  it('US-23: a hard conflict disables Approve, says why, and leaves Reject available', async () => {
    api.conflicts.mockResolvedValue(HARD);
    renderPanel();

    expect(await screen.findByText(/cannot be approved/)).toBeInTheDocument();
    expect(screen.getByText('Gala')).toBeInTheDocument();
    expect(approveOption()).toBeDisabled();
    expect(screen.getByText(/Approve is unavailable/)).toBeInTheDocument();
    expect(rejectOption()).toBeEnabled();
  });

  // TC-S2-82 · US-23 AC-3 · fails if a pending overlap blocked approval, or was not shown as a warning
  // Code: softConflicts are listed as a warning; Approve stays enabled.
  it('US-23: a soft conflict is a warning only and never disables Approve', async () => {
    api.conflicts.mockResolvedValue(SOFT);
    renderPanel();

    expect(await screen.findByText(/Other pending requests overlap/)).toBeInTheDocument();
    expect(screen.getByText('Workshop')).toBeInTheDocument();
    expect(approveOption()).toBeEnabled();
    expect(screen.queryByText(/Approve is unavailable/)).not.toBeInTheDocument();
  });

  // TC-S2-82 · US-23 AC-5 · fails if approval trusted what the page showed earlier
  // Code: submitDecision() refetches the conflicts first and stops if a hard conflict has
  // appeared.
  it('US-23 AC-5: re-checks just before approving, and stops if a hard conflict appeared', async () => {
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

  // TC-S2-82 · US-23 AC-5 · fails if the server's refusal left a stale conflict list or no explanation
  // Code: a 409 (not a capacity refusal) refetches the conflicts and explains that the slot
  // changed.
  it('US-23: a 409 from approval refreshes the conflicts and explains what changed', async () => {
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

  // TC-S2-82 · US-23 AC-1 · fails if a request with no conflicts could not be approved
  // Code: with no conflicts, Approve -> bookingsApi.approve().
  it('US-23: approves normally when nothing is in the way', async () => {
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

describe('US-22 AC-1, AC-2, AC-3, AC-7: deciding from the request detail view', () => {
  beforeEach(() => {
    api.conflicts.mockResolvedValue(NONE);
    api.alternatives.mockResolvedValue({ candidates: [], others: [] } as never);
  });

  // TC-S2-81 · US-22 AC-1, AC-2 · fails if Reject could be submitted without a reason, or the reason was not sent
  // Code: choosing Reject shows "Reason for rejection" (required); Submit decision stays disabled until it has text,
  // then bookingsApi.reject() is called with the trimmed reason.
  it('needs a reason before a rejection can be submitted', async () => {
    const user = userEvent.setup();
    api.reject.mockResolvedValue({ ...booking, status: 'REJECTED' } as VenueBooking);
    renderPanel();

    await user.click(await screen.findByRole('radio', { name: 'Reject' }));
    const submit = screen.getByRole('button', { name: 'Submit decision' });
    expect(screen.getByLabelText(/Reason for rejection/)).toBeInTheDocument();
    expect(submit).toBeDisabled();

    await user.type(screen.getByLabelText(/Reason for rejection/), '  Venue closed for repairs  ');
    await user.click(submit);

    await waitFor(() => expect(api.reject).toHaveBeenCalledWith('b1', 'Venue closed for repairs', []));
  });

  // TC-S2-81 · US-22 AC-1, AC-3 · fails if approving demanded a note
  // Code: choosing Approve shows "Note (optional)"; Submit decision is enabled without one.
  it('approves without a note, the note being optional', async () => {
    const user = userEvent.setup();
    api.approve.mockResolvedValue({ ...booking, status: 'APPROVED', warnings: [] });
    renderPanel();

    await waitFor(() => expect(approveOption()).toBeEnabled());
    await user.click(approveOption());
    expect(screen.getByLabelText(/Note \(optional\)/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Submit decision' }));

    await waitFor(() => expect(api.approve).toHaveBeenCalled());
  });

  // TC-S2-81 · US-22 AC-7 · fails if Approve or Reject were still offered on a request already decided
  // Code: a decided booking renders only the recorded decision and the option to reverse it; the Decision radios are gone.
  it('offers no Approve or Reject once the request is decided', () => {
    renderPanel({ ...booking, status: 'APPROVED' } as VenueBooking);

    expect(screen.queryByRole('radio', { name: 'Approve' })).not.toBeInTheDocument();
    expect(screen.queryByRole('radio', { name: 'Reject' })).not.toBeInTheDocument();
    expect(screen.getByText(/This request has been approved/)).toBeInTheDocument();
  });
});
