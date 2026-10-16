import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { CALENDAR_POLL_MS } from '@/features/calendar/hooks/use-calendar';
import { POLL_MS } from '@/lib/polling';
import { timeAgo } from '@/lib/relative-time';
import type { InboxNotification } from '@/types/api';
import { notificationsApi } from '../api/notifications.api';
import { NOTIFICATIONS_POLL_MS } from '../hooks/use-notifications';
import { NotificationBell } from './notification-bell';

vi.mock('../api/notifications.api', () => ({
  notificationsApi: {
    list: vi.fn(),
    unreadCount: vi.fn(),
    markRead: vi.fn(),
    markUnread: vi.fn(),
    markAllRead: vi.fn(),
  },
}));

const api = vi.mocked(notificationsApi);

const minutesAgo = (m: number) => new Date(Date.now() - m * 60_000).toISOString();

const venueItem = (overrides: Partial<InboxNotification> = {}): InboxNotification => ({
  id: 'n1',
  type: 'BOOKING_REQUEST_SUBMITTED',
  message: 'New booking request for "Gala" at Main Hall, 2030-10-01 18:00–22:00 UTC.',
  summary: 'New booking request for "Gala" at Main Hall, 2030-10-01 18:00–22:00 UTC.',
  reason: null,
  read: false,
  readAt: null,
  createdAt: minutesAgo(5),
  relatedEvent: { id: 'e1', name: 'Gala' },
  relatedBooking: { id: 'b1', venue: { id: 'v1', name: 'Main Hall' } },
  link: '/venues/bookings/b1',
  ...overrides,
});

const wrap = () =>
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <MemoryRouter initialEntries={['/venues']}>
        <NotificationBell />
        <Routes>
          <Route path="/venues" element={<p>Venue dashboard</p>} />
          <Route path="/venues/bookings/:id" element={<p>Booking request page</p>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );

const openBell = async () => {
  await userEvent.click(await screen.findByRole('button', { name: /^Notifications/ }));
  return screen.findByRole('dialog', { name: 'Notifications' });
};

beforeEach(() => {
  vi.resetAllMocks();
  api.unreadCount.mockResolvedValue({ unread: 2 });
  api.markRead.mockResolvedValue(venueItem({ read: true }));
  api.markAllRead.mockResolvedValue({ marked: 2 });
});

describe('US-40: the bell dropdown', () => {
  it('US-40 AC-3/AC-5: lists venue, event, what happened and when, newest first', async () => {
    api.list.mockResolvedValue([
      venueItem(),
      venueItem({
        id: 'n2',
        type: 'BOOKING_EVENT_CANCELLED',
        summary: '"Banquet" has been cancelled. It had a booking of East Annex for 2030-10-02 18:00–22:00 UTC.',
        createdAt: minutesAgo(120),
        relatedEvent: { id: 'e2', name: 'Banquet' },
        relatedBooking: { id: 'b2', venue: { id: 'v2', name: 'East Annex' } },
        link: '/venues/bookings/b2',
      }),
    ]);
    wrap();

    const dialog = await openBell();
    const items = await within(dialog).findAllByRole('listitem');
    expect(items).toHaveLength(2);

    expect(within(items[0]).getByText('Main Hall · Gala')).toBeInTheDocument();
    expect(within(items[0]).getByText(/^New booking request for "Gala"/)).toBeInTheDocument();
    expect(within(items[0]).getByText(timeAgo(minutesAgo(5)))).toBeInTheDocument();
    expect(within(items[1]).getByText('East Annex · Banquet')).toBeInTheDocument();
    expect(api.list).toHaveBeenCalledWith({ limit: 10 });
  });

  it('US-40 AC-3/AC-4: clicking one marks it read and opens the booking request', async () => {
    api.list.mockResolvedValue([venueItem()]);
    wrap();

    const dialog = await openBell();
    await userEvent.click(await within(dialog).findByRole('button', { name: /New booking request/ }));

    expect(api.markRead).toHaveBeenCalledWith('n1');
    expect(await screen.findByText('Booking request page')).toBeInTheDocument();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('US-40 AC-4: clicking a read one does not mark it again', async () => {
    api.list.mockResolvedValue([venueItem({ read: true, readAt: minutesAgo(1) })]);
    wrap();

    const dialog = await openBell();
    await userEvent.click(await within(dialog).findByRole('button', { name: /New booking request/ }));

    expect(await screen.findByText('Booking request page')).toBeInTheDocument();
    expect(api.markRead).not.toHaveBeenCalled();
  });

  it('US-40 AC-4: marks all as read', async () => {
    api.list.mockResolvedValue([venueItem()]);
    wrap();

    const dialog = await openBell();
    await userEvent.click(within(dialog).getByRole('button', { name: 'Mark all as read' }));

    await waitFor(() => expect(api.markAllRead).toHaveBeenCalledTimes(1));
  });

  it('US-40: says so when there are none', async () => {
    api.unreadCount.mockResolvedValue({ unread: 0 });
    api.list.mockResolvedValue([]);
    wrap();

    const dialog = await openBell();
    expect(await within(dialog).findByText('No notifications yet')).toBeInTheDocument();
    expect(within(dialog).getByRole('button', { name: 'Mark all as read' })).toBeDisabled();
  });

  it('US-40: only loads the list once opened', async () => {
    api.list.mockResolvedValue([]);
    wrap();

    await screen.findByRole('button', { name: /^Notifications/ });
    expect(api.list).not.toHaveBeenCalled();
  });
});

describe('US-40 AC-6: appears within 1 minute', () => {
  it('US-40 AC-6: notifications poll at most every 60 seconds, on the shared interval', () => {
    expect(POLL_MS).toBeLessThanOrEqual(60_000);
    expect(NOTIFICATIONS_POLL_MS).toBe(POLL_MS);
    expect(CALENDAR_POLL_MS).toBe(POLL_MS);
  });
});
