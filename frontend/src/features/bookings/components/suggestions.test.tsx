import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { venuesApi } from '@/features/venues/api/venues.api';
import type { AlternativesReport, BookingConflictReport, Venue, VenueBooking } from '@/types/api';
import { bookingsApi } from '../api/bookings.api';
import { BookingDecisionHistory } from './booking-decision-history';
import { BookingDecisionPanel } from './booking-decision-panel';
import { SuggestedAlternatives } from './suggested-alternatives';

vi.mock('../api/bookings.api', () => ({
  bookingsApi: {
    conflicts: vi.fn(),
    approve: vi.fn(),
    reject: vi.fn(),
    reverse: vi.fn(),
    alternatives: vi.fn(),
    acceptSuggestion: vi.fn(),
  },
}));
vi.mock('@/features/venues/api/venues.api', () => ({ venuesApi: { list: vi.fn() } }));

const api = vi.mocked(bookingsApi);
const venues = vi.mocked(venuesApi);

const NONE: BookingConflictReport = { hardConflicts: [], softConflicts: [], blocks: [], hasHardConflict: false };

const decision = (overrides: Partial<VenueBooking['decisions'][number]> = {}) => ({
  id: 'd1',
  kind: 'DECISION' as const,
  outcome: 'REJECTED' as const,
  reason: 'Main Hall is closed for repairs.',
  createdAt: '2030-09-01T09:00:00.000Z',
  decidedBy: { id: 's1', name: 'Vera Venue', email: 'v@example.com', role: 'VENUE_STAFF' as const },
  suggestions: [],
  ...overrides,
});

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

const report: AlternativesReport = {
  bookingId: 'b1',
  start: '2030-10-01T09:00:00.000Z',
  end: '2030-10-01T12:00:00.000Z',
  expectedAttendance: 80,
  candidates: [
    { venueId: 'east', name: 'East Hall', location: 'Block E', capacity: 100, spareCapacity: 20, layout: 'MET' },
    { venueId: 'west', name: 'West Hall', location: null, capacity: 150, spareCapacity: 70, layout: 'UNMET' },
  ],
  // Free and big enough, but not meeting every requirement.
  others: [{ venueId: 'stairs', name: 'Stairs Hall', location: null, capacity: 120 }],
};

const catalogue = [
  { id: 'main', name: 'Main Hall', capacity: 200, status: 'PUBLISHED' },
  { id: 'east', name: 'East Hall', capacity: 100, status: 'PUBLISHED' },
  { id: 'seminar', name: 'Seminar Room', capacity: 40, status: 'PUBLISHED' },
  { id: 'draft', name: 'Draft Hall', capacity: 40, status: 'DRAFT' },
] as Venue[];

const wrap = (ui: React.ReactNode) =>
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <MemoryRouter initialEntries={['/coordinator/bookings/b1']}>
        <Routes>
          <Route path="/coordinator/bookings/b1" element={ui} />
          <Route path="/coordinator/bookings/:id" element={<p>Opened new request</p>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );

beforeEach(() => {
  vi.resetAllMocks();
  api.conflicts.mockResolvedValue(NONE);
  api.alternatives.mockResolvedValue(report);
  venues.list.mockResolvedValue(catalogue);
});

describe('US-41 Venue Staff attach alternatives when rejecting', () => {
  it('US-41 AC-2: shows the ranked candidates, best match first', async () => {
    wrap(<BookingDecisionPanel booking={booking()} />);
    const user = userEvent.setup();

    await screen.findByText(/No other bookings overlap/);
    await user.click(screen.getByRole('radio', { name: 'Reject' }));

    const boxes = await screen.findAllByRole('checkbox');
    expect(boxes.map((b) => b.closest('label')?.textContent)).toEqual([
      expect.stringContaining('East Hall'),
      expect.stringContaining('West Hall'),
    ]);
    expect(screen.getByText(/supports the requested layout/)).toBeInTheDocument();
    expect(api.alternatives).toHaveBeenCalledWith('b1');
  });

  it('US-41 AC-1/AC-3: sends picked candidates and a manually chosen venue with the rejection', async () => {
    api.reject.mockResolvedValue(booking({ status: 'REJECTED' }));
    wrap(<BookingDecisionPanel booking={booking()} />);
    const user = userEvent.setup();

    await screen.findByText(/No other bookings overlap/);
    await user.click(screen.getByRole('radio', { name: 'Reject' }));
    await user.click(await screen.findByRole('checkbox', { name: /East Hall/ }));

    // Manual: only the free, big-enough venues the server lists (Capacity
    // AC-3) — not the catalogue's Seminar Room (40 seats for 80 people).
    const manual = screen.getByLabelText('Or choose another venue');
    expect(
      Array.from((manual as HTMLSelectElement).options).map((o) => o.textContent),
    ).toEqual(['Select a venue…', 'Stairs Hall (seats 120)']);
    await user.selectOptions(manual, 'stairs');
    await user.click(screen.getByRole('button', { name: 'Add' }));
    expect(screen.getByRole('list', { name: 'Venues chosen manually' })).toHaveTextContent(
      'Stairs Hall',
    );

    await user.type(screen.getByLabelText(/Reason for rejection/), 'Closed for repairs.');
    await user.click(screen.getByRole('button', { name: 'Submit decision' }));

    await waitFor(() =>
      expect(api.reject).toHaveBeenCalledWith('b1', 'Closed for repairs.', ['east', 'stairs']),
    );
  });

  it('US-41 AC-4: shows the server refusing a venue that is not free', async () => {
    const { AxiosError } = await import('axios');
    api.reject.mockRejectedValue(
      new AxiosError('Conflict', 'ERR_BAD_REQUEST', undefined, undefined, {
        status: 409,
        data: {
          statusCode: 409,
          message: 'East Hall is not free for the requested time, so it cannot be suggested',
        },
      } as never),
    );
    wrap(<BookingDecisionPanel booking={booking()} />);
    const user = userEvent.setup();

    await screen.findByText(/No other bookings overlap/);
    await user.click(screen.getByRole('radio', { name: 'Reject' }));
    await user.click(await screen.findByRole('checkbox', { name: /East Hall/ }));
    await user.type(screen.getByLabelText(/Reason for rejection/), 'Closed.');
    await user.click(screen.getByRole('button', { name: 'Submit decision' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(/not free for the requested time/);
  });

  it('US-41: a reversal to rejected can carry alternatives too', async () => {
    api.reverse.mockResolvedValue(booking({ status: 'REJECTED' }));
    wrap(<BookingDecisionPanel booking={booking({ status: 'APPROVED' })} />);
    const user = userEvent.setup();

    await user.click(screen.getByRole('button', { name: 'Reverse this decision' }));
    await user.click(await screen.findByRole('checkbox', { name: /West Hall/ }));
    await user.type(screen.getByLabelText(/Reason for reversal/), 'Hall closed.');
    await user.click(screen.getByRole('button', { name: 'Confirm reversal' }));

    await waitFor(() => expect(api.reverse).toHaveBeenCalledWith('b1', 'Hall closed.', ['west']));
  });

  it('US-41: a reversal to approved offers no alternatives', async () => {
    wrap(<BookingDecisionPanel booking={booking({ status: 'REJECTED' })} />);
    const user = userEvent.setup();

    await user.click(screen.getByRole('button', { name: 'Reverse this decision' }));

    expect(screen.queryByText(/Suggest alternative venues/)).not.toBeInTheDocument();
    expect(api.alternatives).not.toHaveBeenCalled();
  });
});

describe('US-41 the Coordinator sees and accepts suggestions', () => {
  const suggested = (acceptedBookingId: string | null = null) =>
    booking({
      status: 'REJECTED',
      decisions: [
        decision({
          suggestions: [
            {
              id: 'sg1',
              venue: { id: 'east', name: 'East Hall', location: 'Block E', capacity: 100 },
              acceptedBookingId,
              acceptedAt: acceptedBookingId ? '2030-09-02T09:00:00.000Z' : null,
              createdAt: '2030-09-01T09:00:00.000Z',
            },
          ],
        }),
      ],
    });

  it('US-41 AC-5: shows the suggestions with the rejection reason', () => {
    wrap(<SuggestedAlternatives booking={suggested()} />);

    expect(screen.getByText('Alternative venues suggested')).toBeInTheDocument();
    expect(screen.getByText('Main Hall is closed for repairs.')).toBeInTheDocument();
    expect(screen.getByText('East Hall')).toBeInTheDocument();
    expect(screen.getByText('Block E · seats 100')).toBeInTheDocument();
  });

  it('US-41 AC-6: accepting creates a request and opens it', async () => {
    api.acceptSuggestion.mockResolvedValue({ ...booking({ id: 'b2' }), warnings: [] });
    wrap(<SuggestedAlternatives booking={suggested()} />);
    const user = userEvent.setup();

    await user.click(screen.getByRole('button', { name: 'Request this venue' }));

    await waitFor(() => expect(api.acceptSuggestion).toHaveBeenCalledWith('b1', 'sg1'));
    expect(await screen.findByText('Opened new request')).toBeInTheDocument();
  });

  it('US-41 AC-6: an accepted suggestion links to its request instead', () => {
    wrap(<SuggestedAlternatives booking={suggested('b2')} />);

    expect(screen.queryByRole('button', { name: 'Request this venue' })).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Requested — view request' })).toHaveAttribute(
      'href',
      '/coordinator/bookings/b2',
    );
  });

  it('shows nothing when the request is not rejected or has no suggestions', () => {
    const { container } = wrap(<SuggestedAlternatives booking={booking({ status: 'APPROVED' })} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('US-41 AC-7: the history lists the suggestions with their decision', () => {
    render(<BookingDecisionHistory decisions={suggested().decisions} />);

    expect(screen.getByText('Suggested instead: East Hall')).toBeInTheDocument();
  });
});

describe('Capacity: Venue Staff can only suggest venues that fit', () => {
  const openReject = async () => {
    wrap(<BookingDecisionPanel booking={booking()} />);
    const user = userEvent.setup();
    await screen.findByText(/No other bookings overlap/);
    await user.click(screen.getByRole('radio', { name: 'Reject' }));
    return user;
  };

  it('Capacity AC-3: an under-capacity venue is offered neither as a candidate nor manually', async () => {
    await openReject();

    await screen.findAllByRole('checkbox');
    const manual = screen.getByLabelText('Or choose another venue') as HTMLSelectElement;
    const offered = [
      ...screen.getAllByRole('checkbox').map((b) => b.closest('label')?.textContent ?? ''),
      ...Array.from(manual.options).map((o) => o.textContent ?? ''),
    ];
    expect(offered.some((text) => text.includes('Seminar Room'))).toBe(false);
    expect(
      screen.getByText(/Only venues free for the requested time and big enough/),
    ).toBeInTheDocument();
  });

  it('Capacity AC-4: says so when no available venue fits, instead of an empty list', async () => {
    api.alternatives.mockResolvedValue({ ...report, expectedAttendance: 499, candidates: [], others: [] });
    await openReject();

    expect(
      await screen.findByText('No available venue fits 499 attendees for this date and time.'),
    ).toBeInTheDocument();
    expect(screen.queryByLabelText('Or choose another venue')).not.toBeInTheDocument();
    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument();
  });

  it('Capacity AC-3: shows the server refusing an under-capacity venue', async () => {
    const { AxiosError } = await import('axios');
    api.reject.mockRejectedValue(
      new AxiosError('Conflict', 'ERR_BAD_REQUEST', undefined, undefined, {
        status: 409,
        data: {
          statusCode: 409,
          code: 'CAPACITY_EXCEEDED',
          message: 'East Hall holds 100, but expected attendance is 120. It cannot be suggested.',
        },
      } as never),
    );
    const user = await openReject();
    await user.click(await screen.findByRole('checkbox', { name: /East Hall/ }));
    await user.type(screen.getByLabelText(/Reason for rejection/), 'Closed.');
    await user.click(screen.getByRole('button', { name: 'Submit decision' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'East Hall holds 100, but expected attendance is 120. It cannot be suggested.',
    );
  });
});

describe('Capacity AC-1/AC-2: the Coordinator cannot request a suggested venue that is too small', () => {
  it('disables Request this venue and explains the shortfall', () => {
    wrap(
      <SuggestedAlternatives
        booking={booking({
          status: 'REJECTED',
          expectedAttendance: 499,
          decisions: [
            decision({
              suggestions: [
                {
                  id: 'sg1',
                  venue: { id: 'lounge', name: 'Alumni Lounge', location: null, capacity: 90 },
                  acceptedBookingId: null,
                  acceptedAt: null,
                  createdAt: '2030-09-01T09:00:00.000Z',
                },
              ],
            }),
          ],
        })}
      />,
    );

    expect(screen.getByRole('button', { name: 'Request this venue' })).toBeDisabled();
    expect(
      screen.getByText("Alumni Lounge holds 90, but expected attendance is 499. It can't be requested."),
    ).toBeInTheDocument();
  });
});
