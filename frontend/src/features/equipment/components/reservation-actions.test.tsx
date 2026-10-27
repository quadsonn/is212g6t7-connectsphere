import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { equipmentApi } from '../api/equipment.api';
import { ReservationActions } from './reservation-actions';

vi.mock('../api/equipment.api', () => ({
  equipmentApi: {
    reduceReservation: vi.fn(),
    releaseReservation: vi.fn(),
    listAlternatives: vi.fn(),
    suggestAlternative: vi.fn(),
  },
}));

const api = vi.mocked(equipmentApi);

const renderActions = (canSuggest = true) =>
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <ReservationActions
        reservationId="RSV-001"
        quantity={5}
        shortBy={3}
        canSuggest={canSuggest}
        openSuggestion={null}
      />
    </QueryClientProvider>,
  );

beforeEach(() => vi.resetAllMocks());

describe('US-45 resolving a shortage (Technical Support)', () => {
  it('US-45 AC-6: reducing a reservation needs a reason, then sends the new quantity', async () => {
    api.reduceReservation.mockResolvedValue({});
    renderActions();
    const user = userEvent.setup();

    await user.click(screen.getByRole('button', { name: 'Reduce' }));
    // Defaults to what the working units can cover: 5 - 3.
    expect(screen.getByLabelText(/Reduce to/)).toHaveValue(2);
    const save = screen.getByRole('button', { name: 'Reduce reservation' });
    expect(save).toBeDisabled();

    await user.type(screen.getByLabelText(/Reason/), 'Only 2 working');
    await user.click(save);
    await waitFor(() =>
      expect(api.reduceReservation).toHaveBeenCalledWith('RSV-001', { quantity: 2, reason: 'Only 2 working' }),
    );
  });

  it('US-45 AC-6: releasing a reservation needs a reason', async () => {
    api.releaseReservation.mockResolvedValue({});
    renderActions();
    const user = userEvent.setup();

    await user.click(screen.getByRole('button', { name: 'Release' }));
    const save = screen.getByRole('button', { name: 'Release reservation' });
    expect(save).toBeDisabled();

    await user.type(screen.getByLabelText(/Reason/), 'Event moved to another item');
    await user.click(save);
    await waitFor(() =>
      expect(api.releaseReservation).toHaveBeenCalledWith('RSV-001', { reason: 'Event moved to another item' }),
    );
  });

  it('US-45 AC-7: offers only items available in the needed quantity, and sends the suggestion', async () => {
    api.listAlternatives.mockResolvedValue([
      { equipmentId: 'EQP-002', type: 'Laser projector', location: null, availableQuantity: 4 },
    ]);
    api.suggestAlternative.mockResolvedValue({
      id: 'ESG-001',
      quantity: 3,
      reason: 'x',
      alternativeEquipment: { id: 'EQP-002', type: 'Laser projector' },
    });
    renderActions();
    const user = userEvent.setup();

    await user.click(screen.getByRole('button', { name: 'Suggest alternative' }));
    // The needed quantity defaults to the shortfall.
    await waitFor(() => expect(api.listAlternatives).toHaveBeenCalledWith('RSV-001', 3));
    const select = screen.getByLabelText(/Alternative item/);
    expect(await screen.findByRole('option', { name: 'Laser projector — 4 free' })).toBeInTheDocument();

    await user.selectOptions(select, 'EQP-002');
    await user.type(screen.getByLabelText(/Reason/), 'Same brightness');
    await user.click(screen.getByRole('button', { name: 'Send suggestion' }));
    await waitFor(() =>
      expect(api.suggestAlternative).toHaveBeenCalledWith('RSV-001', {
        alternativeEquipmentId: 'EQP-002',
        quantity: 3,
        reason: 'Same brightness',
      }),
    );
  });

  it('US-45 AC-7: no suggestion is offered for an event that is not confirmed', () => {
    renderActions(false);
    expect(screen.queryByRole('button', { name: 'Suggest alternative' })).not.toBeInTheDocument();
  });
});
