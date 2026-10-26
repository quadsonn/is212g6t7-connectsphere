import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AxiosError } from 'axios';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { CoordinatorRequestView, PlanningUpdateResult } from '@/types/api';
import { eventsApi } from '../api/events.api';
import { PlanningEditForm } from './planning-edit-form';

/**
 * UI tests for US-24 (Update event information during planning): the
 * Coordinator's edit form, rendered with React Testing Library, API mocked.
 * What the server saves and flags is proven by
 * test/events-planning-history.e2e-spec.ts; the browser journey by
 * e2e/us24-us27-planning.spec.ts.
 */

vi.mock('../api/events.api', () => ({ eventsApi: { updatePlanning: vi.fn() } }));

const api = vi.mocked(eventsApi);

/** tc-s2-68-setup.sql's event in planning: 1 Oct 2030, 320 expected. */
const event = {
  id: 'EVT-105',
  name: 'Freshman Orientation 2030',
  category: 'Student engagement',
  purpose: 'Welcome new students',
  description: 'Full-day programme',
  programme: null,
  proposedStart: '2030-10-01T01:00:00.000Z',
  proposedEnd: '2030-10-01T09:00:00.000Z',
  expectedAttendance: 320,
  preferredLayout: null,
  layoutNotes: null,
  accessibilityRequirements: [],
  accessibilityNotes: null,
  equipmentNeeds: 'Two projectors',
  registrationEnabled: false,
} as unknown as CoordinatorRequestView;

const renderForm = (onSaved = vi.fn()) => {
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <PlanningEditForm event={event} onSaved={onSaved} onCancel={vi.fn()} />
    </QueryClientProvider>,
  );
  return onSaved;
};

beforeEach(() => {
  vi.resetAllMocks();
});

describe('US-24 AC-1: the edited fields are saved', () => {
  // TC-S2-68 · US-24 AC-1 · fails if Save could be pressed with nothing changed, or untouched fields were sent
  // Code: dirtyPayload() sends only the fields that differ from the event; Save is disabled while it is empty.
  it('sends only the programme and attendance the Coordinator changed', async () => {
    const user = userEvent.setup();
    api.updatePlanning.mockResolvedValue({ ...event, change: null } as PlanningUpdateResult);
    const onSaved = renderForm();
    const save = screen.getByRole('button', { name: 'Save changes' });
    expect(save).toBeDisabled();

    await user.type(screen.getByLabelText('Programme'), '09:00 Welcome');
    await user.selectOptions(screen.getByLabelText(/Expected attendance/), '500');
    await user.click(save);

    await waitFor(() => expect(onSaved).toHaveBeenCalled());
    expect(api.updatePlanning).toHaveBeenCalledWith('EVT-105', {
      programme: '09:00 Welcome',
      expectedAttendance: 500,
    });
  });
});

describe('US-24 AC-1: an invalid edit is explained', () => {
  // TC-S2-69 · US-24 AC-1 · fails if the server's reason for refusing an edit was not shown at the field
  // Code: fieldErrors() matches each 400 message to its field; the field is marked aria-invalid.
  it('shows the refusal next to the field it is about', async () => {
    const user = userEvent.setup();
    api.updatePlanning.mockRejectedValue(
      new AxiosError('Bad Request', 'ERR_BAD_REQUEST', undefined, undefined, {
        status: 400,
        data: { statusCode: 400, message: ['name should not be empty'] },
      } as never),
    );
    const onSaved = renderForm();

    await user.clear(screen.getByLabelText(/Event name/));
    await user.click(screen.getByRole('button', { name: 'Save changes' }));

    await waitFor(() => expect(screen.getByLabelText(/Event name/)).toHaveAttribute('aria-invalid', 'true'));
    expect(api.updatePlanning).toHaveBeenCalledWith('EVT-105', { name: '' });
    expect(onSaved).not.toHaveBeenCalled();
  });
});
