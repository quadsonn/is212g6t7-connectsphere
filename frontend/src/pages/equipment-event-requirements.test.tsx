import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AxiosError } from 'axios';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { equipmentApi } from '@/features/equipment/api/equipment.api';
import type { CommittedReservation, EquipmentListItem, EventRequirements } from '@/types/api';
import { EquipmentEventRequirements } from './equipment-event-requirements';

/**
 * UI tests for US-30 (View equipment and technical requirements described for
 * an event) and US-31 (Reserve available equipment for an event): one event's
 * requirements page, with its commit form, rendered with React Testing
 * Library, API mocked. The server's rules are proven by
 * test/equipment-requirements.e2e-spec.ts and
 * test/equipment-reservations.e2e-spec.ts; the browser journey by
 * e2e/us28-us31-equipment.spec.ts.
 */

vi.mock('@/features/equipment/api/equipment.api', () => ({
  equipmentApi: { getRequirements: vi.fn(), listCatalogue: vi.fn(), commitReservation: vi.fn() },
}));

const api = vi.mocked(equipmentApi);

/** tc-s2-114-setup.sql's "All Three": every requirement source filled in. */
const allThree = {
  eventId: 'EVT-115',
  name: 'All Three',
  description: null,
  status: 'PLANNING',
  proposedStart: '2030-10-01T09:00:00.000Z',
  proposedEnd: '2030-10-01T17:00:00.000Z',
  organiserEquipmentNeeds: 'Two projectors and a lectern.',
  coordinatorRequirements: [{ id: 'REQ-001', equipmentType: 'Portable PA system', quantity: 1, notes: 'Stage left' }],
  technicalSupportNeeds: 'Hybrid setup with Zoom.',
  hasRequirements: true,
  message: null,
} as unknown as EventRequirements;

const CATALOGUE: EquipmentListItem[] = [
  { id: 'EQP-009', type: 'Wireless microphone', description: null, location: 'AV Store', totalQuantity: 10 },
];

const renderPage = (eventId = 'EVT-115') =>
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <MemoryRouter initialEntries={[`/equipment/requirements/${eventId}`]}>
        <Routes>
          <Route path="/equipment/requirements/:eventId" element={<EquipmentEventRequirements />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );

/** Chooses the microphone and a quantity, then commits. */
async function commit(user: ReturnType<typeof userEvent.setup>, quantity: string) {
  await screen.findByRole('option', { name: 'Wireless microphone — AV Store' });
  await user.selectOptions(screen.getByLabelText(/Equipment item/), 'EQP-009');
  await user.clear(screen.getByLabelText(/Quantity/));
  await user.type(screen.getByLabelText(/Quantity/), quantity);
  await user.click(screen.getByRole('button', { name: 'Commit to this event' }));
}

beforeEach(() => {
  vi.resetAllMocks();
  api.getRequirements.mockResolvedValue(allThree);
  api.listCatalogue.mockResolvedValue(CATALOGUE);
});

describe('US-30 AC-1, AC-2, AC-3: what was asked for, or that nothing was', () => {
  // TC-S2-120 · US-30 AC-1, AC-2 · fails if a source's content was missing, or only its existence shown
  // Code: RequirementsView shows the Organiser's needs, the Coordinator's rows (type, quantity, notes) and the support notes.
  it('shows each requirement source in full', async () => {
    renderPage();

    expect(await screen.findByText('Two projectors and a lectern.')).toBeInTheDocument();
    expect(screen.getByRole('row', { name: 'Portable PA system 1 Stage left' })).toBeInTheDocument();
    expect(screen.getByText('Hybrid setup with Zoom.')).toBeInTheDocument();
  });

  // TC-S2-117 · US-30 AC-3 · fails if an event with nothing recorded showed an empty card
  // Code: with hasRequirements false, RequirementsView shows the server's message as a note.
  it('says plainly when nothing has been recorded', async () => {
    api.getRequirements.mockResolvedValue({
      ...allThree,
      organiserEquipmentNeeds: null,
      coordinatorRequirements: [],
      technicalSupportNeeds: null,
      hasRequirements: false,
      message: 'No equipment or technical requirements have been recorded for this event.',
    } as unknown as EventRequirements);
    renderPage();

    expect(await screen.findByRole('note')).toHaveTextContent(
      'No equipment or technical requirements have been recorded for this event.',
    );
  });
});

describe('US-31 AC-1, AC-3: committing equipment from the event', () => {
  // TC-S2-121 · US-31 AC-1 · fails if the chosen item and quantity were not committed to this event, or no confirmation followed
  // Code: CommitForm -> POST /equipment/reservations { eventId, equipmentId, quantity }; success shows "Committed N × type for ...".
  it('commits the chosen item and quantity, and confirms it', async () => {
    const user = userEvent.setup();
    api.commitReservation.mockResolvedValue({
      id: 'RSV-001',
      quantity: 8,
      start: allThree.proposedStart,
      end: allThree.proposedEnd,
      equipment: { id: 'EQP-009', type: 'Wireless microphone' },
    } as unknown as CommittedReservation);
    renderPage();

    await commit(user, '8');

    await waitFor(() => expect(api.commitReservation).toHaveBeenCalled());
    expect(api.commitReservation.mock.calls[0][0]).toEqual({ eventId: 'EVT-115', equipmentId: 'EQP-009', quantity: 8 });
    expect(await screen.findByRole('status')).toHaveTextContent('Committed 8 × Wireless microphone for');
  });

  // TC-S2-121 · US-31 AC-3 · fails if a refused commitment did not show the server's reason
  // Code: commit.isError renders apiErrorMessage(), the 409's message as given.
  it('shows the reason when the quantity is already committed elsewhere', async () => {
    const user = userEvent.setup();
    const reason = 'Only 2 of the 3 Wireless microphone requested are free: 8 of 10 are already committed to an overlapping period.';
    api.commitReservation.mockRejectedValue(
      new AxiosError('Conflict', 'ERR_BAD_REQUEST', undefined, undefined, {
        status: 409,
        data: { statusCode: 409, message: reason },
      } as never),
    );
    renderPage();

    await commit(user, '3');

    expect(await screen.findByText(reason)).toBeInTheDocument();
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  // TC-S2-123 · US-31 AC-1 · fails if a cancelled event still offered to commit equipment
  // Code: NOT_COMMITTABLE replaces the form with a note for CANCELLED, REJECTED and COMPLETED events.
  it('offers no commit form for a cancelled event, and says why', async () => {
    api.getRequirements.mockResolvedValue({ ...allThree, status: 'CANCELLED' } as unknown as EventRequirements);
    renderPage();

    expect(await screen.findByText('This event has been cancelled, so equipment can’t be committed to it.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Commit to this event' })).not.toBeInTheDocument();
  });
});
