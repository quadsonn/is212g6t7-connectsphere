import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { NotificationsPage } from '@/pages/notifications';
import type { InboxNotification } from '@/types/api';
import { notificationsApi } from '../api/notifications.api';

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

const notice = (id: string, type: string, summary: string): InboxNotification => ({
  id,
  type,
  message: summary,
  summary,
  reason: null,
  read: false,
  readAt: null,
  createdAt: '2030-10-01T01:00:00.000Z',
  relatedEvent: { id: 'e1', name: 'Town Hall' },
  relatedBooking: null,
  link: '/equipment/requirements/e1',
});

beforeEach(() => vi.resetAllMocks());

describe('US-66 equipment notices for the assigned Technical Support member', () => {
  it.each([
    ['AC-1', 'EQUIPMENT_EVENT_CANCELLED', 'Equipment released', 'Event cancelled. Released: 2 × Projector.'],
    [
      'AC-2',
      'EQUIPMENT_RESERVATIONS_REBOOKED',
      'Equipment rebooked',
      'Time 1 Oct, 10:00–12:00 UTC → 2 Oct, 10:00–12:00 UTC. Rebooked: 2 × Projector.',
    ],
    ['AC-3', 'EQUIPMENT_REQUEST_SUBMITTED', 'Equipment request', 'Equipment: 2 × Wireless microphone.'],
  ])('US-66 %s: %s shows its title and detail, beside the event, linking to its requirements', async (_ac, type, title, summary) => {
    api.list.mockResolvedValue([notice('n1', type, summary)]);
    render(
      <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
        <MemoryRouter>
          <NotificationsPage />
        </MemoryRouter>
      </QueryClientProvider>,
    );

    expect(await screen.findByRole('link', { name: title })).toHaveAttribute('href', '/equipment/requirements/e1');
    expect(screen.getByText(summary)).toBeInTheDocument();
    expect(screen.getByText(/^Town Hall ·/)).toBeInTheDocument();
  });
});
