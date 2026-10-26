import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { Equipment, EquipmentAlternative, UpcomingReservation } from '@/types/api';
import { equipmentApi } from '../api/equipment.api';
import { EquipmentStatusPanel } from './equipment-status-panel';

vi.mock('../api/equipment.api', () => ({
  equipmentApi: {
    listUpcomingReservations: vi.fn(),
    changeStatus: vi.fn(),
    listAlternatives: vi.fn(),
  },
}));

const api = vi.mocked(equipmentApi);

const item: Equipment = {
  id: 'eq-1',
  type: 'Wireless microphone',
  description: null,
  location: 'AV Store',
  totalQuantity: 10,
  operationalStatus: 'OPERATIONAL',
  latestStatusChange: null,
};

const reservation = (
  id: string,
  name: string,
  status: UpcomingReservation['event']['status'],
): UpcomingReservation => ({
  id,
  quantity: 2,
  start: '2030-10-01T09:00:00.000Z',
  end: '2030-10-01T17:00:00.000Z',
  status: 'APPROVED',
  event: { id: `e-${id}`, name, status, coordinator: { id: 'c1', name: 'Chris Coordinator' } },
});

const gala = reservation('r-gala', 'Annual Gala', 'CONFIRMED');
const retreat = reservation('r-retreat', 'Team Retreat', 'PLANNING');

const lapel: EquipmentAlternative = {
  id: 'eq-2',
  type: 'Lapel microphone',
  description: null,
  location: 'AV Store',
  totalQuantity: 10,
  availableQuantity: 8,
  sameType: false,
};

const renderPanel = () =>
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <EquipmentStatusPanel item={item} />
    </QueryClientProvider>,
  );

const chooseDamaged = async () => {
  await userEvent.click(screen.getByRole('radio', { name: 'Mark as damaged' }));
  await userEvent.type(screen.getByLabelText(/Reason/), 'Cracked casing.');
};
const saveButton = () => screen.getByRole('button', { name: 'Change to damaged' });

beforeEach(() => {
  vi.resetAllMocks();
  api.listAlternatives.mockResolvedValue([lapel]);
  api.changeStatus.mockResolvedValue({
    equipment: { ...item, operationalStatus: 'OUT_OF_SERVICE' },
    affectedReservations: [],
  });
});

describe('equipment substitution on a confirmed event', () => {
  it('requires a replacement choice before the item can be marked damaged', async () => {
    api.listUpcomingReservations.mockResolvedValue([gala]);
    renderPanel();
    await chooseDamaged();

    const picker = await screen.findByLabelText(/Annual Gala/);
    await waitFor(() => expect(picker).toBeEnabled());
    expect(saveButton()).toBeDisabled();

    await userEvent.selectOptions(picker, 'eq-2');
    expect(saveButton()).toBeEnabled();
  });

  it('offers the dropdown’s items and a "No valid alternative" option', async () => {
    api.listUpcomingReservations.mockResolvedValue([gala]);
    renderPanel();
    await chooseDamaged();

    const picker = await screen.findByLabelText(/Annual Gala/);
    await waitFor(() => expect(picker).toBeEnabled());

    expect(screen.getByRole('option', { name: /Lapel microphone.*8 free/ })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'No valid alternative' })).toBeInTheDocument();
  });

  it('sends the chosen replacement with the status change', async () => {
    api.listUpcomingReservations.mockResolvedValue([gala]);
    renderPanel();
    await chooseDamaged();

    const picker = await screen.findByLabelText(/Annual Gala/);
    await waitFor(() => expect(picker).toBeEnabled());
    await userEvent.selectOptions(picker, 'eq-2');
    await userEvent.click(saveButton());

    await waitFor(() =>
      expect(api.changeStatus).toHaveBeenCalledWith('eq-1', {
        status: 'OUT_OF_SERVICE',
        reason: 'Cracked casing.',
        substitutions: [{ reservationId: 'r-gala', alternativeEquipmentId: 'eq-2' }],
      }),
    );
  });

  it('sends noAlternative when nothing fits, and says so when the list is empty', async () => {
    api.listUpcomingReservations.mockResolvedValue([gala]);
    api.listAlternatives.mockResolvedValue([]);
    renderPanel();
    await chooseDamaged();

    const picker = await screen.findByLabelText(/Annual Gala/);
    await waitFor(() => expect(picker).toBeEnabled());
    expect(screen.getByText(/Nothing in the catalogue has 2 free/)).toBeInTheDocument();

    await userEvent.selectOptions(picker, 'No valid alternative');
    await userEvent.click(saveButton());

    await waitFor(() =>
      expect(api.changeStatus).toHaveBeenCalledWith('eq-1', {
        status: 'OUT_OF_SERVICE',
        reason: 'Cracked casing.',
        substitutions: [{ reservationId: 'r-gala', noAlternative: true }],
      }),
    );
  });

  it('asks for nothing on an event that is not confirmed yet', async () => {
    api.listUpcomingReservations.mockResolvedValue([retreat]);
    renderPanel();
    await chooseDamaged();

    await screen.findByText(/Team Retreat/);
    expect(api.listAlternatives).not.toHaveBeenCalled();
    expect(screen.queryByText(/needs a replacement/)).not.toBeInTheDocument();
    expect(saveButton()).toBeEnabled();

    await userEvent.click(saveButton());
    await waitFor(() =>
      expect(api.changeStatus).toHaveBeenCalledWith('eq-1', {
        status: 'OUT_OF_SERVICE',
        reason: 'Cracked casing.',
      }),
    );
  });

  it('asks only for the confirmed one when both kinds are affected', async () => {
    api.listUpcomingReservations.mockResolvedValue([gala, retreat]);
    renderPanel();
    await chooseDamaged();

    const picker = await screen.findByLabelText(/Annual Gala/);
    await waitFor(() => expect(picker).toBeEnabled());
    expect(screen.queryByLabelText(/Team Retreat/)).not.toBeInTheDocument();
    expect(saveButton()).toBeDisabled();
  });
});
