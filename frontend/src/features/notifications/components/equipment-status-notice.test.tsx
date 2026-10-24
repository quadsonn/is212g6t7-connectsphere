import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { NotificationsPage } from '@/pages/notifications';
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

beforeEach(() => vi.resetAllMocks());

describe('US-60 the equipment status notice in the inbox', () => {
  it('US-60 AC-1: shows the item name, its new status and the reason, linking to the item', async () => {
    api.list.mockResolvedValue([
      {
        id: 'n1',
        type: 'EQUIPMENT_STATUS_CHANGED',
        message: 'Projector marked Damaged by Wei Technical. Reason: Cracked lens',
        summary: 'Projector marked Damaged by Wei Technical.',
        reason: 'Cracked lens',
        read: false,
        readAt: null,
        createdAt: '2030-10-01T01:00:00.000Z',
        relatedEvent: null,
        relatedBooking: null,
        link: '/equipment/inventory/EQP-001',
      },
    ]);
    render(
      <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
        <MemoryRouter>
          <NotificationsPage />
        </MemoryRouter>
      </QueryClientProvider>,
    );

    expect(await screen.findByRole('link', { name: 'Equipment status changed' })).toHaveAttribute(
      'href',
      '/equipment/inventory/EQP-001',
    );
    expect(screen.getByText('Projector marked Damaged by Wei Technical.')).toBeInTheDocument();
    expect(screen.getByText(/Cracked lens/)).toBeInTheDocument();
  });
});
