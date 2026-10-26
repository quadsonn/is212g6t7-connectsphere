import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { toast } from 'sonner';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { CancellationResult, OrganiserRequestView } from '@/types/api';
import { eventsApi } from '../api/events.api';
import { CancelEventPanel } from './cancel-event-panel';

vi.mock('../api/events.api', () => ({ eventsApi: { cancel: vi.fn() } }));
vi.mock('sonner', () => ({ toast: { success: vi.fn() } }));

const api = vi.mocked(eventsApi);

const event = { id: 'e1', name: 'Annual Summit', status: 'CONFIRMED' } as OrganiserRequestView;

const renderPanel = (onClose = vi.fn()) => {
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <CancelEventPanel event={event} onClose={onClose} />
    </QueryClientProvider>,
  );
  return onClose;
};

beforeEach(() => vi.resetAllMocks());

describe('US-43 cancel event panel', () => {
  it('AC-2: refuses to cancel without a reason and sends nothing', async () => {
    renderPanel();

    await userEvent.click(screen.getByRole('button', { name: 'Confirm cancellation' }));

    expect(screen.getByText('A reason is required.')).toBeInTheDocument();
    expect(api.cancel).not.toHaveBeenCalled();
  });

  it('AC-2: a whitespace-only reason does not count', async () => {
    renderPanel();

    await userEvent.type(screen.getByLabelText(/Reason for cancelling/), '   ');
    await userEvent.click(screen.getByRole('button', { name: 'Confirm cancellation' }));

    expect(api.cancel).not.toHaveBeenCalled();
  });

  it('AC-2: confirming sends the trimmed reason with confirm: true, then closes', async () => {
    api.cancel.mockResolvedValue({
      released: { venueBookings: 0, equipmentReservations: 0 },
      closedChangeRequests: 0,
      notified: 0,
    } as CancellationResult);
    const onClose = renderPanel();

    await userEvent.type(screen.getByLabelText(/Reason for cancelling/), '  Speaker withdrew  ');
    await userEvent.click(screen.getByRole('button', { name: 'Confirm cancellation' }));

    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(api.cancel).toHaveBeenCalledWith('e1', { reason: 'Speaker withdrew', confirm: true });
  });

  it('US-65 AC2: Given the server cancels it, Then a toast confirms what was released', async () => {
    api.cancel.mockResolvedValue({
      released: { venueBookings: 1, equipmentReservations: 2 },
      closedChangeRequests: 0,
      notified: 2,
    } as CancellationResult);
    renderPanel();

    await userEvent.type(screen.getByLabelText(/Reason for cancelling/), 'Speaker withdrew');
    await userEvent.click(screen.getByRole('button', { name: 'Confirm cancellation' }));

    await waitFor(() =>
      expect(toast.success).toHaveBeenCalledWith(
        'Event cancelled. 1 venue booking and 2 equipment reservations were released.',
      ),
    );
  });

  it('US-65: Given nothing was held, Then the toast says so', async () => {
    api.cancel.mockResolvedValue({
      released: { venueBookings: 0, equipmentReservations: 0 },
      closedChangeRequests: 0,
      notified: 0,
    } as CancellationResult);
    renderPanel();

    await userEvent.type(screen.getByLabelText(/Reason for cancelling/), 'Speaker withdrew');
    await userEvent.click(screen.getByRole('button', { name: 'Confirm cancellation' }));

    await waitFor(() => expect(toast.success).toHaveBeenCalledWith('Event cancelled.'));
  });

  it('US-65: Given the server refuses, Then no success toast is shown', async () => {
    api.cancel.mockRejectedValue(new Error('a completed event cannot be cancelled'));
    renderPanel();

    await userEvent.type(screen.getByLabelText(/Reason for cancelling/), 'Speaker withdrew');
    await userEvent.click(screen.getByRole('button', { name: 'Confirm cancellation' }));

    await screen.findByRole('alert');
    expect(toast.success).not.toHaveBeenCalled();
  });

  it('keeping the event sends nothing', async () => {
    const onClose = renderPanel();

    await userEvent.click(screen.getByRole('button', { name: 'Keep event' }));

    expect(onClose).toHaveBeenCalled();
    expect(api.cancel).not.toHaveBeenCalled();
  });

  it('stays open and shows the problem when the server refuses', async () => {
    api.cancel.mockRejectedValue(new Error('network'));
    const onClose = renderPanel();

    await userEvent.type(screen.getByLabelText(/Reason for cancelling/), 'Too late');
    await userEvent.click(screen.getByRole('button', { name: 'Confirm cancellation' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(/could not cancel/i);
    expect(onClose).not.toHaveBeenCalled();
  });
});
