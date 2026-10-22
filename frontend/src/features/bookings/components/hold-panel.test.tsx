import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { VenueBooking } from '@/types/api';
import { bookingsApi } from '../api/bookings.api';
import { holdProblems, isLiveHold } from '../holds';
import { HoldPanel } from './hold-panel';

vi.mock('../api/bookings.api', () => ({
  bookingsApi: { convertHold: vi.fn(), extendHold: vi.fn(), releaseHold: vi.fn() },
}));

const api = vi.mocked(bookingsApi);

const NOW = new Date('2030-09-01T00:00:00Z');

const hold = (overrides: Partial<VenueBooking> = {}) =>
  ({
    id: 'h1',
    status: 'HELD',
    start: '2030-10-01T10:00:00.000Z',
    end: '2030-10-01T14:00:00.000Z',
    holdExpiresAt: '2030-09-20T09:00:00.000Z',
    releaseReason: null,
    ...overrides,
  }) as VenueBooking;

const renderPanel = (booking: VenueBooking) =>
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <HoldPanel booking={booking} now={NOW} />
    </QueryClientProvider>,
  );

beforeEach(() => vi.resetAllMocks());

describe('US-54: the hold panel', () => {
  it('US-54 AC-5: a live hold offers Convert, Extend and Release', () => {
    renderPanel(hold());

    expect(screen.getByText(/This slot is held until/)).toBeInTheDocument();
    for (const name of ['Convert to booking', 'Extend', 'Release']) {
      expect(screen.getByRole('button', { name })).toBeInTheDocument();
    }
  });

  it('US-54 AC-5: convert and release call the API for this hold', async () => {
    api.convertHold.mockResolvedValue({} as never);
    api.releaseHold.mockResolvedValue({} as never);
    renderPanel(hold());

    await userEvent.click(screen.getByRole('button', { name: 'Convert to booking' }));
    await waitFor(() => expect(api.convertHold).toHaveBeenCalledWith('h1'));
    await userEvent.click(screen.getByRole('button', { name: 'Release' }));
    await waitFor(() => expect(api.releaseHold).toHaveBeenCalledWith('h1'));
  });

  it('US-54 AC-5/AC-6: the actions are hidden once the hold has expired', () => {
    renderPanel(hold({ holdExpiresAt: '2030-08-31T23:00:00.000Z' }));

    expect(screen.getByText(/This hold expired/)).toBeInTheDocument();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('US-54: a released hold says why, with no actions', () => {
    renderPanel(hold({ status: 'RELEASED', releaseReason: 'Hold expired' }));

    expect(screen.getByText(/Released: Hold expired/)).toBeInTheDocument();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('renders nothing for a booking that was never a hold', () => {
    const { container } = renderPanel(hold({ status: 'APPROVED' }));
    expect(container).toBeEmptyDOMElement();
  });

  it('US-54: isLiveHold mirrors the server — HELD and not yet expired', () => {
    expect(isLiveHold(hold(), NOW)).toBe(true);
    expect(isLiveHold(hold({ holdExpiresAt: NOW.toISOString() }), NOW)).toBe(false);
    expect(isLiveHold(hold({ status: 'APPROVED' }), NOW)).toBe(false);
  });
});

describe('US-54 AC-2: hold expiry rules', () => {
  const at = (iso: string) => iso;

  it('accepts an expiry in the future, before the event and the held time', () => {
    expect(
      holdProblems({ start: at('2030-10-01T10:00'), end: at('2030-10-01T14:00'), expiresAt: at('2030-09-20T09:00'), eventStart: '2030-10-01T10:00:00Z' }, NOW),
    ).toEqual([]);
  });

  it('refuses a past expiry, one after the event starts, and one after the held time starts', () => {
    expect(holdProblems({ start: '', end: '', expiresAt: '2030-08-01T00:00', eventStart: null }, NOW)).toEqual([
      'The expiry must be in the future.',
    ]);
    expect(
      holdProblems({ start: '', end: '', expiresAt: '2030-10-02T00:00', eventStart: '2030-10-01T10:00:00Z' }, NOW),
    ).toContain('The expiry must be before the event starts.');
    expect(
      holdProblems({ start: '2030-09-10T10:00', end: '2030-09-10T12:00', expiresAt: '2030-09-11T00:00', eventStart: null }, NOW),
    ).toContain('The expiry must be before the held time starts.');
  });
});
