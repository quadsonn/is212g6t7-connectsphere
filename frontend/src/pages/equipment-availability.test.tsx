import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { equipmentApi } from '@/features/equipment/api/equipment.api';
import type { EquipmentListItem, ItemAvailability } from '@/types/api';
import { EquipmentAvailability } from './equipment-availability';

/**
 * UI tests for US-29 (Check equipment availability for an event's date and
 * time): the Check availability page, rendered with React Testing Library,
 * API mocked. The counts themselves are proven by
 * test/equipment-availability.e2e-spec.ts; the browser journey by
 * e2e/us28-us31-equipment.spec.ts.
 */

vi.mock('@/features/equipment/api/equipment.api', () => ({
  equipmentApi: { listCatalogue: vi.fn(), checkAvailability: vi.fn() },
}));

const api = vi.mocked(equipmentApi);

/** 1 Oct 2030, 09:00-17:00 Singapore time (tc-s2-103-setup.sql's window). */
const START = '2030-10-01T01:00:00.000Z';
const END = '2030-10-01T09:00:00.000Z';

const CATALOGUE: EquipmentListItem[] = [
  { id: 'EQP-004', type: 'Wireless microphone', description: null, location: null, totalQuantity: 24 },
  { id: 'EQP-005', type: 'Portable PA system', description: null, location: null, totalQuantity: 6 },
];

const result = (equipmentId: string, type: string, requested: number, available: number, reserved: number, total: number) =>
  ({
    equipmentId,
    type,
    operationalStatus: 'OPERATIONAL',
    start: START,
    end: END,
    requestedQuantity: requested,
    totalQuantity: total,
    unavailableQuantity: 0,
    reservedQuantity: reserved,
    availableQuantity: available,
    fullyAvailable: requested <= available,
    shortfall: Math.max(0, requested - available),
  }) as ItemAvailability;

const renderPage = (search: string) =>
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <MemoryRouter initialEntries={[`/equipment/availability?${search}`]}>
        <EquipmentAvailability />
      </MemoryRouter>
    </QueryClientProvider>,
  );

beforeEach(() => {
  vi.resetAllMocks();
  api.listCatalogue.mockResolvedValue(CATALOGUE);
  // tc-s2-106: 10 microphones and 4 PA systems already committed at an overlapping time.
  api.checkAvailability.mockImplementation(async (id, { quantity }) =>
    id === 'EQP-004'
      ? result('EQP-004', 'Wireless microphone', quantity, 14, 10, 24)
      : result('EQP-005', 'Portable PA system', quantity, 2, 4, 6),
  );
});

describe('US-29 AC-1, AC-2, AC-4, AC-5: several types for one date and time', () => {
  // TC-S2-113 · US-29 AC-1, AC-2, AC-4, AC-5 · fails if a second type was not checked for the same window, or a row lacked its free count, the units reserved elsewhere, or its shortfall
  // Code: each filled row is one GET /equipment/:id/availability for the same start and end; the results
  // table shows Available, Reserved for overlapping events and Shortfall per type, with a summary line.
  it('checks each type for the same window and shows each one’s free count and shortfall', async () => {
    const user = userEvent.setup();
    renderPage(new URLSearchParams({ start: START, end: END, equipmentId: 'EQP-004', quantity: '12' }).toString());
    await screen.findByRole('option', { name: 'Portable PA system' });

    await user.click(screen.getByRole('button', { name: 'Add another equipment type' }));
    await user.selectOptions(screen.getByLabelText('Equipment type 2'), 'EQP-005');
    await user.clear(screen.getByLabelText('Quantity for equipment type 2'));
    await user.type(screen.getByLabelText('Quantity for equipment type 2'), '4');
    await user.click(screen.getByRole('button', { name: 'Check availability' }));

    await waitFor(() => expect(api.checkAvailability).toHaveBeenCalledTimes(2));
    expect(api.checkAvailability).toHaveBeenCalledWith('EQP-004', { start: START, end: END, quantity: 12 });
    expect(api.checkAvailability).toHaveBeenCalledWith('EQP-005', { start: START, end: END, quantity: 4 });

    expect(await screen.findByText('1 of 2 requested types are not fully available.')).toBeInTheDocument();
    const cells = (type: string) =>
      within(screen.getByRole('cell', { name: type }).closest('tr')!).getAllByRole('cell').map((c) => c.textContent);
    // Type, Requested, Available, Shortfall, Reserved, Damaged / maintenance, Total, Result
    expect(cells('Wireless microphone')).toEqual(['Wireless microphone', '12', '14', 'None', '10', '0', '24', 'Available']);
    expect(cells('Portable PA system')).toEqual(['Portable PA system', '4', '2', '2 short', '4', '0', '6', 'Short by 2']);
  });
});

describe('US-29 AC-1: the check needs a date, time and type', () => {
  // TC-S2-105 · US-29 AC-1 · fails if a check with an end before its start was sent
  // Code: windowError flags "The end must be after the start." and disables Check availability.
  it('refuses an end before the start, without asking the server', async () => {
    renderPage(new URLSearchParams({ start: END, end: START, equipmentId: 'EQP-004' }).toString());

    expect(await screen.findByText('The end must be after the start.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Check availability' })).toBeDisabled();
    expect(api.checkAvailability).not.toHaveBeenCalled();
  });
});
