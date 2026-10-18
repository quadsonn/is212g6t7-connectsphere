import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { eventsApi } from '@/features/events/api/events.api';
import { venuesApi } from '@/features/venues/api/venues.api';
import { CoordinatorDashboard } from '@/pages/coordinator-dashboard';
import type {
  CoordinatorRequestView,
  EventRequest,
  ReplacementNeeded,
  Venue,
  VenueBooking,
} from '@/types/api';
import { bookingsApi } from '../api/bookings.api';
import { BookingDetails } from './booking-details';
import { VenueUnavailablePanel } from './venue-unavailable-panel';

vi.mock('../api/bookings.api', () => ({
  bookingsApi: { replacementsNeeded: vi.fn(), create: vi.fn(), acceptSuggestion: vi.fn() },
}));
vi.mock('@/features/venues/api/venues.api', () => ({ venuesApi: { list: vi.fn() } }));
vi.mock('@/features/events/api/events.api', () => ({ eventsApi: { list: vi.fn() } }));

const api = vi.mocked(bookingsApi);

const START = '2030-10-01T09:00:00.000Z';
const END = '2030-10-01T12:00:00.000Z';

const event = {
  id: 'e1',
  name: 'Showcase',
  status: 'PLANNING',
  proposedStart: '2030-11-05T01:00:00.000Z',
  proposedEnd: '2030-11-05T03:00:00.000Z',
  expectedAttendance: 500,
  preferredLayout: 'BANQUET',
  layoutNotes: 'Event-level note',
  accessibilityRequirements: [],
  accessibilityNotes: null,
  equipmentNeeds: 'Event-level needs',
} as unknown as CoordinatorRequestView;

const affected = (overrides: Partial<ReplacementNeeded> = {}): ReplacementNeeded =>
  ({
    id: 'b1',
    eventId: 'e1',
    venueId: 'main',
    status: 'APPROVED',
    start: START,
    end: END,
    expectedAttendance: 80,
    preferredLayout: 'THEATRE',
    layoutNotes: 'Stage at the front.',
    accessibilityRequirements: ['STEP_FREE_ACCESS'],
    accessibilityNotes: 'Two wheelchair users.',
    equipmentNeeds: 'Two projectors.',
    venue: { id: 'main', name: 'Main Hall', location: null, capacity: 200 },
    decisions: [],
    replacementNeededAt: '2030-09-20T00:00:00.000Z',
    unavailableFrom: '2030-09-30T00:00:00.000Z',
    unavailableUntil: '2030-10-02T00:00:00.000Z',
    unavailableReason: 'Flood damage',
    replacesBookingId: null,
    replacedByBookingId: null,
    releasedAt: null,
    replacementRequests: [],
    ...overrides,
  }) as ReplacementNeeded;

const wrap = (ui: React.ReactNode) =>
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <MemoryRouter>{ui}</MemoryRouter>
    </QueryClientProvider>,
  );

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(venuesApi.list).mockResolvedValue([
    { id: 'main', name: 'Main Hall', capacity: 200, status: 'PUBLISHED' },
    { id: 'east', name: 'East Hall', capacity: 100, status: 'PUBLISHED' },
  ] as Venue[]);
});

describe('US-52 AC-2: "Venue unavailable" on the Coordinator dashboard', () => {
  it('flags only the affected event', async () => {
    vi.mocked(eventsApi.list).mockResolvedValue([
      { ...event, id: 'e1', name: 'Showcase' },
      { ...event, id: 'e2', name: 'Unaffected' },
    ] as unknown as EventRequest[]);
    api.replacementsNeeded.mockResolvedValue([affected()]);
    wrap(<CoordinatorDashboard />);

    const showcase = (await screen.findByText('Showcase')).closest('li')!;
    expect(await within(showcase).findByText('Venue unavailable')).toBeInTheDocument();
    const other = screen.getByText('Unaffected').closest('li')!;
    expect(within(other).queryByText('Venue unavailable')).not.toBeInTheDocument();
  });
});

describe('US-52 on the affected event', () => {
  it('US-52 AC-1: shows the venue, the affected dates and the reason', async () => {
    api.replacementsNeeded.mockResolvedValue([affected()]);
    wrap(<VenueUnavailablePanel event={event} canRequest />);

    expect(await screen.findByText('Venue unavailable')).toBeInTheDocument();
    expect(screen.getByText('Main Hall')).toBeInTheDocument();
    expect(screen.getByText('Flood damage')).toBeInTheDocument();
    expect(screen.getByText(/has not been cancelled/)).toBeInTheDocument();
  });

  it('shows nothing for an event that is not affected', async () => {
    api.replacementsNeeded.mockResolvedValue([affected({ eventId: 'other' })]);
    const { container } = wrap(<VenueUnavailablePanel event={event} canRequest />);

    await waitFor(() => expect(api.replacementsNeeded).toHaveBeenCalled());
    expect(container).toBeEmptyDOMElement();
  });

  it("US-52 AC-3: the replacement form is pre-filled with the original booking's details and linked to it", async () => {
    api.replacementsNeeded.mockResolvedValue([affected()]);
    api.create.mockResolvedValue({ ...affected({ id: 'b2' }), warnings: [] } as never);
    wrap(<VenueUnavailablePanel event={event} canRequest />);
    const user = userEvent.setup();

    await user.click(await screen.findByRole('button', { name: 'Request a replacement venue' }));

    // The original booking's timing and attendance — not the event's.
    expect(screen.getByLabelText(/Expected attendance/)).toHaveValue(80);
    // Its recorded requirements, not the event's.
    expect(screen.getByText('Theatre — Stage at the front.')).toBeInTheDocument();
    expect(screen.getByText('Two projectors.')).toBeInTheDocument();
    expect(screen.getByText('Two wheelchair users.')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Search venues' })).toHaveAttribute(
      'href',
      '/coordinator/venues',
    );

    // Editable: change the attendance, choose a venue, submit.
    const attendance = screen.getByLabelText(/Expected attendance/);
    await user.clear(attendance);
    await user.type(attendance, '90');
    await user.selectOptions(await screen.findByLabelText(/Venue/), 'east');
    await user.click(screen.getByRole('button', { name: 'Submit replacement request' }));

    await waitFor(() =>
      expect(api.create).toHaveBeenCalledWith({
        eventId: 'e1',
        venueId: 'east',
        start: START,
        end: END,
        expectedAttendance: 90,
        replacesBookingId: 'b1',
      }),
    );
    expect(await screen.findByText(/original booking is released once it is approved/)).toBeInTheDocument();
  });

  it('US-52 AC-3: no replacement form when the Coordinator cannot book for the event', async () => {
    api.replacementsNeeded.mockResolvedValue([affected()]);
    wrap(<VenueUnavailablePanel event={event} canRequest={false} />);

    await screen.findByText('Venue unavailable');
    expect(screen.queryByRole('button', { name: 'Request a replacement venue' })).not.toBeInTheDocument();
  });

  it('US-52 AC-4: shows the venues Venue Staff suggested and selecting one requests it', async () => {
    api.replacementsNeeded.mockResolvedValue([
      affected({
        status: 'REJECTED',
        decisions: [
          {
            id: 'd1',
            kind: 'REVERSAL',
            outcome: 'REJECTED',
            reason: 'Main Hall flooded.',
            createdAt: '2030-09-21T00:00:00.000Z',
            decidedBy: { id: 's1', name: 'Vera', email: 'v@example.com', role: 'VENUE_STAFF' },
            suggestions: [
              {
                id: 'sg1',
                venue: { id: 'east', name: 'East Hall', location: null, capacity: 100 },
                acceptedBookingId: null,
                acceptedAt: null,
                createdAt: '2030-09-21T00:00:00.000Z',
              },
            ],
          },
        ],
      }),
    ]);
    api.acceptSuggestion.mockResolvedValue({ ...affected({ id: 'b2' }), warnings: [] } as never);
    wrap(<VenueUnavailablePanel event={event} canRequest />);
    const user = userEvent.setup();

    expect(await screen.findByText('East Hall')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Request this venue' }));

    await waitFor(() => expect(api.acceptSuggestion).toHaveBeenCalledWith('b1', 'sg1'));
  });

  it('lists replacement requests already made, with their status', async () => {
    api.replacementsNeeded.mockResolvedValue([
      affected({
        replacementRequests: [
          {
            id: 'b2',
            status: 'REJECTED',
            start: START,
            end: END,
            createdAt: '2030-09-22T00:00:00.000Z',
            venue: { id: 'east', name: 'East Hall' },
          },
        ],
      }),
    ]);
    wrap(<VenueUnavailablePanel event={event} canRequest />);

    expect(await screen.findByText('Replacement requests')).toBeInTheDocument();
    expect(screen.getByText(/East Hall/)).toBeInTheDocument();
    expect(screen.getByText('Rejected')).toBeInTheDocument();
  });
});

describe('US-52 AC-5: a released booking says so', () => {
  it('shows it was released once a replacement was confirmed, and keeps its details', () => {
    const released = {
      ...affected({ status: 'RELEASED', replacedByBookingId: 'b2', releasedAt: '2030-09-25T00:00:00.000Z' }),
      createdAt: '2030-09-01T00:00:00.000Z',
      event: { id: 'e1', name: 'Showcase', status: 'PLANNING', organiser: { id: 'o1', name: 'Olu', email: 'o@example.com' } },
    } as unknown as VenueBooking;
    render(
      <MemoryRouter>
        <BookingDetails booking={released} />
      </MemoryRouter>,
    );

    expect(screen.getAllByText('Released').length).toBeGreaterThan(0);
    expect(screen.getByText(/a replacement booking was confirmed/)).toBeInTheDocument();
    expect(screen.getByText(/Flood damage/)).toBeInTheDocument();
    expect(screen.getByText('Main Hall')).toBeInTheDocument();
  });
});
