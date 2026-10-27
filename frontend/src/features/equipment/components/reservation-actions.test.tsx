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
    recordNoAlternative: vi.fn(),
  },
}));

const api = vi.mocked(equipmentApi);

const renderActions = (canSuggest = true, noAlternative: { id: string; reason: string; createdAt: string } | null = null) =>
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <ReservationActions
        reservationId="RSV-001"
        quantity={5}
        shortBy={3}
        canSuggest={canSuggest}
        openSuggestion={null}
        noAlternative={noAlternative}
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

  it('US-45 AC-7: "no valid alternative" needs a reason, then is recorded', async () => {
    api.recordNoAlternative.mockResolvedValue({});
    renderActions();
    const user = userEvent.setup();

    await user.click(screen.getByRole('button', { name: 'No valid alternative' }));
    const save = screen.getByRole('button', { name: 'Record no valid alternative' });
    expect(save).toBeDisabled();

    await user.type(screen.getByLabelText(/Reason/), 'Nothing that bright');
    await user.click(save);
    await waitFor(() =>
      expect(api.recordNoAlternative).toHaveBeenCalledWith('RSV-001', { reason: 'Nothing that bright' }),
    );
  });

  it('US-45 AC-7: once recorded, shows it and does not offer it again', () => {
    renderActions(true, { id: 'ESG-002', reason: 'Nothing that bright', createdAt: '2030-09-01T00:00:00.000Z' });
    expect(screen.getByText('No valid alternative recorded: Nothing that bright')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'No valid alternative' })).not.toBeInTheDocument();
    // An alternative may still be suggested if one turns up.
    expect(screen.getByRole('button', { name: 'Suggest alternative' })).toBeInTheDocument();
  });

  it('US-45 AC-7: "no valid alternative" is not offered for an event that is not confirmed', () => {
    renderActions(false);
    expect(screen.queryByRole('button', { name: 'No valid alternative' })).not.toBeInTheDocument();
  });
});
