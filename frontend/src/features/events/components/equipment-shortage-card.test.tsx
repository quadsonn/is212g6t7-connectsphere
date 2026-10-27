import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { equipmentApi } from '@/features/equipment/api/equipment.api';
import type { EventReservationShortage } from '@/types/api';
import { EquipmentShortageCard } from './equipment-shortage-card';

vi.mock('@/features/equipment/api/equipment.api', () => ({
  equipmentApi: { acceptSuggestion: vi.fn(), declineSuggestion: vi.fn() },
}));

const api = vi.mocked(equipmentApi);

const short: EventReservationShortage = {
  reservationId: 'RSV-001',
  equipmentId: 'EQP-001',
  equipmentType: 'Projector',
  quantity: 5,
  shortBy: 3,
  start: '2030-10-01T01:00:00.000Z',
  end: '2030-10-01T04:00:00.000Z',
  openSuggestion: {
    id: 'ESG-001',
    quantity: 3,
    reason: 'Same brightness',
    alternativeEquipment: { id: 'EQP-002', type: 'Laser projector' },
  },
};

const renderCard = (items: EventReservationShortage[] | undefined, canDecide = false) =>
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <EquipmentShortageCard items={items} canDecide={canDecide} />
    </QueryClientProvider>,
  );

beforeEach(() => vi.resetAllMocks());

describe('US-45 equipment shortage on the event page', () => {
  it('US-45 AC-5: flags each short reservation "Short by N"', () => {
    renderCard([short]);
    expect(screen.getByRole('alert')).toHaveTextContent('5 × Projector');
    expect(screen.getByText('Short by 3')).toBeInTheDocument();
    expect(screen.getByRole('alert')).toHaveTextContent('Nothing has been cancelled');
  });

  it('US-45 AC-5: renders nothing once nothing is short (the flag clears)', () => {
    const { container } = renderCard([]);
    expect(container).toBeEmptyDOMElement();
  });

  it('US-45 AC-6: the Organiser sees the shortage but no suggestion to decide', () => {
    renderCard([short], false);
    expect(screen.queryByRole('button', { name: 'Accept' })).not.toBeInTheDocument();
  });

  it('US-45 AC-6: the Coordinator sees the suggestion and accepts it', async () => {
    api.acceptSuggestion.mockResolvedValue({});
    renderCard([short], true);
    const user = userEvent.setup();

    expect(screen.getByText(/Technical Support suggest/)).toHaveTextContent(
      'Technical Support suggest 3 × Laser projector in place of 3 × Projector.',
    );
    expect(screen.getByText('Reason: Same brightness')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Accept' }));
    await waitFor(() => expect(api.acceptSuggestion).toHaveBeenCalledWith('ESG-001'));
  });

  it('US-45 AC-6: the Coordinator declines it', async () => {
    api.declineSuggestion.mockResolvedValue({});
    renderCard([short], true);
    const user = userEvent.setup();

    await user.click(screen.getByRole('button', { name: 'Decline' }));
    await waitFor(() => expect(api.declineSuggestion).toHaveBeenCalledWith('ESG-001'));
  });

  it('US-45 AC-6: shows why an accept was refused (no longer valid)', async () => {
    api.acceptSuggestion.mockRejectedValue({
      isAxiosError: true,
      response: {
        status: 409,
        data: { message: 'This suggestion is no longer valid: only 1 Laser projector are free now.' },
      },
    });
    renderCard([short], true);
    const user = userEvent.setup();

    await user.click(screen.getByRole('button', { name: 'Accept' }));
    expect(await screen.findByText(/no longer valid/)).toBeInTheDocument();
  });
});
