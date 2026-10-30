import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { registrationsApi } from '@/features/registrations/api/registrations.api';
import type { EventStatus, RegistrationView } from '@/types/api';
import { AttendeeRegistrations } from './attendee-registrations';

/**
 * UI tests for US-34 (View my registration status) and US-35 (Withdraw my
 * registration): the Attendee's My registrations page, rendered with React
 * Testing Library, API mocked. The server's rules are proven by
 * test/registrations-status.e2e-spec.ts and test/registrations-withdraw.e2e-spec.ts;
 * the browser journey by e2e/us32-us35-registrations.spec.ts.
 */

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
  // TC-S2-189 · US-34 AC-1 · fails if a registration on a cancelled event disappeared, or read as waiting for a venue
  // Code: the row stays, with an "Event cancelled" badge and no venue line.
  it('US-34: shows "Event cancelled" instead of "Venue to be confirmed"', async () => {
    renderPage();
    const row = await rowOf('Called Off Gala');

    expect(within(row).getByText('Event cancelled')).toBeInTheDocument();
    expect(within(row).queryByText('Venue to be confirmed')).not.toBeInTheDocument();
    // Still listed as the attendee's registration.
    expect(within(row).getByText('Registered')).toBeInTheDocument();
  });

  // TC-S2-189 · US-35 AC-1 · fails if a cancelled event's registration still offered withdrawal or a link
  // Code: `cancelled` hides Withdraw and the link; the event page would 404 anyway.
  it('US-34: has every action disabled — no withdraw, no link, nothing clickable', async () => {
    renderPage();
    const row = await rowOf('Called Off Gala');

    expect(within(row).queryByRole('button')).not.toBeInTheDocument();
    expect(within(row).queryByRole('link')).not.toBeInTheDocument();
    expect(within(row).queryByText(/You can withdraw until/)).not.toBeInTheDocument();
  });

  // TC-S2-189 · US-34 AC-1 · fails if a cancelled event's registration counted as a place held
  // Code: activeCount leaves out CANCELLED events.
  it('US-34: is left out of the registered count', async () => {
    renderPage();
    await rowOf('Called Off Gala');

    // One confirmed and one cancelled registration: only the confirmed counts.
    expect(screen.getByText('1 registered')).toBeInTheDocument();
  });
});

describe('US-34: a confirmed event still works normally', () => {
  // TC-S2-150 · US-34 AC-1 · fails if a confirmed event's row lacked its venue or a way to open it
  // Code: the venue name and location, and a Link to /events/:id for CONFIRMED events.
  it('US-34: shows its venue and links to the event page', async () => {
    renderPage();
    const row = await rowOf('Autumn Concert');

    expect(within(row).getByText('Main Hall, Block A, Level 1')).toBeInTheDocument();
    expect(within(row).queryByText('Event cancelled')).not.toBeInTheDocument();
    expect(within(row).getByRole('link', { name: 'Autumn Concert' })).toHaveAttribute('href', '/events/EVT-001');
  });

  // TC-S2-158 · US-35 AC-2, AC-3 · fails if withdrawing skipped the confirmation, or the confirmed withdrawal was not sent
  // Code: Withdraw opens a prompt; "Yes, withdraw" calls POST /registrations/:id/withdraw.
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

describe('US-34 AC-1, AC-3: each registration, or a message when there are none', () => {
  // TC-S2-150 · US-34 AC-1 · fails if a row lacked the event name, date and time, venue or status
  // Code: each row shows the name, formatDateRange(start, end), the venue and a Registered / Withdrawn badge.
  it('US-34 AC-1: lists the name, date and time, venue and status', async () => {
    api.listMine.mockResolvedValue({
      registrations: [
        registration('001', 'Autumn Concert', 'CONFIRMED'),
        { ...registration('003', 'Spring Fair', 'CONFIRMED'), status: 'WITHDRAWN', withdrawnAt: '2026-09-10T09:00:00.000Z' },
      ],
      message: null,
    });
    renderPage();

    const concert = within(await rowOf('Autumn Concert'));
    expect(concert.getByText('Registered')).toBeInTheDocument();
    expect(concert.getByText('Main Hall, Block A, Level 1')).toBeInTheDocument();
    expect(concert.getByText(/1 Oct 2030/)).toBeInTheDocument();
    expect(within(await rowOf('Spring Fair')).getByText('Withdrawn')).toBeInTheDocument();
  });

  // TC-S2-150 · US-34 AC-3 · fails if an Attendee with no registrations saw an empty page
  // Code: no rows shows the server's message, "No Events Registered".
  it('US-34 AC-3: says "No Events Registered" when there are none', async () => {
    api.listMine.mockResolvedValue({ registrations: [], message: 'No Events Registered' });
    renderPage();

    expect(await screen.findByText('No Events Registered')).toBeInTheDocument();
  });
});

describe('US-35 AC-2, AC-5, AC-6: withdrawing, and when it is not offered', () => {
  // TC-S2-158 · US-35 AC-2 · fails if cancelling the prompt withdrew anyway, or left the prompt open
  // Code: "Keep my place" closes the prompt without calling the API.
  it('US-35 AC-2: "Keep my place" leaves the registration as it was', async () => {
    renderPage();
    const user = userEvent.setup();
    const row = within(await rowOf('Autumn Concert'));

    await user.click(row.getByRole('button', { name: 'Withdraw' }));
    await user.click(row.getByRole('button', { name: 'Keep my place' }));

    expect(api.withdraw).not.toHaveBeenCalled();
    expect(row.queryByRole('button', { name: 'Yes, withdraw' })).not.toBeInTheDocument();
    expect(row.getByText('Registered')).toBeInTheDocument();
  });

  // TC-S2-158 · US-35 AC-5 · fails if withdrawal was offered after the cutoff, or the cutoff was not shown
  // Code: canWithdraw false disables Withdraw and shows "The deadline to withdraw was ...".
  it('US-35 AC-5: after the cutoff, Withdraw is unavailable and the deadline is shown', async () => {
    const late = registration('001', 'Autumn Concert', 'CONFIRMED');
    api.listMine.mockResolvedValue({
      registrations: [{ ...late, withdrawal: { canWithdraw: false, reason: 'The withdrawal deadline has passed.', withdrawalCutoffAt: '2030-09-30T10:00:00.000Z' } }],
      message: null,
    });
    renderPage();
    const row = within(await rowOf('Autumn Concert'));

    expect(row.getByRole('button', { name: 'Withdraw' })).toBeDisabled();
    expect(row.getByText(/^The deadline to withdraw was 30 Sept? 2030\.$/)).toBeInTheDocument();
  });

  // TC-S2-158 · US-35 AC-6 · fails if a withdrawn registration still offered withdrawal
  // Code: Withdraw is shown only on REGISTERED rows.
  it('US-35 AC-6: a withdrawn registration has no Withdraw option', async () => {
    api.listMine.mockResolvedValue({
      registrations: [{ ...registration('003', 'Spring Fair', 'CONFIRMED'), status: 'WITHDRAWN', withdrawnAt: '2026-09-10T09:00:00.000Z' }],
      message: null,
    });
    renderPage();
    const row = within(await rowOf('Spring Fair'));

    expect(row.queryByRole('button', { name: 'Withdraw' })).not.toBeInTheDocument();
    expect(row.getByText(/^Withdrawn 10 Sept? 2026$/)).toBeInTheDocument();
  });
});
