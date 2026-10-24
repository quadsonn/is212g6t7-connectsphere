import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { venuesApi } from '@/features/venues/api/venues.api';
import type { CoordinatorRequestView, Venue, VenueBooking } from '@/types/api';
import { bookingsApi } from '../api/bookings.api';
import { BookingRequestForm } from './booking-request-form';
import { EventBookingsList } from './event-bookings-list';
import { VenueArrangementBadge } from './venue-arrangement-badge';

vi.mock('../api/bookings.api', () => ({ bookingsApi: { create: vi.fn(), arrangement: vi.fn() } }));
vi.mock('@/features/venues/api/venues.api', () => ({ venuesApi: { list: vi.fn() } }));

const api = vi.mocked(bookingsApi);

const event = {
  id: 'e1',
  name: 'Summit',
  proposedStart: '2030-10-01T01:00:00.000Z',
  proposedEnd: '2030-10-01T09:00:00.000Z',
  expectedAttendance: 200,
  preferredLayout: 'THEATRE',
  layoutNotes: null,
  accessibilityRequirements: ['STEP_FREE_ACCESS'],
  accessibilityNotes: null,
  equipmentNeeds: 'PA system',
} as unknown as CoordinatorRequestView;

const booking = (id: string, venue: string, status: VenueBooking['status']) =>
  ({
    id,
    venue: { id: venue, name: venue, location: null, capacity: 100 },
    start: '2030-10-01T01:00:00.000Z',
    end: '2030-10-01T09:00:00.000Z',
    status,
    decisions: [],
  }) as unknown as VenueBooking;

const wrap = (ui: React.ReactNode) =>
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <MemoryRouter>{ui}</MemoryRouter>
    </QueryClientProvider>,
  );

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(venuesApi.list).mockResolvedValue([
    { id: 'room', name: 'Breakout Room', capacity: 50, status: 'PUBLISHED' },
  ] as Venue[]);
});

describe('US-53 AC-2: requirements set separately for each venue', () => {
  it('sends this venue’s own requirements when they are set', async () => {
    api.create.mockResolvedValue({ ...booking('b2', 'room', 'REQUESTED'), warnings: [] } as never);
    wrap(<BookingRequestForm event={event} />);
    const user = userEvent.setup();

    await screen.findByRole('option', { name: /Breakout Room/ });
    await user.selectOptions(screen.getByLabelText(/^Venue/), 'room');
    await user.selectOptions(screen.getByLabelText(/Expected attendance/), '10 – 49');
    await user.click(screen.getByRole('button', { name: 'Set different requirements for this venue' }));

    // Starts from the event's requirements.
    expect(screen.getByLabelText('Layout')).toHaveValue('THEATRE');
    expect(screen.getByLabelText('Step-free access')).toBeChecked();

    await user.selectOptions(screen.getByLabelText('Layout'), 'CLASSROOM');
    await user.click(screen.getByLabelText('Step-free access'));
    await user.clear(screen.getByLabelText('Equipment / technical'));
    await user.type(screen.getByLabelText('Equipment / technical'), 'Whiteboard');
    await user.click(screen.getByRole('button', { name: 'Submit booking request' }));

    await waitFor(() =>
      expect(api.create).toHaveBeenCalledWith(
        expect.objectContaining({
          venueId: 'room',
          expectedAttendance: 49,
          preferredLayout: 'CLASSROOM',
          layoutNotes: null,
          accessibilityRequirements: [],
          accessibilityNotes: null,
          equipmentNeeds: 'Whiteboard',
        }),
      ),
    );
  });

  it('sends no requirements — so the event’s are copied — when they are not changed', async () => {
    api.create.mockResolvedValue({ ...booking('b2', 'room', 'REQUESTED'), warnings: [] } as never);
    wrap(<BookingRequestForm event={event} />);
    const user = userEvent.setup();

    await screen.findByRole('option', { name: /Breakout Room/ });
    await user.selectOptions(screen.getByLabelText(/^Venue/), 'room');
    // Within the room's 50 seats (the event's 200 would be over capacity).
    await user.selectOptions(screen.getByLabelText(/Expected attendance/), '10 – 49');
    await user.click(screen.getByRole('button', { name: 'Submit booking request' }));

    await waitFor(() => expect(api.create).toHaveBeenCalled());
    expect(api.create.mock.calls[0][0]).not.toHaveProperty('preferredLayout');
    expect(api.create.mock.calls[0][0]).not.toHaveProperty('equipmentNeeds');
  });
});

describe('US-53 AC-4/AC-6: each booking shown separately, and released on its own', () => {
  const bookings = [
    booking('b1', 'Main Hall', 'APPROVED'),
    booking('b2', 'Breakout A', 'REQUESTED'),
    booking('b3', 'Breakout B', 'REJECTED'),
    booking('b4', 'Breakout C', 'RELEASED'),
  ];

  it('shows each booking with its own status', () => {
    wrap(<EventBookingsList bookings={bookings} />);

    for (const label of ['Approved', 'Pending', 'Rejected', 'Released']) {
      expect(screen.getByText(label)).toBeInTheDocument();
    }
  });

  it('offers release only on active bookings, and only after confirming', async () => {
    const onRelease = vi.fn();
    wrap(<EventBookingsList bookings={bookings} onRelease={onRelease} />);
    const user = userEvent.setup();

    expect(screen.getByRole('button', { name: 'Release' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Cancel request' })).toBeInTheDocument();
    expect(screen.getAllByRole('button')).toHaveLength(2); // nothing on rejected/released

    await user.click(screen.getByRole('button', { name: 'Release' }));
    expect(onRelease).not.toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: 'Confirm release' }));

    expect(onRelease).toHaveBeenCalledWith('b1');
    expect(onRelease).toHaveBeenCalledTimes(1);
  });

  it('offers no release where the viewer cannot release (e.g. the Organiser)', () => {
    wrap(<EventBookingsList bookings={bookings} />);
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });
});

describe('US-53 AC-5: venue arranged only when every active booking is approved', () => {
  it('shows progress while some are pending', async () => {
    api.arrangement.mockResolvedValue({
      arranged: false,
      activeBookings: 3,
      approvedBookings: 1,
      pendingBookings: 2,
    });
    wrap(<VenueArrangementBadge eventId="e1" />);

    expect(await screen.findByText('1 of 3 venues approved')).toBeInTheDocument();
  });

  it('shows "Venue arranged" once all are approved', async () => {
    api.arrangement.mockResolvedValue({
      arranged: true,
      activeBookings: 2,
      approvedBookings: 2,
      pendingBookings: 0,
    });
    wrap(<VenueArrangementBadge eventId="e1" />);

    expect(await screen.findByText('Venue arranged')).toBeInTheDocument();
  });

  it('shows nothing before any venue is requested', async () => {
    api.arrangement.mockResolvedValue({
      arranged: false,
      activeBookings: 0,
      approvedBookings: 0,
      pendingBookings: 0,
    });
    const { container } = wrap(<VenueArrangementBadge eventId="e1" />);

    await waitFor(() => expect(api.arrangement).toHaveBeenCalledWith('e1'));
    expect(container).toBeEmptyDOMElement();
  });
});
