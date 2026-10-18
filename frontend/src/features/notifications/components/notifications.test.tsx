import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { NotificationsPage } from '@/pages/notifications';
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

const item = (overrides: Partial<InboxNotification> = {}): InboxNotification => ({
  id: 'n1',
  type: 'VENUE_UNAVAILABLE',
  message: '…',
  summary: 'Main Hall is unavailable, affecting the booking for "Gala".',
  reason: 'Flood damage. The event has not been cancelled; request a replacement venue.',
  read: false,
  readAt: null,
  createdAt: '2030-10-01T01:00:00.000Z',
  relatedEvent: { id: 'e1', name: 'Gala' },
  relatedBooking: null,
  link: '/coordinator/events/e1',
  ...overrides,
});

const wrap = (ui: React.ReactNode) =>
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <MemoryRouter initialEntries={['/notifications']}>
        <Routes>
          <Route path="/notifications" element={ui} />
          <Route path="/coordinator/events/:id" element={<p>Coordinator event page</p>} />
          <Route path="/organiser/:id" element={<p>Organiser event page</p>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );

beforeEach(() => vi.resetAllMocks());
afterEach(() => vi.useRealTimers());

describe('Notifications: the bell', () => {
  it('shows the unread count, and its dropdown links to the page', async () => {
    api.unreadCount.mockResolvedValue({ unread: 3 });
    api.list.mockResolvedValue([]);
    wrap(<NotificationBell />);

    // US-40: the bell opens a dropdown; "View all" leads to the page.
    const bell = await screen.findByRole('button', { name: 'Notifications, 3 unread' });
    expect(within(bell).getByText('3')).toBeInTheDocument();
    await userEvent.click(bell);
    expect(await screen.findByRole('link', { name: 'View all' })).toHaveAttribute('href', '/notifications');
  });

  it('shows no badge when everything is read', async () => {
    api.unreadCount.mockResolvedValue({ unread: 0 });
    wrap(<NotificationBell />);

    await waitFor(() => expect(api.unreadCount).toHaveBeenCalled());
    expect(screen.getByRole('button', { name: 'Notifications' })).toBeInTheDocument();
  });
});

describe('Notifications: the page', () => {
  it('US-52 AC-1: shows the Coordinator the venue-unavailable notification with its reason, event and time', async () => {
    api.list.mockResolvedValue([item()]);
    wrap(<NotificationsPage />);

    expect(await screen.findByText(item().summary)).toBeInTheDocument();
    expect(screen.getByText(/Flood damage\. The event has not been cancelled/)).toBeInTheDocument();
    expect(screen.getByText(/^Gala ·/)).toBeInTheDocument();
    // The notification itself is the link to its event.
    expect(screen.getByRole('link', { name: item().summary })).toHaveAttribute('href', '/coordinator/events/e1');
  });

  it('US-47 AC-6 / US-48 AC-9: shows the Organiser’s rejection and change request outcome, with reasons', async () => {
    api.list.mockResolvedValue([
      item({
        id: 'n2',
        type: 'EVENT_STATUS_CHANGED',
        summary: 'Your event request "Gala" has been rejected because it cannot be fulfilled.',
        reason: 'No suitable venue: Every hall is booked.',
        link: '/organiser/e1',
      }),
      item({
        id: 'n3',
        type: 'CHANGE_REQUEST_DECIDED',
        summary: 'Your change request for "Gala" was rejected.',
        reason: 'The hall seats 50.',
        link: '/organiser/e1',
        read: true,
        readAt: '2030-10-01T02:00:00.000Z',
      }),
    ]);
    wrap(<NotificationsPage />);

    expect(await screen.findByText('No suitable venue: Every hall is booked.')).toBeInTheDocument();
    expect(screen.getByText('The hall seats 50.')).toBeInTheDocument();
    for (const link of screen.getAllByRole('link')) {
      expect(link).toHaveAttribute('href', '/organiser/e1');
    }
  });

  it('makes unread items look different, with Mark as read on unread and Mark as unread on read', async () => {
    api.list.mockResolvedValue([item(), item({ id: 'n2', read: true, readAt: '2030-10-01T02:00:00.000Z' })]);
    wrap(<NotificationsPage />);

    const rows = await screen.findAllByRole('listitem');
    expect(rows[0]).toHaveAttribute('aria-label', 'Unread');
    expect(rows[0]).toHaveTextContent('Unread');
    expect(rows[1]).not.toHaveAttribute('aria-label');
    expect(within(rows[0]).getByRole('button', { name: 'Mark as read' })).toBeInTheDocument();
    expect(within(rows[1]).getByRole('button', { name: 'Mark as unread' })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Open event' })).not.toBeInTheDocument();
  });

  it('marks a read one as unread again, then refreshes', async () => {
    const read = item({ read: true, readAt: '2030-10-01T02:00:00.000Z' });
    api.list.mockResolvedValueOnce([read]).mockResolvedValue([item()]);
    api.markUnread.mockResolvedValue(item());
    wrap(<NotificationsPage />);
    const user = userEvent.setup();

    await user.click(await screen.findByRole('button', { name: 'Mark as unread' }));

    await waitFor(() => expect(api.markUnread).toHaveBeenCalledWith('n1'));
    expect(await screen.findByRole('button', { name: 'Mark as read' })).toBeInTheDocument();
  });

  it('toggling read/unread does not open the event', async () => {
    api.list.mockResolvedValue([item()]);
    api.markRead.mockResolvedValue(item({ read: true }));
    wrap(<NotificationsPage />);
    const user = userEvent.setup();

    await user.click(await screen.findByRole('button', { name: 'Mark as read' }));

    await waitFor(() => expect(api.markRead).toHaveBeenCalledWith('n1'));
    expect(screen.queryByText('Coordinator event page')).not.toBeInTheDocument();
  });

  it('marks one as read, then refreshes the list and the bell', async () => {
    api.list.mockResolvedValueOnce([item()]).mockResolvedValue([item({ read: true })]);
    api.markRead.mockResolvedValue(item({ read: true }));
    wrap(<NotificationsPage />);
    const user = userEvent.setup();

    await user.click(await screen.findByRole('button', { name: 'Mark as read' }));

    await waitFor(() => expect(api.markRead).toHaveBeenCalledWith('n1'));
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Mark as read' })).not.toBeInTheDocument());
    expect(api.list).toHaveBeenCalledTimes(2);
  });

  it('marks all as read', async () => {
    api.list.mockResolvedValueOnce([item(), item({ id: 'n2' })]).mockResolvedValue([]);
    api.markAllRead.mockResolvedValue({ marked: 2 });
    wrap(<NotificationsPage />);
    const user = userEvent.setup();

    await user.click(await screen.findByRole('button', { name: 'Mark all as read' }));

    await waitFor(() => expect(api.markAllRead).toHaveBeenCalled());
  });

  it('clicking the notification opens its event and marks it read', async () => {
    api.list.mockResolvedValue([item()]);
    api.markRead.mockResolvedValue(item({ read: true }));
    wrap(<NotificationsPage />);
    const user = userEvent.setup();

    await user.click(await screen.findByRole('link', { name: item().summary }));

    expect(await screen.findByText('Coordinator event page')).toBeInTheDocument();
    await waitFor(() => expect(api.markRead).toHaveBeenCalledWith('n1'));
  });

  it('a notification without an event page is not a link', async () => {
    api.list.mockResolvedValue([item({ link: null })]);
    wrap(<NotificationsPage />);

    await screen.findByText(item().summary);
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Mark as read' })).toBeInTheDocument();
  });

  it('polling brings in new notifications without a reload', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    api.list
      .mockResolvedValueOnce([item()])
      .mockResolvedValue([item({ id: 'new', summary: 'A newer notification.' }), item()]);
    wrap(<NotificationsPage />);

    await screen.findByText(item().summary);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(NOTIFICATIONS_POLL_MS);
    });

    expect(await screen.findByText('A newer notification.')).toBeInTheDocument();
    expect(api.list).toHaveBeenCalledTimes(2);
  });

  it('says so when there are none', async () => {
    api.list.mockResolvedValue([]);
    wrap(<NotificationsPage />);

    expect(await screen.findByText('No notifications yet')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Mark all as read' })).toBeDisabled();
  });
});
