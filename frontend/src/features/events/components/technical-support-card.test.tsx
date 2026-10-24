import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AxiosError, type AxiosResponse } from 'axios';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { EquipmentAssignments } from '@/pages/equipment-assignments';
import { equipmentApi } from '@/features/equipment/api/equipment.api';
import type { TechnicalSupportAssignmentView } from '@/types/api';
import { eventsApi } from '../api/events.api';
import { TechnicalSupportCard } from './technical-support-card';

vi.mock('../api/events.api', () => ({
  eventsApi: {
    getTechnicalSupport: vi.fn(),
    assignTechnicalSupport: vi.fn(),
    unassignTechnicalSupport: vi.fn(),
  },
}));
vi.mock('@/features/equipment/api/equipment.api', () => ({
  equipmentApi: { listMyAssignments: vi.fn() },
}));

const api = vi.mocked(eventsApi);
const equipment = vi.mocked(equipmentApi);

const wei = { id: 'u1', name: 'Wei Technical', email: 'wei@example.com' };
const nadia = { id: 'u2', name: 'Nadia Technical', email: 'nadia@example.com' };

const view = (overrides: Partial<TechnicalSupportAssignmentView> = {}): TechnicalSupportAssignmentView => ({
  eventId: 'e1',
  requiresTechnicalSupport: true,
  assignable: true,
  assignee: null,
  staff: [
    { ...nadia, available: true, conflicts: [] },
    {
      ...wei,
      available: false,
      conflicts: [
        {
          eventId: 'e2',
          name: 'Product Launch',
          start: '2030-10-01T11:00:00.000Z',
          end: '2030-10-01T13:00:00.000Z',
        },
      ],
    },
  ],
  noneAvailable: false,
  message: null,
  ...overrides,
});

const wrap = (ui: React.ReactNode) =>
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <MemoryRouter>{ui}</MemoryRouter>
    </QueryClientProvider>,
  );

const conflict = (message: string, body: Record<string, unknown> = {}) =>
  new AxiosError('Conflict', '409', undefined, undefined, {
    status: 409,
    data: { statusCode: 409, message, ...body },
  } as AxiosResponse);

beforeEach(() => vi.resetAllMocks());

describe('US-61 assign Technical Support Staff to an event', () => {
  it('US-61 AC-1: the Coordinator assigns an available member', async () => {
    // The refetch after saving reads what the server now holds.
    api.getTechnicalSupport.mockResolvedValueOnce(view()).mockResolvedValue(view({ assignee: nadia }));
    api.assignTechnicalSupport.mockResolvedValue(view({ assignee: nadia }));
    wrap(<TechnicalSupportCard eventId="e1" editable />);
    const user = userEvent.setup();

    await user.click(await screen.findByRole('button', { name: 'Assign Nadia Technical' }));

    await waitFor(() => expect(api.assignTechnicalSupport).toHaveBeenCalledWith('e1', 'u2'));
    expect(await screen.findByText(/Assigned:/)).toHaveTextContent('Assigned: Nadia Technical');
  });

  it('US-61 AC-2: a member on an overlapping event shows the conflict and cannot be chosen', async () => {
    api.getTechnicalSupport.mockResolvedValue(view());
    wrap(<TechnicalSupportCard eventId="e1" editable />);

    const row = (await screen.findByText('Wei Technical')).closest('li')!;
    expect(within(row).getByText(/Already assigned to Product Launch/)).toBeInTheDocument();
    expect(within(row).getByText('Unavailable')).toBeInTheDocument();
    expect(within(row).queryByRole('button')).not.toBeInTheDocument();
  });

  it('US-61 AC-2: a conflict the server finds (taken in the meantime) is shown', async () => {
    api.getTechnicalSupport.mockResolvedValue(view());
    api.assignTechnicalSupport.mockRejectedValue(
      conflict('Nadia Technical is already assigned to "Board Meeting" (1 Oct, 11:30–12:30 UTC), which overlaps this event'),
    );
    wrap(<TechnicalSupportCard eventId="e1" editable />);
    const user = userEvent.setup();

    await user.click(await screen.findByRole('button', { name: 'Assign Nadia Technical' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      /Nadia Technical is already assigned to "Board Meeting"/,
    );
  });

  it('US-61 AC-4: when nobody is available the screen says so and offers no assignment', async () => {
    api.getTechnicalSupport.mockResolvedValue(
      view({
        staff: [
          { ...wei, available: false, conflicts: [] },
          { ...nadia, available: false, conflicts: [] },
        ],
        noneAvailable: true,
        message: 'No Technical Support staff member is available for this date and time.',
      }),
    );
    wrap(<TechnicalSupportCard eventId="e1" editable />);

    expect(
      await screen.findByText('No Technical Support staff member is available for this date and time.'),
    ).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^Assign/ })).not.toBeInTheDocument();
  });

  it('US-61: the Coordinator can remove the assignment', async () => {
    api.getTechnicalSupport.mockResolvedValueOnce(view({ assignee: nadia })).mockResolvedValue(view());
    api.unassignTechnicalSupport.mockResolvedValue(view());
    wrap(<TechnicalSupportCard eventId="e1" editable />);
    const user = userEvent.setup();

    await user.click(await screen.findByRole('button', { name: 'Remove' }));

    await waitFor(() => expect(api.unassignTechnicalSupport).toHaveBeenCalledWith('e1'));
    expect(await screen.findByText('No one is assigned yet.')).toBeInTheDocument();
  });

  it('US-61: read-only when not editable — no assign or remove controls', async () => {
    api.getTechnicalSupport.mockResolvedValue(view({ assignee: nadia }));
    wrap(<TechnicalSupportCard eventId="e1" editable={false} />);

    expect(await screen.findByText(/Assigned:/)).toBeInTheDocument();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });
});

describe('US-61 AC-3 the assigned member’s list', () => {
  it('US-61 AC-3: shows each event’s date, time, venue and technical requirements', async () => {
    equipment.listMyAssignments.mockResolvedValue([
      {
        eventId: 'e1',
        name: 'Town Hall',
        description: null,
        status: 'PLANNING',
        proposedStart: '2030-10-01T10:00:00.000Z',
        proposedEnd: '2030-10-01T12:00:00.000Z',
        organiserEquipmentNeeds: 'A projector',
        coordinatorRequirements: [{ id: 'r1', equipmentType: 'Wireless microphone', quantity: 2, notes: null }],
        technicalSupportNeeds: 'On-site AV technician',
        hasRequirements: true,
        message: null,
        venues: [
          {
            bookingId: 'b1',
            venueName: 'Harbour Hall',
            status: 'APPROVED',
            start: '2030-10-01T09:30:00.000Z',
            end: '2030-10-01T12:30:00.000Z',
          },
        ],
      },
    ]);
    wrap(<EquipmentAssignments />);

    expect(await screen.findByRole('link', { name: 'Town Hall' })).toHaveAttribute(
      'href',
      '/equipment/requirements/e1',
    );
    expect(screen.getByText(/Harbour Hall \(approved\)/)).toBeInTheDocument();
    expect(screen.getByText('On-site AV technician')).toBeInTheDocument();
    expect(screen.getByText('2 × Wireless microphone')).toBeInTheDocument();
    expect(screen.getByText('Date and time:').nextElementSibling?.textContent).toMatch(/\S/);
  });

  it('US-61 AC-3: says so when there are no assignments', async () => {
    equipment.listMyAssignments.mockResolvedValue([]);
    wrap(<EquipmentAssignments />);

    expect(await screen.findByText('No assignments')).toBeInTheDocument();
  });
});
