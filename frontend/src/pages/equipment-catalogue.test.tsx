import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { equipmentApi } from '@/features/equipment/api/equipment.api';
import type { EquipmentListItem } from '@/types/api';
import { EquipmentCatalogue } from './equipment-catalogue';

/**
 * UI tests for US-28 (View the equipment catalogue): Technical Support's
 * catalogue page, rendered with React Testing Library, API mocked. What the
 * server returns for each lookup and sort is proven by
 * test/equipment-browse.e2e-spec.ts; the browser journey by
 * e2e/us28-us31-equipment.spec.ts.
 */

vi.mock('@/features/equipment/api/equipment.api', () => ({ equipmentApi: { listCatalogue: vi.fn() } }));

const api = vi.mocked(equipmentApi);

/** tc-s2-97-setup.sql's catalogue. */
const CATALOGUE: EquipmentListItem[] = [
  { id: 'EQP-012', type: 'Folding table', description: null, location: null, totalQuantity: 40 },
  { id: 'EQP-007', type: 'Projector (4K)', description: 'Ceiling-mountable.', location: 'AV Store, Level 2', totalQuantity: 8 },
  { id: 'EQP-004', type: 'Wireless microphone', description: 'Handheld UHF mic.', location: 'AV Store, Level 1', totalQuantity: 24 },
];

const lastQuery = () => api.listCatalogue.mock.calls.at(-1)?.[0];

const renderPage = () =>
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <MemoryRouter>
        <EquipmentCatalogue />
      </MemoryRouter>
    </QueryClientProvider>,
  );

beforeEach(() => {
  vi.resetAllMocks();
  api.listCatalogue.mockResolvedValue(CATALOGUE);
});

describe('US-28 AC-1, AC-2: every item at a glance, each one opening its details', () => {
  // TC-S2-102 · US-28 AC-1 · fails if a row lacked the type, description, quantity or location, or a missing one showed blank
  // Code: EquipmentCatalogue renders one row per item, with "—" for a missing description or location.
  it('lists each item with its type, description, quantity and location', async () => {
    renderPage();

    const row = (await screen.findByText('Wireless microphone')).closest('tr')!;
    expect(within(row).getAllByRole('cell').map((c) => c.textContent)).toEqual([
      'Wireless microphone',
      'Handheld UHF mic.',
      '24',
      // US-45's Condition column: "—" while the item's condition is not loaded.
      '—',
      'AV Store, Level 1',
    ]);
    const bare = screen.getByText('Folding table').closest('tr')!;
    expect(within(bare).getAllByRole('cell').map((c) => c.textContent)).toEqual(['Folding table', '—', '40', '—', '—']);
  });

  // TC-S2-102 · US-28 AC-2 · fails if an item could only be opened with a mouse
  // Code: each type is a Link to /equipment/inventory/:id (added in this regeneration; the row was click-only).
  it('links each item to its details page', async () => {
    renderPage();

    expect(await screen.findByRole('link', { name: 'Projector (4K)' })).toHaveAttribute('href', '/equipment/inventory/EQP-007');
  });
});

describe('US-28 AC-3: an item can be found without scrolling', () => {
  // TC-S2-102 · US-28 AC-3 · fails if the lookup or sort was not sent to the server
  // Code: the search box, sort field and direction feed useEquipmentCatalogue -> GET /equipment.
  it('looks up by type and sorts by any column, either way', async () => {
    const user = userEvent.setup();
    renderPage();
    await screen.findByText('Folding table');
    expect(lastQuery()).toEqual({ search: undefined, sortBy: 'type', sortOrder: 'asc' });

    await user.type(screen.getByLabelText('Look up equipment by type'), 'mic');
    await waitFor(() => expect(lastQuery()).toMatchObject({ search: 'mic' }));

    await user.selectOptions(screen.getByLabelText('Sort equipment by'), 'totalQuantity');
    await user.click(screen.getByRole('button', { name: /click to sort descending/ }));
    await waitFor(() => expect(lastQuery()).toMatchObject({ sortBy: 'totalQuantity', sortOrder: 'desc' }));
  });

  // TC-S2-102 · US-28 AC-3 · fails if a lookup with no match left an empty table without explanation
  // Code: an empty result while searching shows "No equipment matches that search".
  it('says so when nothing matches the lookup', async () => {
    const user = userEvent.setup();
    renderPage();
    await screen.findByText('Folding table');
    api.listCatalogue.mockResolvedValue([]);

    await user.type(screen.getByLabelText('Look up equipment by type'), 'zzz');

    expect(await screen.findByText('No equipment matches that search')).toBeInTheDocument();
  });
});
