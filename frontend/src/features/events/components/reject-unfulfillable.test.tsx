import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AxiosError, type AxiosResponse } from 'axios';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { eventsApi } from '../api/events.api';
import { RejectUnfulfillable } from './reject-unfulfillable';

vi.mock('../api/events.api', () => ({ eventsApi: { rejectUnfulfillable: vi.fn() } }));

const api = vi.mocked(eventsApi);

const renderPanel = () =>
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <RejectUnfulfillable eventId="e1" />
    </QueryClientProvider>,
  );

beforeEach(() => vi.resetAllMocks());

describe('US-47 reject an unfulfillable request', () => {
  it('US-47 AC-1/AC-2: rejects from the event page with a reason and a comment', async () => {
    api.rejectUnfulfillable.mockResolvedValue({
      eventId: 'e1',
      status: 'REJECTED',
      decisionReason: 'No available equipment: All projectors are out.',
      releasedVenueBookings: 1,
      releasedEquipmentReservations: 2,
    });
    renderPanel();
    const user = userEvent.setup();

    await user.click(screen.getByRole('button', { name: 'Reject request' }));
    for (const label of [
      'No suitable venue',
      'No available equipment',
      'No suitable venue or available equipment',
    ]) {
      expect(screen.getByRole('radio', { name: label })).toBeInTheDocument();
    }

    await user.click(screen.getByRole('radio', { name: 'No available equipment' }));
    await user.type(screen.getByLabelText(/Comment/), '  All projectors are out.  ');
    await user.click(screen.getByRole('button', { name: 'Confirm rejection' }));

    await waitFor(() =>
      expect(api.rejectUnfulfillable).toHaveBeenCalledWith('e1', {
        reason: 'NO_AVAILABLE_EQUIPMENT',
        comment: 'All projectors are out.',
      }),
    );
  });

  it('US-47 AC-3: cannot be submitted without a reason, or without a comment', async () => {
    renderPanel();
    const user = userEvent.setup();

    await user.click(screen.getByRole('button', { name: 'Reject request' }));
    const confirm = screen.getByRole('button', { name: 'Confirm rejection' });
    expect(confirm).toBeDisabled();

    await user.type(screen.getByLabelText(/Comment/), 'No hall is free.');
    expect(confirm).toBeDisabled(); // still no reason

    await user.click(screen.getByRole('radio', { name: 'No suitable venue' }));
    await user.clear(screen.getByLabelText(/Comment/));
    await user.type(screen.getByLabelText(/Comment/), '   ');
    expect(confirm).toBeDisabled(); // a blank comment does not count

    expect(api.rejectUnfulfillable).not.toHaveBeenCalled();
  });

  it('US-47 AC-5: warns that bookings and reservations will be released', async () => {
    renderPanel();
    await userEvent.setup().click(screen.getByRole('button', { name: 'Reject request' }));

    expect(screen.getByText(/venue bookings and equipment reservations released/)).toBeInTheDocument();
  });

  it('shows the server refusing it, e.g. from a status that does not allow it', async () => {
    api.rejectUnfulfillable.mockRejectedValue(
      new AxiosError('Conflict', 'ERR_BAD_REQUEST', undefined, undefined, {
        status: 409,
        data: { statusCode: 409, message: 'an event that is CONFIRMED cannot be rejected as unfulfillable' },
      } as AxiosResponse),
    );
    renderPanel();
    const user = userEvent.setup();

    await user.click(screen.getByRole('button', { name: 'Reject request' }));
    await user.click(screen.getByRole('radio', { name: 'No suitable venue' }));
    await user.type(screen.getByLabelText(/Comment/), 'x');
    await user.click(screen.getByRole('button', { name: 'Confirm rejection' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(/cannot be rejected as unfulfillable/);
  });
});
