import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { venuesApi } from '../api/venues.api';
import { VenueAvailabilityCalendar } from './venue-availability-calendar';

vi.mock('../api/venues.api', () => ({ venuesApi: { availability: vi.fn(), occupancy: vi.fn() } }));

const api = vi.mocked(venuesApi);

/** Every month the calendar asks for: the 20th booked, the 21st tentative, the rest free. */
const monthOf = (month: string) =>
  Array.from({ length: 28 }, (_, i) => {
    const date = `${month}-${String(i + 1).padStart(2, '0')}`;
    const status = i === 19 ? 'booked' : i === 20 ? 'tentative' : 'free';
    return { date, status } as const;
  });

const renderCalendar = () =>
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <VenueAvailabilityCalendar venueId="v1" />
    </QueryClientProvider>,
  );

beforeEach(() => {
  vi.resetAllMocks();
  api.availability.mockImplementation((_id, month) => Promise.resolve(monthOf(month)));
});

describe('US-50 AC-3: setup and turnaround shown separately on the availability calendar', () => {
  it('lists a selected day’s setup, event and turnaround as separate times', async () => {
    // 10:00–12:00 Singapore time with 30 and 45 minute buffers (UTC below).
    api.occupancy.mockResolvedValue([
      {
        status: 'booked',
        segments: [
          { kind: 'SETUP', start: '2030-10-20T01:30:00.000Z', end: '2030-10-20T02:00:00.000Z' },
          { kind: 'EVENT', start: '2030-10-20T02:00:00.000Z', end: '2030-10-20T04:00:00.000Z' },
          { kind: 'TURNAROUND', start: '2030-10-20T04:00:00.000Z', end: '2030-10-20T04:45:00.000Z' },
        ],
      },
    ]);
    renderCalendar();
    const user = userEvent.setup();

    const [booked] = await screen.findAllByRole('button', { name: /Booked/ });
    await user.click(booked);

    await waitFor(() => expect(api.occupancy).toHaveBeenCalledTimes(1));
    const times = await screen.findByRole('list', { name: 'Setup, event and turnaround times' });
    const items = within(times).getAllByRole('listitem').map((li) => li.textContent);
    // Shown in Singapore time; the day is whatever the calendar selected, so
    // assert on the times and their order.
    expect(items.map((t) => t?.replace(/ \(.*?\)/g, ''))).toEqual([
      'Setup 09:30–10:00',
      'Event 10:00–12:00',
      'Turnaround 12:00–12:45',
    ]);
  });

  it('marks a tentative booking as tentatively held', async () => {
    api.occupancy.mockResolvedValue([
      {
        status: 'tentative',
        segments: [{ kind: 'EVENT', start: '2030-10-21T02:00:00.000Z', end: '2030-10-21T04:00:00.000Z' }],
      },
    ]);
    renderCalendar();
    const user = userEvent.setup();

    const [tentative] = await screen.findAllByRole('button', { name: /Tentatively held/ });
    await user.click(tentative);

    expect(await screen.findByText('Tentatively held', { selector: 'p' })).toBeInTheDocument();
  });

  it('free days are not selectable, and nothing is fetched until a day is chosen', async () => {
    renderCalendar();

    await screen.findAllByRole('button', { name: /Booked/ });
    expect(screen.queryAllByRole('button', { name: /Free/ })).toHaveLength(0);
    expect(api.occupancy).not.toHaveBeenCalled();
    expect(screen.getByText(/Select a tentative or booked day/)).toBeInTheDocument();
  });
});
