import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { toast } from 'sonner';

import type { ConfirmationReadiness, EventRequest } from '@/types/api';
import { EventStatusBadge } from './event-status-badge';
import { eventsApi } from '../api/events.api';
import { ConfirmArrangementsCard } from './confirm-arrangements-card';
import { ManualCheckToggle } from './manual-check-toggle';

vi.mock('../api/events.api', () => ({
  eventsApi: {
    getConfirmationReadiness: vi.fn(),
    confirmArrangements: vi.fn(),
    setManualCheck: vi.fn(),
  },
}));
vi.mock('sonner', () => ({ toast: { success: vi.fn() } }));

const api = vi.mocked(eventsApi);

const NOT_READY: ConfirmationReadiness = {
  ready: false,
  items: [
    { kind: 'VENUE', label: 'Venue booking at Hall A still pending', status: 'MISSING' },
    { kind: 'VENUE', label: 'Venue booking at Room 2 approved', status: 'OK' },
    { kind: 'EQUIPMENT', label: 'Projector not reserved (1 of 2)', status: 'MISSING' },
    { kind: 'EQUIPMENT', label: 'Stage lighting rig - needs manual check', status: 'NEEDS_MANUAL_CHECK' },
  ],
};

const READY: ConfirmationReadiness = {
  ready: true,
  items: [{ kind: 'VENUE', label: 'Venue booking at Hall A approved', status: 'OK' }],
};

const withClient = (ui: React.ReactNode) =>
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      {ui}
    </QueryClientProvider>,
  );

const confirmButton = () => screen.getByRole('button', { name: 'Confirm arrangements' });

beforeEach(() => vi.resetAllMocks());

describe('US-42 confirm arrangements card', () => {
  it('US-42 AC-1/AC-2: Confirm is disabled and the outstanding items are listed', async () => {
    api.getConfirmationReadiness.mockResolvedValue(NOT_READY);
    withClient(<ConfirmArrangementsCard eventId="e1" />);

    expect(await screen.findByText('Venue booking at Hall A still pending')).toBeInTheDocument();
    expect(screen.getByText('Projector not reserved (1 of 2)')).toBeInTheDocument();
    expect(screen.getByText('Stage lighting rig - needs manual check')).toBeInTheDocument();
    expect(screen.getByText('Venue booking at Room 2 approved')).toBeInTheDocument();
    expect(confirmButton()).toBeDisabled();
  });

  it('US-42 AC-4: when ready, Confirm asks first, then confirms and shows a toast', async () => {
    api.getConfirmationReadiness.mockResolvedValue(READY);
    api.confirmArrangements.mockResolvedValue({ id: 'e1', status: 'AWAITING_SAFETY_CHECK' } as EventRequest);
    withClient(<ConfirmArrangementsCard eventId="e1" />);

    await waitFor(() => expect(confirmButton()).toBeEnabled());
    await userEvent.click(confirmButton());

    const dialog = screen.getByRole('dialog', { name: 'Confirm arrangements?' });
    expect(api.confirmArrangements).not.toHaveBeenCalled();

    await userEvent.click(within(dialog).getByRole('button', { name: 'Confirm' }));

    await waitFor(() => expect(api.confirmArrangements).toHaveBeenCalledWith('e1'));
    await waitFor(() =>
      expect(toast.success).toHaveBeenCalledWith(
        'Arrangements confirmed. The event is now awaiting its safety review.',
      ),
    );
  });

  it('US-42: Cancel in the dialog confirms nothing', async () => {
    api.getConfirmationReadiness.mockResolvedValue(READY);
    withClient(<ConfirmArrangementsCard eventId="e1" />);

    await waitFor(() => expect(confirmButton()).toBeEnabled());
    await userEvent.click(confirmButton());
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(api.confirmArrangements).not.toHaveBeenCalled();
  });

  it('US-42: ticking a free-text line marks it as checked by hand', async () => {
    api.setManualCheck.mockResolvedValue({} as never);
    withClient(
      <ManualCheckToggle
        eventId="e1"
        requirement={{ id: 'r1', equipmentType: 'Stage lighting rig', quantity: 1, notes: null }}
      />,
    );

    await userEvent.click(screen.getByRole('checkbox', { name: 'Stage lighting rig checked by hand' }));

    await waitFor(() => expect(api.setManualCheck).toHaveBeenCalledWith('e1', 'r1', true));
  });

  it('US-42: unticking undoes the check', async () => {
    api.setManualCheck.mockResolvedValue({} as never);
    withClient(
      <ManualCheckToggle
        eventId="e1"
        requirement={{
          id: 'r1',
          equipmentType: 'Stage lighting rig',
          quantity: 1,
          notes: null,
          manuallyConfirmedAt: '2030-01-01T00:00:00Z',
        }}
      />,
    );

    const box = screen.getByRole('checkbox', { name: 'Stage lighting rig checked by hand' });
    expect(box).toBeChecked();
    await userEvent.click(box);

    await waitFor(() => expect(api.setManualCheck).toHaveBeenCalledWith('e1', 'r1', false));
  });

  it('US-42 AC-5: the Organiser-facing label for the new status', () => {
    render(<EventStatusBadge status="AWAITING_SAFETY_CHECK" />);

    expect(screen.getByText('Arrangements confirmed - awaiting safety review')).toBeInTheDocument();
  });
});
