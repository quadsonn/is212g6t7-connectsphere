import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { ChangeRequest, OrganiserRequestView } from '@/types/api';
import { eventsApi } from '../api/events.api';
import { ChangeRequestForm } from './change-request-form';

/**
 * UI tests for US-36 (Request an event change): the Organiser's change request
 * form, rendered with React Testing Library, API mocked. The server's rules
 * are proven by test/events-change-request.e2e-spec.ts; the browser journey by
 * e2e/us36-us37-change-requests.spec.ts.
 */

vi.mock('../api/events.api', () => ({
  eventsApi: { listEquipmentCatalogue: vi.fn(), requestChange: vi.fn() },
}));

const api = vi.mocked(eventsApi);

/** An event in planning: 1 Oct 2030 09:00-17:00 Singapore time, 49 expected, 2 microphones. */
const event = {
  id: 'EVT-200',
  name: 'Careers Fair',
  status: 'PLANNING',
  proposedStart: '2030-10-01T01:00:00.000Z',
  proposedEnd: '2030-10-01T09:00:00.000Z',
  expectedAttendance: 49,
  equipmentRequirements: [
    { id: 'REQ-001', equipmentId: 'EQP-001', equipmentType: 'Wireless microphone', quantity: 2, notes: null },
  ],
} as unknown as OrganiserRequestView;

const CATALOGUE = [
  { id: 'EQP-001', type: 'Wireless microphone', description: null, location: 'AV Store' },
  { id: 'EQP-002', type: 'Projector', description: null, location: null },
];

const renderForm = () => {
  const onDone = vi.fn();
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <ChangeRequestForm event={event} onDone={onDone} onCancel={vi.fn()} />
    </QueryClientProvider>,
  );
  return onDone;
};

const sent = () => api.requestChange.mock.calls[0][1];

beforeEach(() => {
  vi.resetAllMocks();
  api.listEquipmentCatalogue.mockResolvedValue(CATALOGUE);
  api.requestChange.mockResolvedValue({ id: 'CRQ-001', status: 'PENDING' } as ChangeRequest);
});

describe('US-36 AC-1, AC-6: the form starts from the event as it is', () => {
  // TC-S2-171 · US-36 AC-1, AC-6 · fails if the form didn't start from the current date, time, attendance and equipment, or the equipment wasn't from the catalogue
  // Code: initial state from event.proposedStart/End, expectedAttendance and the catalogue-linked equipment rows.
  it('shows the current date, time, attendance and equipment, with the catalogue to pick from', async () => {
    renderForm();

    expect(screen.getByLabelText('Start time')).toHaveValue('09:00');
    expect(screen.getByLabelText('End time')).toHaveValue('17:00');
    expect(screen.getByLabelText('Expected attendance')).toHaveValue('49');
    await waitFor(() => expect(screen.getByLabelText('Equipment item, row 1')).toBeEnabled());
    expect(screen.getByLabelText('Equipment item, row 1')).toHaveValue('EQP-001');
    expect(screen.getByLabelText('Quantity, row 1')).toHaveValue(2);
    expect(screen.getByRole('option', { name: 'Projector' })).toBeInTheDocument();
  });
});

describe('US-36 AC-1, AC-2: a reason and a real change are required', () => {
  // TC-S2-171 · US-36 AC-1, AC-2 · fails if a request with no reason, or one that changes nothing, could be sent
  // Code: errors.reason and anyChange block handleSubmit; the messages show after the first submit.
  it('asks for a reason and for at least one change, and sends nothing', async () => {
    const user = userEvent.setup();
    renderForm();

    await user.click(screen.getByRole('button', { name: 'Submit change request' }));

    expect(screen.getByText('A reason is required.')).toBeInTheDocument();
    expect(screen.getByRole('alert')).toHaveTextContent('Change at least one of the date, time, attendance or equipment.');
    expect(api.requestChange).not.toHaveBeenCalled();
  });
});

describe('US-36 AC-5, AC-7: equipment can be added, removed and changed', () => {
  // TC-S2-171 · US-36 AC-7 · fails if a zero quantity could be sent
  // Code: isWholeNumber() flags each row whose quantity isn't a positive whole number.
  it('flags a quantity that is not a positive whole number', async () => {
    const user = userEvent.setup();
    renderForm();
    await waitFor(() => expect(screen.getByLabelText('Equipment item, row 1')).toBeEnabled());

    await user.clear(screen.getByLabelText('Quantity, row 1'));
    await user.type(screen.getByLabelText('Quantity, row 1'), '0');
    await user.type(screen.getByLabelText(/Reason for the change/), 'More speakers');
    await user.click(screen.getByRole('button', { name: 'Submit change request' }));

    expect(screen.getByText('Row 1: quantity must be a positive whole number.')).toBeInTheDocument();
    expect(api.requestChange).not.toHaveBeenCalled();
  });

  // TC-S2-171 · US-36 AC-4, AC-5, AC-8 · fails if the request sent unchanged fields, or lost an equipment change
  // Code: handleSubmit sends only what changed: the attendance, and the whole new equipment list when it differs.
  it('sends only what changed: a new attendance and the edited equipment list', async () => {
    const user = userEvent.setup();
    const onDone = renderForm();
    await waitFor(() => expect(screen.getByLabelText('Equipment item, row 1')).toBeEnabled());

    await user.selectOptions(screen.getByLabelText('Expected attendance'), '199');
    await user.clear(screen.getByLabelText('Quantity, row 1'));
    await user.type(screen.getByLabelText('Quantity, row 1'), '4');
    await user.click(screen.getByRole('button', { name: 'Add item' }));
    await user.selectOptions(screen.getByLabelText('Equipment item, row 2'), 'EQP-002');
    await user.type(screen.getByLabelText(/Reason for the change/), 'More people signed up');
    await user.click(screen.getByRole('button', { name: 'Submit change request' }));

    await waitFor(() => expect(onDone).toHaveBeenCalled());
    expect(api.requestChange).toHaveBeenCalledWith('EVT-200', expect.anything());
    expect(sent()).toEqual({
      reason: 'More people signed up',
      proposedAttendance: 199,
      equipment: [
        { equipmentId: 'EQP-001', quantity: 4 },
        { equipmentId: 'EQP-002', quantity: 1 },
      ],
    });
  });

  // TC-S2-171 · US-36 AC-5 · fails if removing the last item wasn't sent as a change
  // Code: an empty list differs from the current one, so equipment: [] is sent.
  it('sends an empty list when every item is removed', async () => {
    const user = userEvent.setup();
    renderForm();
    await waitFor(() => expect(screen.getByLabelText('Equipment item, row 1')).toBeEnabled());

    await user.click(screen.getByRole('button', { name: 'Remove row 1' }));
    await user.type(screen.getByLabelText(/Reason for the change/), 'Going without mics');
    await user.click(screen.getByRole('button', { name: 'Submit change request' }));

    await waitFor(() => expect(api.requestChange).toHaveBeenCalled());
    expect(sent()).toEqual({ reason: 'Going without mics', equipment: [] });
  });
});
