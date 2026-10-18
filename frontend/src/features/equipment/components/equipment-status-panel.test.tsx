import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { Equipment, UpcomingReservation } from '@/types/api';
import { equipmentApi } from '../api/equipment.api';
import { EquipmentStatusPanel } from './equipment-status-panel';

vi.mock('../api/equipment.api', () => ({
  equipmentApi: { listUpcomingReservations: vi.fn(), changeStatus: vi.fn() },
}));

const api = vi.mocked(equipmentApi);

const available: Equipment = {
  id: 'eq-1',
  type: 'Wireless microphone',
  description: null,
  location: 'AV Store',
  totalQuantity: 10,
  operationalStatus: 'OPERATIONAL',
  latestStatusChange: null,
};

const damaged: Equipment = {
  ...available,
  operationalStatus: 'OUT_OF_SERVICE',
  latestStatusChange: {
    id: 'c1',
    fromStatus: 'OPERATIONAL',
    toStatus: 'OUT_OF_SERVICE',
    reason: 'Cracked casing.',
    changedAt: '2030-09-01T09:00:00.000Z',
    changedBy: { id: 'u1', name: 'Nadia Technical' },
  },
};

const gala: UpcomingReservation = {
  id: 'r1',
  quantity: 4,
  start: '2030-10-01T09:00:00.000Z',
  end: '2030-10-01T17:00:00.000Z',
  status: 'APPROVED',
  event: {
    id: 'e1',
    name: 'Annual Gala',
    status: 'PLANNING',
    coordinator: { id: 'c1', name: 'Chris Coordinator' },
  },
};

const renderPanel = (item: Equipment) =>
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <EquipmentStatusPanel item={item} />
    </QueryClientProvider>,
  );

const submitButton = (label: string) => screen.getByRole('button', { name: label });

beforeEach(() => vi.resetAllMocks());

describe('US-45 equipment status panel', () => {
  it('US-45 AC-1: offers Damaged and Under Maintenance for an available item', () => {
    renderPanel(available);

    expect(screen.getByRole('radio', { name: 'Mark as damaged' })).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: 'Mark as under maintenance' })).toBeInTheDocument();
    // Not offered: it is already available.
    expect(screen.queryByRole('radio', { name: 'Set back to available' })).not.toBeInTheDocument();
  });

  it('US-45 AC-2: cannot be saved without a reason, and sends the trimmed reason', async () => {
    api.listUpcomingReservations.mockResolvedValue([]);
    api.changeStatus.mockResolvedValue({ equipment: damaged, affectedReservations: [] });
    renderPanel(available);
    const user = userEvent.setup();

    await user.click(screen.getByRole('radio', { name: 'Mark as damaged' }));
    await screen.findByText(/No upcoming reservations/);
    expect(submitButton('Change to damaged')).toBeDisabled();

    await user.type(screen.getByLabelText(/Reason/), '   ');
    expect(submitButton('Change to damaged')).toBeDisabled();

    await user.type(screen.getByLabelText(/Reason/), 'Cracked casing.  ');
    expect(submitButton('Change to damaged')).toBeEnabled();
    await user.click(submitButton('Change to damaged'));

    await waitFor(() =>
      expect(api.changeStatus).toHaveBeenCalledWith('eq-1', {
        status: 'OUT_OF_SERVICE',
        reason: 'Cracked casing.',
      }),
    );
  });

  it('US-45 AC-2: shows the reason for the current status', () => {
    renderPanel(damaged);

    expect(screen.getByText('Cracked casing.')).toBeInTheDocument();
    expect(screen.getByText(/by Nadia Technical/)).toBeInTheDocument();
  });

  it('US-45 AC-3: a damaged item can be set back to available, without a reservation check', async () => {
    api.changeStatus.mockResolvedValue({ equipment: available, affectedReservations: [] });
    renderPanel(damaged);
    const user = userEvent.setup();

    await user.click(screen.getByRole('radio', { name: 'Set back to available' }));
    await user.type(screen.getByLabelText(/Reason/), 'Repaired.');
    await user.click(submitButton('Change to available'));

    await waitFor(() =>
      expect(api.changeStatus).toHaveBeenCalledWith('eq-1', {
        status: 'OPERATIONAL',
        reason: 'Repaired.',
      }),
    );
    expect(api.listUpcomingReservations).not.toHaveBeenCalled();
    expect(await screen.findByText('Status changed to available.')).toBeInTheDocument();
  });

  it('US-45 AC-5: warns, before saving, with the reservations that would be affected', async () => {
    api.listUpcomingReservations.mockResolvedValue([gala]);
    renderPanel(available);
    const user = userEvent.setup();

    await user.click(screen.getByRole('radio', { name: 'Mark as under maintenance' }));

    expect(await screen.findByText(/1 existing reservation will be affected/)).toBeInTheDocument();
    expect(screen.getByText('Annual Gala')).toBeInTheDocument();
    expect(screen.getByText(/4 units/)).toBeInTheDocument();
    expect(screen.getByText(/Coordinator: Chris Coordinator/)).toBeInTheDocument();
    expect(api.changeStatus).not.toHaveBeenCalled();
  });

  it('US-45 AC-5: after saving, lists the reservations the server found affected', async () => {
    api.listUpcomingReservations.mockResolvedValue([]);
    api.changeStatus.mockResolvedValue({ equipment: damaged, affectedReservations: [gala] });
    renderPanel(available);
    const user = userEvent.setup();

    await user.click(screen.getByRole('radio', { name: 'Mark as damaged' }));
    await screen.findByText(/No upcoming reservations/);
    await user.type(screen.getByLabelText(/Reason/), 'Dropped.');
    await user.click(submitButton('Change to damaged'));

    expect(await screen.findByText(/1 existing reservation is affected/)).toBeInTheDocument();
    expect(screen.getByText('Annual Gala')).toBeInTheDocument();
  });

  it('shows the server error when the change is refused', async () => {
    api.listUpcomingReservations.mockResolvedValue([]);
    api.changeStatus.mockRejectedValue(new Error('network down'));
    renderPanel(available);
    const user = userEvent.setup();

    await user.click(screen.getByRole('radio', { name: 'Mark as damaged' }));
    await screen.findByText(/No upcoming reservations/);
    await user.type(screen.getByLabelText(/Reason/), 'Dropped.');
    await user.click(submitButton('Change to damaged'));

    expect(await screen.findByRole('alert')).toHaveTextContent(/Could not change the status|network down/);
  });
});
