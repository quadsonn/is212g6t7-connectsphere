import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { registrationsApi } from '@/features/registrations/api/registrations.api';
import type { EventStatus, RegistrationView } from '@/types/api';
import { AttendeeRegistrations } from './attendee-registrations';

vi.mock('@/features/registrations/api/registrations.api', () => ({
  registrationsApi: { listMine: vi.fn(), withdraw: vi.fn() },
}));

const api = vi.mocked(registrationsApi);

const MAIN_HALL = { id: 'VEN-002', name: 'Main Hall', location: 'Block A, Level 1' };

// The rows as the server sends them: a cancelled event has no venue (its
// booking was released) and its withdrawal is refused.
const registration = (id: string, name: string, status: EventStatus): RegistrationView => ({
  id,
  status: 'REGISTERED',
  registeredAt: '2026-09-05T09:00:00.000Z',
  withdrawnAt: null,
  phone: '+65 9123 4567',
  accessibilityFeature: null,
  accessibilityNeeds: null,
  event: {
    id: `EVT-${id}`,
    name,
    status,
    start: '2030-10-01T10:00:00.000Z',
    end: '2030-10-01T13:00:00.000Z',
    venue: status === 'CANCELLED' ? null : MAIN_HALL,
  },
  withdrawal:
    status === 'CANCELLED'
      ? { canWithdraw: false, reason: 'This event has been cancelled.', withdrawalCutoffAt: '2030-09-30T10:00:00.000Z' }
      : { canWithdraw: true, reason: null, withdrawalCutoffAt: '2030-09-30T10:00:00.000Z' },
});

const renderPage = () =>
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <MemoryRouter>
        <AttendeeRegistrations />
      </MemoryRouter>
    </QueryClientProvider>,
  );

const rowOf = async (name: string) => (await screen.findByText(name)).closest('li') as HTMLElement;

beforeEach(() => {
  vi.resetAllMocks();
  api.listMine.mockResolvedValue({
    registrations: [
      registration('001', 'Autumn Concert', 'CONFIRMED'),
      registration('002', 'Called Off Gala', 'CANCELLED'),
    ],
    message: null,
  });
});

describe('US-34: a registration whose event is cancelled', () => {
  it('US-34: shows "Event cancelled" instead of "Venue to be confirmed"', async () => {
    renderPage();
    const row = await rowOf('Called Off Gala');

    expect(within(row).getByText('Event cancelled')).toBeInTheDocument();
    expect(within(row).queryByText('Venue to be confirmed')).not.toBeInTheDocument();
    // Still listed as the attendee's registration.
    expect(within(row).getByText('Registered')).toBeInTheDocument();
  });

  it('US-34: has every action disabled — no withdraw, no link, nothing clickable', async () => {
    renderPage();
    const row = await rowOf('Called Off Gala');

    expect(within(row).queryByRole('button')).not.toBeInTheDocument();
    expect(within(row).queryByRole('link')).not.toBeInTheDocument();
    expect(within(row).queryByText(/You can withdraw until/)).not.toBeInTheDocument();
  });

  it('US-34: is left out of the registered count', async () => {
    renderPage();
    await rowOf('Called Off Gala');

    // One confirmed and one cancelled registration: only the confirmed counts.
    expect(screen.getByText('1 registered')).toBeInTheDocument();
  });
});

describe('US-34: a confirmed event still works normally', () => {
  it('US-34: shows its venue and links to the event page', async () => {
    renderPage();
    const row = await rowOf('Autumn Concert');

    expect(within(row).getByText('Main Hall, Block A, Level 1')).toBeInTheDocument();
    expect(within(row).queryByText('Event cancelled')).not.toBeInTheDocument();
    expect(within(row).getByRole('link', { name: 'Autumn Concert' })).toHaveAttribute('href', '/events/EVT-001');
  });

  it('US-34: can still be withdrawn, after the confirmation step', async () => {
    api.withdraw.mockResolvedValue({ ...registration('001', 'Autumn Concert', 'CONFIRMED'), status: 'WITHDRAWN' });
    renderPage();
    const user = userEvent.setup();
    const row = await rowOf('Autumn Concert');

    await user.click(within(row).getByRole('button', { name: 'Withdraw' }));
    await user.click(within(row).getByRole('button', { name: 'Yes, withdraw' }));

    // React Query adds its own context as a second argument; the id is the first.
    expect(api.withdraw).toHaveBeenCalledTimes(1);
    expect(api.withdraw.mock.calls[0][0]).toBe('001');
  });
});
