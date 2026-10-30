import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { venuesApi } from '../api/venues.api';
import { VenueAvailabilityCalendar } from './venue-availability-calendar';

/**
 * UI tests for US-17 (View a venue's availability calendar before requesting
 * it): the Coordinator's month calendar, rendered with React Testing Library,
 * API mocked. What the API reveals per day is proven by
 * test/venues-availability.e2e-spec.ts.
 */

vi.mock('../api/venues.api', () => ({ venuesApi: { availability: vi.fn(), occupancy: vi.fn() } }));

const api = vi.mocked(venuesApi);

/**
 * Every month the calendar asks for: the 20th booked, the 21st tentative, the
 * 22nd blocked, the rest free.
 */
const monthOf = (month: string) =>
  Array.from({ length: 28 }, (_, i) => {
    const date = `${month}-${String(i + 1).padStart(2, '0')}`;
    const status = i === 19 ? 'booked' : i === 20 ? 'tentative' : i === 21 ? 'blocked' : 'free';
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
  // TC-S2-17 · US-17 AC-1, US-50 AC-3 · fails if a booked day's times could not be seen, or setup and turnaround were merged into the event
  // Code: selecting a day calls venuesApi.occupancy() and lists each segment (Setup, Event,
  // Turnaround) in Singapore time.
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

  // TC-S2-17 · US-17 AC-4 · fails if a pending-only day's booking was not shown as tentatively held
  // Code: a tentative day is a button labelled "Tentatively held"; its detail repeats the label.
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

  // TC-S2-17 · US-17 AC-1 · fails if a free day looked selectable, or times were fetched before a day was chosen
  // Code: DayCell renders a free day as a plain div; occupancy is fetched only for a selected day.
  it('free days are not selectable, and nothing is fetched until a day is chosen', async () => {
    renderCalendar();

    await screen.findAllByRole('button', { name: /Booked/ });
    expect(screen.queryAllByRole('button', { name: /Free/ })).toHaveLength(0);
    expect(api.occupancy).not.toHaveBeenCalled();
    expect(screen.getByText(/Select a tentative, booked or blocked day/)).toBeInTheDocument();
  });
});

describe('US-17 AC-3, AC-4: booked, tentative and free days look different', () => {
  /** The day cell for one status, found through its screen-reader label. */
  const cellFor = async (label: string) =>
    (await screen.findAllByText(new RegExp(`: ${label}$`)))[0].parentElement!;

  // TC-S2-17 · US-17 AC-3, AC-4 · fails if a booked, tentative and free day could not be told apart, by sight or by screen reader
  // Code: each DayStatus has its own label and style in DAY_STATUS_STYLES (Booked is shaded and struck through,
  // Tentatively held amber, Free plain), and the legend names each one.
  it('labels and styles each status differently, and the legend names them', async () => {
    renderCalendar();

    const booked = await cellFor('Booked');
    const tentative = await cellFor('Tentatively held');
    const free = await cellFor('Free');

    const classes = [booked, tentative, free].map((cell) => cell.className);
    expect(new Set(classes).size).toBe(3);
    expect(booked.className).toMatch(/line-through/);
    const legend = within(screen.getByRole('list', { name: 'Legend' }));
    for (const label of ['Free', 'Tentatively held', 'Booked']) {
      expect(legend.getByText(label)).toBeInTheDocument();
    }
  });
});

describe('US-17 AC-1: blocked-off periods on the availability calendar', () => {
  // TC-S2-182 · US-17 AC-1 · fails if a blocked day was not labelled, or the legend left out Blocked
  // Code: DAY_STATUS_STYLES.blocked labels the day "Blocked" (with a lock icon); the legend lists
  // every status.
  it('Given a blocked day, Then it is labelled Blocked and the legend explains it', async () => {
    renderCalendar();

    expect(await screen.findAllByRole('button', { name: /: Blocked/ })).not.toHaveLength(0);
    expect(within(screen.getByRole('list', { name: 'Legend' })).getByText('Blocked')).toBeInTheDocument();
  });

  // TC-S2-183 · US-17 AC-1, AC-3 · fails if a blocked day's hours were missing, or a reason appeared
  // Code: a BLOCKED segment is listed with its times only; the API sends no reason.
  it('Given a blocked day is selected, Then its blocked hours are listed, with nothing about why', async () => {
    // 09:00–13:00 Singapore time.
    api.occupancy.mockResolvedValue([
      {
        status: 'blocked',
        segments: [{ kind: 'BLOCKED', start: '2030-10-22T01:00:00.000Z', end: '2030-10-22T05:00:00.000Z' }],
      },
    ]);
    renderCalendar();
    const user = userEvent.setup();

    const [blocked] = await screen.findAllByRole('button', { name: /: Blocked/ });
    await user.click(blocked);

    const times = await screen.findByRole('list', { name: 'Blocked times' });
    expect(within(times).getByRole('listitem').textContent?.replace(/ \(.*?\)/g, '')).toBe(
      'Blocked 09:00–13:00',
    );
    expect(screen.getByText('Not available to book', { selector: 'p' })).toBeInTheDocument();
  });
});
