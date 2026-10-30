import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { Equipment, EquipmentCondition, UpcomingReservation } from '@/types/api';
import { equipmentApi } from '../api/equipment.api';
import { EquipmentStatusPanel } from './equipment-status-panel';

vi.mock('../api/equipment.api', () => ({
  equipmentApi: { listUpcomingReservations: vi.fn(), changeStatus: vi.fn() },
}));

const api = vi.mocked(equipmentApi);

const item: Equipment = {
  id: 'eq-1',
  type: 'Projector',
  description: null,
  location: 'AV Store',
  totalQuantity: 10,
  operationalStatus: 'OPERATIONAL',
  latestStatusChange: null,
};

const allWorking: EquipmentCondition = {
  equipmentId: 'eq-1',
  totalQuantity: 10,
  workingQuantity: 10,
  damagedQuantity: 0,
  maintenanceQuantity: 0,
};

const twoDamaged: EquipmentCondition = { ...allWorking, workingQuantity: 8, damagedQuantity: 2 };

const gala = (shortBy: number, shortByAfter: number): UpcomingReservation => ({
  id: 'r1',
  quantity: 9,
  start: '2030-10-01T09:00:00.000Z',
  end: '2030-10-01T17:00:00.000Z',
  status: 'APPROVED',
  event: {
    id: 'e1',
    name: 'Annual Gala',
    status: 'PLANNING',
    coordinator: { id: 'c1', name: 'Chris Coordinator' },
  },
  shortBy,
  shortByAfter,
  openSuggestion: null,
  noAlternative: null,
});

const renderPanel = (condition: EquipmentCondition) =>
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <EquipmentStatusPanel item={item} condition={condition} />
    </QueryClientProvider>,
  );

const setQuantity = async (user: ReturnType<typeof userEvent.setup>, value: string) => {
  const input = screen.getByLabelText(/Quantity/);
  await user.clear(input);
  await user.type(input, value);
};

beforeEach(() => vi.resetAllMocks());

describe('US-45 equipment status panel (by quantity)', () => {
  // TC-S3-92 · US-45 AC-5 · fails if the panel does not show the units by condition
  // Code: EquipmentStatusPanel -> ConditionSummary
  it('US-45: shows the units by condition, e.g. "8 available, 2 damaged, 0 under maintenance"', () => {
    renderPanel(twoDamaged);
    expect(screen.getByLabelText('Units by condition')).toHaveTextContent(
      '8 available, 2 damaged, 0 under maintenance',
    );
  });

  // TC-S3-91 · US-45 AC-4 · fails if a move with no units to move is offered
  // Code: EquipmentStatusPanel (move options)
  it('US-45 AC-1/AC-3: offers only moves with units to move', () => {
    renderPanel(allWorking);
    expect(screen.getByRole('radio', { name: 'Mark as damaged' })).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: 'Mark as under maintenance' })).toBeInTheDocument();
    // Nothing is damaged or under maintenance, so nothing to repair.
    expect(screen.queryByRole('radio', { name: 'Repair damaged' })).not.toBeInTheDocument();
    expect(screen.queryByRole('radio', { name: 'Return from maintenance' })).not.toBeInTheDocument();
  });

  // TC-S3-88, TC-S3-89 · US-45 AC-1, AC-2 · fails if the quantity or the trimmed reason is not sent
  // Code: EquipmentStatusPanel -> changeStatus
  it('US-45 AC-1/AC-2: mark 2 of 10 damaged — the quantity and trimmed reason are sent', async () => {
    api.listUpcomingReservations.mockResolvedValue([]);
    api.changeStatus.mockResolvedValue({ equipment: item, condition: twoDamaged, affectedReservations: [] });
    renderPanel(allWorking);
    const user = userEvent.setup();

    await user.click(screen.getByRole('radio', { name: 'Mark as damaged' }));
    await setQuantity(user, '2');
    const save = screen.getAllByRole('button', { name: 'Mark as damaged' }).at(-1)!;
    await waitFor(() => expect(save).toBeDisabled()); // no reason yet

    await user.type(screen.getByLabelText(/Reason/), '  Cracked lens  ');
    await waitFor(() => expect(save).toBeEnabled());
    await user.click(save);

    await waitFor(() =>
      expect(api.changeStatus).toHaveBeenCalledWith('eq-1', {
        from: 'OPERATIONAL',
        to: 'OUT_OF_SERVICE',
        quantity: 2,
        reason: 'Cracked lens',
      }),
    );
    expect(await screen.findByRole('status')).toHaveTextContent('2 units moved from working to damaged');
  });

  // TC-S3-93 · US-45 AC-6 · fails if the warning does not list the reservations left short, with how many
  // Code: EquipmentStatusPanel (useUpcomingReservations preview)
  it('US-45 AC-5: before saving, lists the reservations the change would leave short, with how many', async () => {
    api.listUpcomingReservations.mockResolvedValue([gala(0, 1)]);
    renderPanel(allWorking);
    const user = userEvent.setup();

    await user.click(screen.getByRole('radio', { name: 'Mark as damaged' }));
    await setQuantity(user, '2');

    const warning = await screen.findByRole('alert');
    expect(warning).toHaveTextContent("can't cover 1 upcoming reservation");
    expect(warning).toHaveTextContent('not cancelled or reassigned');
    expect(warning).toHaveTextContent('Annual Gala');
    expect(warning).toHaveTextContent('9 reserved · short by 1');
    expect(api.listUpcomingReservations).toHaveBeenLastCalledWith('eq-1', {
      from: 'OPERATIONAL',
      to: 'OUT_OF_SERVICE',
      quantity: 2,
    });
  });

  // TC-S3-93 · US-45 AC-6 · fails if a reservation not made shorter is listed as affected
  // Code: EquipmentStatusPanel (shortByAfter > shortBy)
  it('US-45 AC-5: a reservation already short by as much is not listed as affected', async () => {
    api.listUpcomingReservations.mockResolvedValue([gala(1, 1)]);
    renderPanel(twoDamaged);
    const user = userEvent.setup();

    await user.click(screen.getByRole('radio', { name: 'Mark as under maintenance' }));
    expect(await screen.findByText('The remaining units still cover every upcoming reservation.')).toBeInTheDocument();
  });

  // TC-S3-90 · US-45 AC-3 · fails if setting units back does not send the quantity
  // Code: EquipmentStatusPanel -> changeStatus
  it('US-45 AC-3: repair a quantity of damaged units', async () => {
    api.changeStatus.mockResolvedValue({ equipment: item, condition: allWorking, affectedReservations: [] });
    renderPanel(twoDamaged);
    const user = userEvent.setup();

    await user.click(screen.getByRole('radio', { name: 'Repair damaged' }));
    await setQuantity(user, '2');
    await user.type(screen.getByLabelText(/Reason/), 'Lenses replaced');
    await user.click(screen.getAllByRole('button', { name: 'Repair damaged' }).at(-1)!);

    await waitFor(() =>
      expect(api.changeStatus).toHaveBeenCalledWith('eq-1', {
        from: 'OUT_OF_SERVICE',
        to: 'OPERATIONAL',
        quantity: 2,
        reason: 'Lenses replaced',
      }),
    );
    // A repair frees units, so nothing is checked for shortages first.
    expect(api.listUpcomingReservations).not.toHaveBeenCalled();
  });

  // TC-S3-91 · US-45 AC-4 · fails if the server's refusal is not shown
  // Code: EquipmentStatusPanel (error message)
  it('US-45 AC-1: shows the server refusing more units than are working', async () => {
    api.listUpcomingReservations.mockResolvedValue([]);
    api.changeStatus.mockRejectedValue({
      isAxiosError: true,
      response: { status: 409, data: { message: "Only 8 of 10 Projector are working, so 9 can't be marked damaged." } },
    });
    renderPanel(twoDamaged);
    const user = userEvent.setup();

    await user.click(screen.getByRole('radio', { name: 'Mark as damaged' }));
    await setQuantity(user, '9');
    await user.type(screen.getByLabelText(/Reason/), 'Dropped');
    await user.click(screen.getAllByRole('button', { name: 'Mark as damaged' }).at(-1)!);

    expect(await screen.findByText(/can't be marked damaged/)).toBeInTheDocument();
  });

  // TC-S3-93, TC-S3-94 · US-45 AC-6, AC-7 · fails if the reservations made short are not shown after saving
  // Code: EquipmentStatusPanel (affectedReservations)
  it('US-45 AC-5: after saving, shows the reservations the server found short', async () => {
    api.listUpcomingReservations.mockResolvedValue([gala(0, 1)]);
    api.changeStatus.mockResolvedValue({
      equipment: item,
      condition: twoDamaged,
      affectedReservations: [gala(1, 1)],
    });
    renderPanel(allWorking);
    const user = userEvent.setup();

    await user.click(screen.getByRole('radio', { name: 'Mark as damaged' }));
    await setQuantity(user, '2');
    await user.type(screen.getByLabelText(/Reason/), 'Cracked lens');
    await screen.findByRole('alert');
    await user.click(screen.getAllByRole('button', { name: 'Mark as damaged' }).at(-1)!);

    const saved = await screen.findByRole('status');
    expect(saved).toHaveTextContent('1 upcoming reservation is now short');
    expect(saved).toHaveTextContent('Nothing was cancelled');
    expect(saved).toHaveTextContent('Annual Gala');
  });
});
