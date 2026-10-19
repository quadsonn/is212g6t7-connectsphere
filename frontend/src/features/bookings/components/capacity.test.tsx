import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { venuesApi } from '@/features/venues/api/venues.api';
import type { CoordinatorRequestView, Venue, VenueBooking } from '@/types/api';
import { bookingsApi } from '../api/bookings.api';
import {
  capacityShortfallMessage,
  exceedsCapacity,
  noSuitableVenueMessage,
  overCapacityWarning,
} from '../lib/capacity';
import { BookingDecisionPanel } from './booking-decision-panel';
import { BookingDetails } from './booking-details';
import { BookingRequestForm } from './booking-request-form';

vi.mock('../api/bookings.api', () => ({
  bookingsApi: {
    create: vi.fn(),
    conflicts: vi.fn(),
    approve: vi.fn(),
    reject: vi.fn(),
    reverse: vi.fn(),
    alternatives: vi.fn(),
  },
}));
vi.mock('@/features/venues/api/venues.api', () => ({ venuesApi: { list: vi.fn() } }));

const api = vi.mocked(bookingsApi);

const event = {
  id: 'e1',
  name: 'Alumni Homecoming',
  proposedStart: '2030-11-20T10:00:00.000Z',
  proposedEnd: '2030-11-20T14:00:00.000Z',
  expectedAttendance: 499,
  preferredLayout: null,
  layoutNotes: null,
  accessibilityRequirements: [],
  accessibilityNotes: null,
  equipmentNeeds: null,
} as unknown as CoordinatorRequestView;

const wrap = (ui: React.ReactNode) =>
  render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <MemoryRouter>{ui}</MemoryRouter>
    </QueryClientProvider>,
  );

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(venuesApi.list).mockResolvedValue([
    { id: 'lounge', name: 'Alumni Lounge', capacity: 90, status: 'PUBLISHED' },
    { id: 'green', name: 'Campus Green', capacity: 600, status: 'PUBLISHED' },
  ] as Venue[]);
});

describe('Capacity AC-1/AC-2: the Coordinator can only submit a request the venue can hold', () => {
  const choose = async (venue: string) => {
    wrap(<BookingRequestForm event={event} />);
    const user = userEvent.setup();
    await screen.findByRole('option', { name: /Alumni Lounge/ });
    await user.selectOptions(screen.getByLabelText(/^Venue/), venue);
    return user;
  };

  it('Capacity AC-2: explains the shortfall inline and disables submit', async () => {
    await choose('lounge');

    expect(screen.getByRole('alert')).toHaveTextContent(
      'Alumni Lounge holds 90, but expected attendance is 499.',
    );
    expect(screen.getByLabelText(/Expected attendance/)).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByRole('button', { name: 'Submit booking request' })).toBeDisabled();
  });

  it('Capacity AC-1: allows submitting once attendance equals capacity', async () => {
    const user = await choose('lounge');

    await user.clear(screen.getByLabelText(/Expected attendance/));
    await user.type(screen.getByLabelText(/Expected attendance/), '90');

    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Submit booking request' })).toBeEnabled();
  });

  it('Capacity AC-1: allows a venue with room to spare', async () => {
    await choose('green');

    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Submit booking request' })).toBeEnabled();
  });

  it("Capacity AC-2: shows the server's refusal when the page's figures were out of date", async () => {
    const { AxiosError } = await import('axios');
    api.create.mockRejectedValue(
      new AxiosError('Conflict', 'ERR_BAD_REQUEST', undefined, undefined, {
        status: 409,
        data: {
          statusCode: 409,
          code: 'CAPACITY_EXCEEDED',
          message: 'Campus Green holds 400, but expected attendance is 499.',
        },
      } as never),
    );
    const user = await choose('green');

    await user.click(screen.getByRole('button', { name: 'Submit booking request' }));

    expect(
      await screen.findByText('Campus Green holds 400, but expected attendance is 499.'),
    ).toBeInTheDocument();
  });
});

describe('Capacity AC-5: the Venue Staff Decision card checks capacity', () => {
  const request = (
    expectedAttendance: number,
    capacity: number,
    status: VenueBooking['status'] = 'REQUESTED',
  ) =>
    ({
      id: 'b1',
      eventId: 'e1',
      venueId: 'lounge',
      status,
      start: '2030-11-20T10:00:00.000Z',
      end: '2030-11-20T14:00:00.000Z',
      expectedAttendance,
      accessibilityRequirements: [],
      createdAt: '2030-09-01T09:00:00.000Z',
      venue: { id: 'lounge', name: 'Alumni Lounge', location: null, capacity },
      event: {
        id: 'e1',
        name: 'Alumni Homecoming',
        status: 'PLANNING',
        organiser: { id: 'o1', name: 'Olivia', email: 'o@example.com' },
      },
      requestedBy: null,
      decisions: [],
    }) as unknown as VenueBooking;

  beforeEach(() => {
    api.conflicts.mockResolvedValue({
      hardConflicts: [],
      softConflicts: [],
      blocks: [],
      hasHardConflict: false,
    });
    api.alternatives.mockResolvedValue({
      bookingId: 'b1',
      start: '2030-11-20T10:00:00.000Z',
      end: '2030-11-20T14:00:00.000Z',
      expectedAttendance: 499,
      candidates: [],
      others: [],
    });
  });

  const openCard = async (booking: VenueBooking) => {
    wrap(<BookingDecisionPanel booking={booking} />);
    await screen.findByText('No other bookings overlap this time.');
    return userEvent.setup();
  };
  const approveOption = () => screen.getByRole('radio', { name: 'Approve' });
  const rejectOption = () => screen.getByRole('radio', { name: 'Reject' });

  it('Decision card capacity check (pass): lists overlap and capacity, both with a tick', async () => {
    await openCard(request(80, 90));

    const checks = screen.getByRole('list', { name: 'Checks' });
    const items = within(checks).getAllByRole('listitem');
    expect(items).toHaveLength(2);
    expect(items[0]).toHaveTextContent('No other bookings overlap this time.');
    expect(items[1]).toHaveTextContent('Fits capacity: 80 attendees, venue holds 90');
    expect(screen.queryByText(/Over capacity/)).not.toBeInTheDocument();
  });

  it('Decision card capacity check (fail): shows the over-capacity warning in the checks list', async () => {
    await openCard(request(499, 90));

    const checks = screen.getByRole('list', { name: 'Checks' });
    expect(within(checks).getAllByRole('listitem')[1]).toHaveTextContent(
      'Over capacity: 499 attendees, venue holds 90',
    );
    expect(screen.queryByText(/Fits capacity/)).not.toBeInTheDocument();
  });

  it('Approve disabled in UI when over capacity, with the note; Reject stays available', async () => {
    await openCard(request(499, 90));

    expect(approveOption()).toBeDisabled();
    expect(approveOption()).toHaveAccessibleDescription(
      expect.stringContaining('Cannot approve: venue is over capacity.'),
    );
    expect(rejectOption()).toBeEnabled();
  });

  it('Reject still works on an over-capacity request, and only fitting venues are offered', async () => {
    api.reject.mockResolvedValue(request(499, 90, 'REJECTED'));
    const user = await openCard(request(499, 90));

    await user.click(rejectOption());
    // The suggestion flow still only offers venues that fit (Capacity AC-4).
    expect(
      await screen.findByText('No available venue fits 499 attendees for this date and time.'),
    ).toBeInTheDocument();
    await user.type(screen.getByLabelText(/Reason for rejection/), 'Too small for 499.');
    await user.click(screen.getByRole('button', { name: 'Submit decision' }));

    await waitFor(() => expect(api.reject).toHaveBeenCalledWith('b1', 'Too small for 499.', []));
  });

  it('Approval still works when attendance equals capacity', async () => {
    api.approve.mockResolvedValue({ ...request(90, 90, 'APPROVED'), warnings: [] });
    const user = await openCard(request(90, 90));

    expect(screen.getByText('Fits capacity: 90 attendees, venue holds 90')).toBeInTheDocument();
    await user.click(approveOption());
    await user.click(screen.getByRole('button', { name: 'Submit decision' }));

    await waitFor(() => expect(api.approve).toHaveBeenCalledWith('b1', undefined));
  });

  it("shows the server's capacity refusal as it is, not as a lost race", async () => {
    const { AxiosError } = await import('axios');
    api.approve.mockRejectedValue(
      new AxiosError('Conflict', 'ERR_BAD_REQUEST', undefined, undefined, {
        status: 409,
        data: {
          statusCode: 409,
          code: 'CAPACITY_EXCEEDED',
          message: 'Cannot approve: Alumni Lounge holds 60, but expected attendance is 80.',
        },
      } as never),
    );
    // The page loaded when the venue still held 90; the server knows it holds 60.
    const user = await openCard(request(80, 90));

    await user.click(approveOption());
    await user.click(screen.getByRole('button', { name: 'Submit decision' }));

    expect(
      await screen.findByText(
        'Cannot approve: Alumni Lounge holds 60, but expected attendance is 80.',
      ),
    ).toBeInTheDocument();
    expect(screen.queryByText(/while you were reviewing it/)).not.toBeInTheDocument();
  });

  it('a reversal to approved is disabled when over capacity', async () => {
    wrap(<BookingDecisionPanel booking={request(499, 90, 'REJECTED')} />);
    const user = userEvent.setup();

    await user.click(screen.getByRole('button', { name: 'Reverse this decision' }));
    await user.type(screen.getByLabelText(/Reason for reversal/), 'Reconsidered.');

    expect(screen.getByRole('button', { name: 'Confirm reversal' })).toBeDisabled();
    expect(screen.getByText(/Cannot approve: venue is over capacity\./)).toBeInTheDocument();
  });

  it('Coordinator view does not show the capacity warning', () => {
    // The Coordinator's request page renders BookingDetails only.
    wrap(<BookingDetails booking={request(499, 90)} />);

    expect(screen.queryByText(/Over capacity/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Reject this request/)).not.toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
});

describe("the page's capacity rule mirrors the server's", () => {
  it('blocks only a known shortfall; equal fits', () => {
    expect(exceedsCapacity(90, 499)).toBe(true);
    expect(exceedsCapacity(90, 91)).toBe(true);
    expect(exceedsCapacity(90, 90)).toBe(false);
    expect(exceedsCapacity(null, 499)).toBe(false);
    expect(exceedsCapacity(90, null)).toBe(false);
  });

  it('uses the same wording', () => {
    expect(capacityShortfallMessage({ name: 'Alumni Lounge', capacity: 90 }, 499)).toBe(
      'Alumni Lounge holds 90, but expected attendance is 499.',
    );
    expect(overCapacityWarning({ expectedAttendance: 499, venue: { capacity: 90 } })).toBe(
      'Over capacity: 499 attendees, venue holds 90',
    );
    expect(noSuitableVenueMessage(499)).toBe(
      'No available venue fits 499 attendees for this date and time.',
    );
  });
});
