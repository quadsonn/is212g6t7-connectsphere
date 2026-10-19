import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { toast } from 'sonner';

import type { BufferClash, Venue } from '@/types/api';
import { useAuth } from '@/features/auth/hooks/use-auth';
import { venuesApi } from '../api/venues.api';
import { VenueBuffersCard } from './venue-buffers-card';

vi.mock('../api/venues.api', () => ({ venuesApi: { updateBuffers: vi.fn(), previewBuffers: vi.fn() } }));
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
    api.previewBuffers.mockResolvedValue({ clashes: [] });
    api.updateBuffers.mockResolvedValue({ ...venue, setupMinutes: 15, turnaroundMinutes: 0, flagged: 0 });
    renderCard();

    await userEvent.clear(setupInput());
    await userEvent.type(setupInput(), '15');
    await userEvent.clear(turnaroundInput());
    await userEvent.type(turnaroundInput(), '0');
    await userEvent.click(save());

    await waitFor(() =>
      expect(api.updateBuffers).toHaveBeenCalledWith('v1', { setupMinutes: 15, turnaroundMinutes: 0 }),
    );
    expect(api.previewBuffers).toHaveBeenCalledWith('v1', { setupMinutes: 15, turnaroundMinutes: 0 });
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
    expect(api.previewBuffers).not.toHaveBeenCalled();
  });
});

describe('US-51 clashes before saving buffers', () => {
  const clash: BufferClash = {
    bookingId: 'b1',
    eventName: 'Morning lecture',
    start: '2030-10-01T10:00:00.000Z',
    end: '2030-10-01T12:00:00.000Z',
    clashesWith: {
      bookingId: 'b2',
      eventName: 'Lunch talk',
      start: '2030-10-01T12:30:00.000Z',
      end: '2030-10-01T14:00:00.000Z',
    },
  };

  const changeAndSave = async () => {
    signedInAs('staff-1');
    renderCard();
    await userEvent.clear(setupInput());
    await userEvent.type(setupInput(), '60');
    await userEvent.click(save());
  };

  it('US-51 AC-3: lists each clash — event, time, and what it clashes with — before saving', async () => {
    api.previewBuffers.mockResolvedValue({ clashes: [clash] });
    await changeAndSave();

    const dialog = await screen.findByRole('dialog', { name: /bookings would clash/i });
    expect(dialog).toHaveTextContent('Morning lecture');
    expect(dialog).toHaveTextContent('Lunch talk');
    expect(api.updateBuffers).not.toHaveBeenCalled();
  });

  it('US-51 AC-4: Cancel closes the list and saves nothing', async () => {
    api.previewBuffers.mockResolvedValue({ clashes: [clash] });
    await changeAndSave();

    await userEvent.click(await screen.findByRole('button', { name: 'Cancel' }));

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(api.updateBuffers).not.toHaveBeenCalled();
  });

  it('US-51 AC-4/AC-5: Save anyway saves with confirmation and says how many were flagged', async () => {
    api.previewBuffers.mockResolvedValue({ clashes: [clash] });
    api.updateBuffers.mockResolvedValue({ ...venue, setupMinutes: 60, flagged: 2 });
    await changeAndSave();

    await userEvent.click(await screen.findByRole('button', { name: 'Save anyway' }));

    await waitFor(() =>
      expect(api.updateBuffers).toHaveBeenCalledWith('v1', {
        setupMinutes: 60,
        turnaroundMinutes: 45,
        confirmConflicts: true,
      }),
    );
    await waitFor(() => expect(toast.success).toHaveBeenCalledWith(expect.stringMatching(/2 bookings flagged/)));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('US-51 AC-7: no clashes saves straight away with "Buffer times saved"', async () => {
    api.previewBuffers.mockResolvedValue({ clashes: [] });
    api.updateBuffers.mockResolvedValue({ ...venue, setupMinutes: 60, flagged: 0 });
    await changeAndSave();

    await waitFor(() => expect(toast.success).toHaveBeenCalledWith(expect.stringMatching(/^Buffer times saved/)));
    expect(api.updateBuffers).toHaveBeenCalledWith('v1', { setupMinutes: 60, turnaroundMinutes: 45 });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
});
