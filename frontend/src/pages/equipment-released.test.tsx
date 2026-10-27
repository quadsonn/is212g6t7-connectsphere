import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { equipmentApi } from '@/features/equipment/api/equipment.api';
import type { ReleasedReservation } from '@/types/api';
import { EquipmentReleased } from './equipment-released';

/**
 * UI tests for US-32 (Release equipment reservations for a cancelled event):
 * Technical Support's Released reservations page, rendered with React Testing
 * Library, API mocked. What is released, and when, is proven by
 * test/equipment-reservations.e2e-spec.ts; the browser journey by
 * e2e/us32-us35-registrations.spec.ts.
 */

vi.mock('@/features/equipment/api/equipment.api', () => ({ equipmentApi: { listReleased: vi.fn() } }));

const api = vi.mocked(equipmentApi);

const renderPage = () =>
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <MemoryRouter>
        <EquipmentReleased />
      </MemoryRouter>
    </QueryClientProvider>,
  );

beforeEach(() => {
  vi.resetAllMocks();
});

describe('US-32 AC-3: which reservations were released, for which cancelled event', () => {
  // TC-S2-133 · US-32 AC-3 · fails if a released reservation was listed without its event, equipment, quantity or why
  // Code: one row per GET /equipment/reservations/released entry; a CANCELLED event reads "Event cancelled".
  it('lists each released reservation with its event, equipment, quantity and why', async () => {
    api.listReleased.mockResolvedValue([
      {
        id: 'RSV-001',
        quantity: 4,
        start: '2030-10-01T09:00:00.000Z',
        end: '2030-10-01T17:00:00.000Z',
        status: 'RELEASED',
        releasedAt: '2026-10-27T02:00:00.000Z',
        replacedById: null,
        equipment: { id: 'EQP-009', type: 'Wireless microphone' },
        event: { id: 'EVT-060', name: 'Capstone Showcase', status: 'CANCELLED' },
      } as ReleasedReservation,
    ]);
    renderPage();

    const row = (await screen.findByText('Capstone Showcase')).closest('tr')!;
    const cells = within(row).getAllByRole('cell').map((c) => c.textContent);
    expect(cells.slice(0, 4)).toEqual(['Capstone Showcase', 'Wireless microphone', '4', 'Event cancelled']);
  });

  // TC-S2-133 · US-32 AC-3 · fails if an empty list was left blank
  // Code: no rows shows "Nothing released".
  it('says so when nothing has been released', async () => {
    api.listReleased.mockResolvedValue([]);
    renderPage();

    expect(await screen.findByText('Nothing released')).toBeInTheDocument();
  });
});
