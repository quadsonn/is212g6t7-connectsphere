import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { toast } from 'sonner';

import type { Venue } from '@/types/api';
import { useAuth } from '@/features/auth/hooks/use-auth';
import { venuesApi } from '../api/venues.api';
import { VenueBuffersCard } from './venue-buffers-card';

vi.mock('../api/venues.api', () => ({ venuesApi: { updateBuffers: vi.fn() } }));
vi.mock('@/features/auth/hooks/use-auth', () => ({ useAuth: vi.fn() }));
vi.mock('sonner', () => ({ toast: { success: vi.fn() } }));

const api = vi.mocked(venuesApi);
const auth = vi.mocked(useAuth);

const venue = {
  id: 'v1',
  managedById: 'staff-1',
  setupMinutes: 30,
  turnaroundMinutes: 45,
} as Venue;

const signedInAs = (userId: string) =>
  auth.mockReturnValue({ session: { userId, role: 'VENUE_STAFF', email: null } } as ReturnType<typeof useAuth>);

const renderCard = () =>
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <VenueBuffersCard venue={venue} />
    </QueryClientProvider>,
  );

const setupInput = () => screen.getByLabelText('Setup time (minutes)');
const turnaroundInput = () => screen.getByLabelText('Turnaround time (minutes)');
const save = () => screen.getByRole('button', { name: 'Save buffer times' });

beforeEach(() => vi.resetAllMocks());

describe('US-49 venue buffers card', () => {
  it('US-49 AC-5: shows the saved values', () => {
    signedInAs('someone-else');
    renderCard();

    expect(screen.getByText('Setup: 30 min / Turnaround: 45 min')).toBeInTheDocument();
  });

  it('US-49 AC-4: hides the edit form from anyone but the managing Venue Staff', () => {
    signedInAs('someone-else');
    renderCard();

    expect(screen.queryByRole('button', { name: 'Save buffer times' })).not.toBeInTheDocument();
  });

  it('US-49 AC-1: the manager saves new values and sees a success toast', async () => {
    signedInAs('staff-1');
    api.updateBuffers.mockResolvedValue({ ...venue, setupMinutes: 15, turnaroundMinutes: 0 });
    renderCard();

    await userEvent.clear(setupInput());
    await userEvent.type(setupInput(), '15');
    await userEvent.clear(turnaroundInput());
    await userEvent.type(turnaroundInput(), '0');
    await userEvent.click(save());

    await waitFor(() =>
      expect(api.updateBuffers).toHaveBeenCalledWith('v1', { setupMinutes: 15, turnaroundMinutes: 0 }),
    );
    await waitFor(() => expect(toast.success).toHaveBeenCalled());
  });

  it.each([
    ['-1', /between 0 and 480/],
    ['481', /between 0 and 480/],
    ['1.5', /whole number/],
    ['', /required/],
  ])('US-49 AC-3: %p shows an inline error and sends nothing', async (value, message) => {
    signedInAs('staff-1');
    renderCard();

    await userEvent.clear(setupInput());
    if (value) await userEvent.type(setupInput(), value);
    await userEvent.click(save());

    expect(await screen.findByText(message)).toBeInTheDocument();
    expect(setupInput()).toHaveAttribute('aria-invalid', 'true');
    expect(api.updateBuffers).not.toHaveBeenCalled();
  });
});
