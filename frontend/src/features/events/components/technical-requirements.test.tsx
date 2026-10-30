import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { EventRequest, PlanningUpdateResult } from '@/types/api';
import { eventsApi } from '../api/events.api';
import { TechnicalRequirementsCard } from './technical-requirements';

/**
 * UI tests for US-27 (Record equipment and technical requirements needed for an
 * event): the Coordinator's requirements card, rendered with React Testing
 * Library, API mocked. What the server saves and who sees it is proven by
 * test/events-technical-requirements.e2e-spec.ts; the browser journey by
 * e2e/us24-us27-planning.spec.ts.
 */

vi.mock('../api/events.api', () => ({
  eventsApi: { listEquipmentCatalogue: vi.fn(), setTechnicalRequirements: vi.fn() },
}));

const api = vi.mocked(eventsApi);

const CATALOGUE = [
  { id: 'EQP-001', type: 'Laser projector', description: null, location: 'AV store' },
  { id: 'EQP-002', type: 'Wireless microphone', description: 'Handheld', location: null },
];

const event = (overrides: Partial<EventRequest> = {}) =>
  ({ id: 'EVT-001', equipmentRequirements: [], technicalSupportNeeds: null, ...overrides }) as EventRequest;

const renderCard = (e: EventRequest) =>
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <TechnicalRequirementsCard event={e} editable />
    </QueryClientProvider>,
  );

/** What the form sent as its equipment list. */
const sentEquipment = () => api.setTechnicalRequirements.mock.calls[0][1].equipment;

beforeEach(() => {
  vi.resetAllMocks();
  api.listEquipmentCatalogue.mockResolvedValue(CATALOGUE);
  api.setTechnicalRequirements.mockResolvedValue({ change: null } as PlanningUpdateResult);
});

describe('US-27 required equipment is picked from the catalogue', () => {
  // TC-S2-188 · US-27 AC-1 · fails if the picker left out a catalogue item, or gave no way to name one not in it
  // Code: EquipmentRow lists GET /events/equipment-catalogue, then an "Other (not in catalogue)…" option.
  it('US-27 AC-1: offers every catalogue item, then Other', async () => {
    renderCard(event());
    const user = userEvent.setup();

    await user.click(screen.getByRole('button', { name: 'Edit requirements' }));
    await user.click(screen.getByRole('button', { name: 'Add item' }));

    const select = screen.getByRole('combobox', { name: 'Equipment item, row 1' });
    await waitFor(() => expect(select).toBeEnabled());
    expect(within(select).getAllByRole('option').map((o) => o.textContent)).toEqual([
      'Choose from the catalogue…',
      'Laser projector — AV store',
      'Wireless microphone',
      'Other (not in catalogue)…',
    ]);
  });

  // TC-S2-188, TC-S2-89 · US-27 AC-1 · fails if a picked item was sent without its catalogue id or quantity
  // Code: toPayload() sends equipmentId with the catalogue type and the quantity typed.
  it('US-27 AC-1: a picked item is saved as that catalogue item', async () => {
    renderCard(event());
    const user = userEvent.setup();

    await user.click(screen.getByRole('button', { name: 'Edit requirements' }));
    await user.click(screen.getByRole('button', { name: 'Add item' }));
    const select = screen.getByRole('combobox', { name: 'Equipment item, row 1' });
    await waitFor(() => expect(select).toBeEnabled());
    await user.selectOptions(select, 'EQP-001');
    await user.clear(screen.getByLabelText('Quantity, row 1'));
    await user.type(screen.getByLabelText('Quantity, row 1'), '2');
    await user.click(screen.getByRole('button', { name: 'Save requirements' }));

    await waitFor(() => expect(api.setTechnicalRequirements).toHaveBeenCalled());
    expect(sentEquipment()).toEqual([
      { equipmentId: 'EQP-001', equipmentType: 'Laser projector', quantity: 2, notes: null },
    ]);
  });

  // TC-S2-89 · US-27 AC-1 · fails if equipment not in the catalogue could not be recorded, or was sent untrimmed
  // Code: choosing Other shows an "Equipment type" box; toPayload() trims it and sends no equipmentId.
  it('US-27 AC-1: Other shows a text box and saves a free-text line', async () => {
    renderCard(event());
    const user = userEvent.setup();

    await user.click(screen.getByRole('button', { name: 'Edit requirements' }));
    await user.click(screen.getByRole('button', { name: 'Add item' }));
    const select = screen.getByRole('combobox', { name: 'Equipment item, row 1' });
    await waitFor(() => expect(select).toBeEnabled());
    expect(screen.queryByLabelText('Equipment type, row 1')).not.toBeInTheDocument();

    await user.selectOptions(select, 'Other (not in catalogue)…');
    await user.type(screen.getByLabelText('Equipment type, row 1'), '  Smoke machine  ');
    await user.click(screen.getByRole('button', { name: 'Save requirements' }));

    await waitFor(() => expect(api.setTechnicalRequirements).toHaveBeenCalled());
    expect(sentEquipment()).toEqual([{ equipmentType: 'Smoke machine', quantity: 1, notes: null }]);
  });

  // TC-S2-89 · US-27 AC-1 · fails if editing again lost or changed the saved lines
  // Code: the form starts from event.equipmentRequirements, catalogue lines on their item, others as Other.
  it('US-27: saved lines reopen as they were and are sent back unchanged', async () => {
    renderCard(
      event({
        equipmentRequirements: [
          { id: 'REQ-001', equipmentId: 'EQP-002', equipmentType: 'Wireless microphone', quantity: 4, notes: 'Lapel' },
          { id: 'REQ-002', equipmentId: null, equipmentType: 'Smoke machine', quantity: 1, notes: null },
        ],
      }),
    );
    const user = userEvent.setup();

    await user.click(screen.getByRole('button', { name: 'Edit requirements' }));
    await waitFor(() => expect(screen.getByRole('combobox', { name: 'Equipment item, row 1' })).toBeEnabled());
    expect(screen.getByRole('combobox', { name: 'Equipment item, row 1' })).toHaveValue('EQP-002');
    expect(screen.getByLabelText('Equipment type, row 2')).toHaveValue('Smoke machine');

    await user.click(screen.getByRole('button', { name: 'Save requirements' }));

    await waitFor(() => expect(api.setTechnicalRequirements).toHaveBeenCalled());
    expect(sentEquipment()).toEqual([
      { equipmentId: 'EQP-002', equipmentType: 'Wireless microphone', quantity: 4, notes: 'Lapel' },
      { equipmentType: 'Smoke machine', quantity: 1, notes: null },
    ]);
  });

  // TC-S2-90 · US-27 AC-1 · fails if an empty row were sent as a line with no type
  // Code: toPayload() drops rows with neither an item nor a type.
  it('US-27: a row left on "Choose from the catalogue…" is ignored', async () => {
    renderCard(event());
    const user = userEvent.setup();

    await user.click(screen.getByRole('button', { name: 'Edit requirements' }));
    await user.click(screen.getByRole('button', { name: 'Add item' }));
    await user.click(screen.getByRole('button', { name: 'Save requirements' }));

    await waitFor(() => expect(api.setTechnicalRequirements).toHaveBeenCalled());
    expect(sentEquipment()).toEqual([]);
  });
});

describe('US-27 AC-2, AC-3: technical support needed, and what is shown once saved', () => {
  // TC-S2-91 · US-27 AC-2 · fails if the technical support description typed was not sent with the requirements
  // Code: the "Technical support needed" box is sent as technicalSupportNeeds.
  it('US-27 AC-2: sends the technical support needed', async () => {
    renderCard(event());
    const user = userEvent.setup();

    await user.click(screen.getByRole('button', { name: 'Edit requirements' }));
    await user.type(screen.getByLabelText(/Technical support needed/), 'On-site AV technician; hybrid setup with Zoom');
    await user.click(screen.getByRole('button', { name: 'Save requirements' }));

    await waitFor(() => expect(api.setTechnicalRequirements).toHaveBeenCalled());
    expect(api.setTechnicalRequirements.mock.calls[0][1]).toMatchObject({
      technicalSupportNeeds: 'On-site AV technician; hybrid setup with Zoom',
    });
  });

  // TC-S2-93 · US-27 AC-3 · fails if the recorded equipment or support needs were not shown on the event
  // Code: TechnicalRequirementsView lists each line as "N × type" with its notes, and the support needs.
  it('US-27 AC-3: shows the recorded equipment and support needs', async () => {
    renderCard(
      event({
        equipmentRequirements: [
          { id: 'REQ-001', equipmentId: null, equipmentType: 'Laser projector', quantity: 2, notes: null },
        ],
        technicalSupportNeeds: 'Hybrid setup',
      }),
    );

    expect(await screen.findByText(/Laser projector/)).toBeInTheDocument();
    expect(screen.getByText('Hybrid setup')).toBeInTheDocument();
  });
});
