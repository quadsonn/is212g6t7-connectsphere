import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { equipmentApi } from '@/features/equipment/api/equipment.api';
import type { EventRequirements, EventStatus } from '@/types/api';
import { EquipmentDashboard } from './equipment-dashboard';

vi.mock('@/features/equipment/api/equipment.api', () => ({
  equipmentApi: { listRequirements: vi.fn() },
}));

const api = vi.mocked(equipmentApi);

const row = (eventId: string, name: string, status: EventStatus) =>
  ({
    eventId,
    name,
    description: null,
    status,
    proposedStart: '2030-10-01T01:00:00.000Z',
    proposedEnd: '2030-10-01T09:00:00.000Z',
    organiserEquipmentNeeds: 'Two projectors.',
    coordinatorRequirements: [],
    technicalSupportNeeds: null,
    hasRequirements: true,
    message: null,
  }) as EventRequirements;

const ACTIVE = [row('EVT-001', 'Town Hall', 'PLANNING'), row('EVT-002', 'Board Day', 'SAFETY_REJECTED')];
const FINISHED = [
  row('EVT-003', 'Old Gala', 'REJECTED'),
  row('EVT-004', 'Called Off', 'CANCELLED'),
  row('EVT-005', 'Last Year', 'COMPLETED'),
];

const renderPage = () =>
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <MemoryRouter>
        <EquipmentDashboard />
      </MemoryRouter>
    </QueryClientProvider>,
  );

const listItem = (name: string) => screen.getByText(name).closest('li') as HTMLElement;

beforeEach(() => {
  vi.resetAllMocks();
  // The server does the filtering; the mock answers as it would.
  api.listRequirements.mockImplementation(async (includeFinished = false) =>
    includeFinished ? [...ACTIVE, ...FINISHED] : ACTIVE,
  );
});

describe('US-30 AC-4: finished events are left off the requirements list by default', () => {
  it('US-30 AC-4: asks for active events only, with the toggle off', async () => {
    renderPage();

    expect(await screen.findByText('Town Hall')).toBeInTheDocument();
    expect(screen.getByRole('checkbox', { name: 'Show finished events' })).not.toBeChecked();
    expect(api.listRequirements).toHaveBeenCalledWith(false);
    for (const name of ['Old Gala', 'Called Off', 'Last Year']) {
      expect(screen.queryByText(name)).not.toBeInTheDocument();
    }
  });

  it('US-30 AC-4: active events are always shown, including Safety rejected', async () => {
    renderPage();
    const user = userEvent.setup();

    expect(await screen.findByText('Board Day')).toBeInTheDocument();
    await user.click(screen.getByRole('checkbox', { name: 'Show finished events' }));
    expect(await screen.findByText('Old Gala')).toBeInTheDocument();

    expect(screen.getByText('Town Hall')).toBeInTheDocument();
    expect(screen.getByText('Board Day')).toBeInTheDocument();
    expect(within(listItem('Town Hall')).queryByText(/Finished/)).not.toBeInTheDocument();
  });

  it.each([
    ['Old Gala', 'Rejected'],
    ['Called Off', 'Cancelled'],
    ['Last Year', 'Completed'],
  ])('US-30 AC-4: with the toggle on, %s is shown with its %s badge and marked finished', async (name, badge) => {
    renderPage();
    const user = userEvent.setup();

    await screen.findByText('Town Hall');
    await user.click(screen.getByRole('checkbox', { name: 'Show finished events' }));

    expect(await screen.findByText(name)).toBeInTheDocument();
    expect(api.listRequirements).toHaveBeenLastCalledWith(true);
    expect(within(listItem(name)).getByText(badge)).toBeInTheDocument();
    expect(within(listItem(name)).getByText('Finished · no equipment needed')).toBeInTheDocument();
  });
});
