import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { eventsApi } from '@/features/events/api/events.api';
import {
  EMPTY_EVENT_REQUEST_FORM,
  mapExistingToForm,
  toPayload,
} from '@/features/events/lib/event-request-form';
import type { EventStatus, OrganiserRequestView } from '@/types/api';
import { OrganiserDashboard } from './organiser-dashboard';
import { OrganiserNewRequest } from './organiser-new-request';

/**
 * UI tests for US-05 (View current status of my event request) and US-06
 * (Specify preferred room layout and accessibility requirements): the
 * Organiser's list and the request form, rendered with React Testing
 * Library, API mocked. Server rules: test/events-status-view.e2e-spec.ts and
 * test/events-layout.e2e-spec.ts; browser journeys: e2e/us05-us08-review.spec.ts.
 */

vi.mock('@/features/events/api/events.api', () => {
  const fns: Record<string, ReturnType<typeof vi.fn>> = {};
  return {
    eventsApi: new Proxy(fns, {
      get: (target, key: string) => (target[key] ??= vi.fn().mockResolvedValue([])),
    }),
  };
});
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const api = vi.mocked(eventsApi);

const request = (
  id: string,
  name: string,
  status: EventStatus,
  decision: { outcome: EventStatus; reason: string | null } | null = null,
): OrganiserRequestView =>
  ({
    id,
    name,
    purpose: 'Purpose',
    status,
    proposedStart: null,
    proposedEnd: null,
    expectedAttendance: null,
    accessibilityRequirements: [],
    statusView: { status, isTerminal: false, decision, clarificationRequested: false },
  }) as unknown as OrganiserRequestView;

const renderAt = (path: string) =>
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/organiser" element={<OrganiserDashboard />} />
          <Route path="/organiser/new" element={<OrganiserNewRequest />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );

beforeEach(() => {
  vi.clearAllMocks();
  api.listMine.mockResolvedValue([]);
});

describe('US-05: the Organiser’s list shows each request’s status', () => {
  // TC-S1-80 · US-05 AC-1 · fails if a request's badge showed a status other than its own
  // Code: OrganiserDashboard renders EventStatusBadge(status) on every row of GET /events/mine.
  it('AC-1: Given requests in several states, Then each row shows its own status', async () => {
    api.listMine.mockResolvedValue([
      request('EVT-1', 'Gala', 'UNDER_REVIEW'),
      request('EVT-2', 'Fair', 'APPROVED'),
      request('EVT-3', 'Talk', 'CANCELLED'),
    ]);
    renderAt('/organiser');

    const rowOf = async (name: string) => (await screen.findByText(name)).closest('tr') as HTMLElement;
    expect(within(await rowOf('Gala')).getByText('Under review')).toBeInTheDocument();
    expect(within(await rowOf('Fair')).getByText('Approved')).toBeInTheDocument();
    expect(within(await rowOf('Talk')).getByText('Cancelled')).toBeInTheDocument();
  });

  // TC-S1-80 · US-05 AC-2 · fails if a rejected request's row did not show the Coordinator's reason
  // Code: the list prints statusView.decision.reason under a REJECTED badge.
  it('AC-2: Given a rejected request, Then its row shows the Coordinator’s reason', async () => {
    api.listMine.mockResolvedValue([
      request('EVT-4', 'Concert', 'REJECTED', { outcome: 'REJECTED', reason: 'Clashes with exams' }),
    ]);
    renderAt('/organiser');

    const row = (await screen.findByText('Concert')).closest('tr') as HTMLElement;
    expect(within(row).getByText('Rejected')).toBeInTheDocument();
    expect(within(row).getByText('Clashes with exams')).toBeInTheDocument();
  });
});

describe('US-06: layout and accessibility on the request form', () => {
  // TC-S1-81 · US-06 AC-1 · fails if the predefined layouts were not offered as a list
  // Code: the Preferred layout <Select> lists ROOM_LAYOUTS, plus "No preference" and "Other".
  it('AC-1: Then the layout is chosen from a predefined list including theatre, classroom, banquet and boardroom', () => {
    renderAt('/organiser/new');

    const options = within(screen.getByLabelText('Preferred layout')).getAllByRole('option').map((o) => o.textContent);
    expect(options).toEqual(expect.arrayContaining(['Theatre', 'Classroom', 'Banquet', 'Boardroom']));
    expect(options[0]).toBe('No preference');
  });

  // TC-S1-81 · US-06 AC-2, AC-3 · fails if layout notes, several accessibility requirements or their notes were not all sent
  // Code: the accessibility ChipGroup holds a list; toPayload() sends the whole list with layoutNotes and accessibilityNotes.
  it('AC-2/AC-3: Given a layout with notes and two accessibility requirements, Then all are saved together', async () => {
    api.saveDraft.mockResolvedValue(request('EVT-5', 'Prefs', 'DRAFT'));
    renderAt('/organiser/new');
    const user = userEvent.setup();

    await user.type(screen.getByLabelText(/Event name/), 'Prefs');
    await user.selectOptions(screen.getByLabelText('Preferred layout'), 'THEATRE');
    await user.type(screen.getByLabelText('Layout notes'), 'Centre aisle');
    const chips = screen.getByRole('group', { name: 'Accessibility requirements' });
    await user.click(within(chips).getByRole('button', { name: 'Step-free access' }));
    await user.click(within(chips).getByRole('button', { name: 'Hearing loop' }));
    await user.type(screen.getByLabelText('Accessibility notes'), 'Ramp to the stage');
    await user.click(screen.getByRole('button', { name: 'Save as draft' }));

    expect(api.saveDraft).toHaveBeenCalledWith(
      expect.objectContaining({
        preferredLayout: 'THEATRE',
        layoutNotes: 'Centre aisle',
        accessibilityRequirements: ['STEP_FREE_ACCESS', 'HEARING_LOOP'],
        accessibilityNotes: 'Ramp to the stage',
      }),
    );
  });

  // TC-S1-81 · US-06 AC-4 · fails if reopening a request with several requirements kept only the first, so saving dropped the rest
  // Code: mapExistingToForm() copies the whole accessibilityRequirements list (it used to keep only [0]).
  it('AC-4: Given a saved request with two requirements, When it is reopened and saved, Then both are kept', () => {
    const form = mapExistingToForm({
      ...request('EVT-6', 'Saved', 'DRAFT'),
      accessibilityRequirements: ['STEP_FREE_ACCESS', 'HEARING_LOOP'],
    } as OrganiserRequestView);

    expect(form.accessibilityRequirements).toEqual(['STEP_FREE_ACCESS', 'HEARING_LOOP']);
    expect(toPayload(form).accessibilityRequirements).toEqual(['STEP_FREE_ACCESS', 'HEARING_LOOP']);
  });

  // TC-S1-81 · US-06 AC-5 · fails if leaving layout and accessibility empty stopped the request being saved
  // Code: an empty form sends no layout and an empty requirements list; the API treats both as optional.
  it('AC-5: Given layout and accessibility left empty, Then the payload carries no layout and no requirements', () => {
    const payload = toPayload({ ...EMPTY_EVENT_REQUEST_FORM, name: 'Plain' });

    expect(payload.preferredLayout).toBeUndefined();
    expect(payload.accessibilityRequirements).toEqual([]);
    expect(payload.layoutNotes).toBeUndefined();
  });
});
