import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { equipmentApi } from '@/features/equipment/api/equipment.api';
import type { EquipmentSubstitution, UnavailableEquipment } from '@/types/api';
import { EquipmentUnavailableNotice } from './equipment-unavailable-notice';

vi.mock('@/features/equipment/api/equipment.api', () => ({
  equipmentApi: { acceptSubstitution: vi.fn(), declineSubstitution: vi.fn() },
}));

const api = vi.mocked(equipmentApi);

const substitution = (overrides: Partial<EquipmentSubstitution> = {}): EquipmentSubstitution => ({
  id: 'SUB-1',
  status: 'PENDING',
  createdAt: '2030-09-01T09:00:00Z',
  decidedAt: null,
  alternativeEquipment: {
    id: 'EQP-2',
    type: 'Lapel microphone',
    description: null,
    location: 'AV Store',
  },
  suggestedBy: { id: 'USR-1', name: 'Nadia Technical' },
  decidedBy: null,
  ...overrides,
});

const item = (sub: EquipmentSubstitution | null): UnavailableEquipment => ({
  reservationId: 'RSV-1',
  equipmentId: 'EQP-1',
  equipmentType: 'Wireless microphone',
  equipmentStatus: 'OUT_OF_SERVICE',
  reservationStatus: 'APPROVED',
  quantity: 2,
  start: '2030-11-01T09:00:00Z',
  end: '2030-11-01T17:00:00Z',
  substitution: sub,
});

const renderNotice = (items: UnavailableEquipment[], canDecide = true) =>
  render(
    <QueryClientProvider client={new QueryClient()}>
      <EquipmentUnavailableNotice items={items} canDecide={canDecide} />
    </QueryClientProvider>,
  );

beforeEach(() => vi.resetAllMocks());

describe('equipment unavailable notice — Technical Support’s proposal', () => {
  it('shows the suggested replacement with Accept and Decline for the Coordinator', () => {
    renderNotice([item(substitution())]);

    expect(screen.getByText(/Nadia Technical/)).toBeInTheDocument();
    expect(screen.getByText(/2 × Lapel microphone/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Accept replacement' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Decline and acknowledge' })).toBeInTheDocument();
  });

  it('accepts the replacement', async () => {
    api.acceptSubstitution.mockResolvedValue(substitution({ status: 'ACCEPTED' }));
    renderNotice([item(substitution())]);

    await userEvent.click(screen.getByRole('button', { name: 'Accept replacement' }));

    await waitFor(() => expect(api.acceptSubstitution).toHaveBeenCalledWith('SUB-1'));
  });

  it('declines and acknowledges', async () => {
    api.declineSubstitution.mockResolvedValue(substitution({ status: 'DECLINED' }));
    renderNotice([item(substitution())]);

    await userEvent.click(screen.getByRole('button', { name: 'Decline and acknowledge' }));

    await waitFor(() => expect(api.declineSubstitution).toHaveBeenCalledWith('SUB-1'));
  });

  it('offers only Acknowledge when there is no valid alternative', async () => {
    api.declineSubstitution.mockResolvedValue(substitution({ status: 'DECLINED' }));
    renderNotice([item(substitution({ alternativeEquipment: null }))]);

    expect(screen.getByText(/no valid alternative/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Accept replacement' })).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Acknowledge' }));
    await waitFor(() => expect(api.declineSubstitution).toHaveBeenCalledWith('SUB-1'));
  });

  it('shows the server’s reason when accepting is refused', async () => {
    api.acceptSubstitution.mockRejectedValue({
      isAxiosError: true,
      response: { data: { message: '"Lapel microphone" no longer has 2 free for this event' } },
    });
    renderNotice([item(substitution())]);

    await userEvent.click(screen.getByRole('button', { name: 'Accept replacement' }));

    expect(await screen.findByText(/no longer has 2 free/)).toBeInTheDocument();
  });

  it('keeps the flag after a decline, marked as acknowledged, with no buttons', () => {
    renderNotice([
      item(substitution({ status: 'DECLINED', decidedBy: { id: 'USR-2', name: 'Chris Coordinator' } })),
    ]);

    expect(screen.getByRole('alert')).toBeInTheDocument();
    expect(screen.getByText(/acknowledged by Chris Coordinator/)).toBeInTheDocument();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('shows the proposal to others, but without the buttons', () => {
    renderNotice([item(substitution())], false);

    expect(screen.getByText(/2 × Lapel microphone/)).toBeInTheDocument();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('shows no proposal line for an item nobody has answered for', () => {
    renderNotice([item(null)]);

    expect(screen.getByText(/2 × Wireless microphone/)).toBeInTheDocument();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });
});
