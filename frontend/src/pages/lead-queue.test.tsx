import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AxiosError, type AxiosResponse } from 'axios';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { assignmentsApi } from '@/features/assignments/api/assignments.api';
import type { AssignmentResult, QueueEntry, QueuedRequestDetail } from '@/types/api';
import { LeadQueuedRequest } from './lead-queued-request';
import { LeadUnassignedQueue } from './lead-unassigned-queue';

/**
 * UI tests for US-55 (the Lead's unassigned queue and assigning a
 * Coordinator). Rendered with React Testing Library, API mocked. The server's
 * rules (Lead only, oldest first, one assignment wins) are proven by
 * test/events-assignment.e2e-spec.ts.
 */

vi.mock('@/features/assignments/api/assignments.api', () => ({
  assignmentsApi: { queue: vi.fn(), queuedRequest: vi.fn(), coordinators: vi.fn(), assign: vi.fn() },
}));

const api = vi.mocked(assignmentsApi);

const olive = { id: 'USR-028', name: 'Olive', email: 'olive@example.com' };
const marcus = { id: 'USR-030', name: 'Marcus', email: 'marcus@example.com' };
const entry: QueueEntry = {
  id: 'EVT-283',
  name: 'Freshman Orientation 2030',
  organiser: olive,
  organisation: 'Acme Corp',
  category: 'Student engagement',
  proposedStart: '2030-10-01T09:00:00.000Z',
  proposedEnd: '2030-10-01T17:00:00.000Z',
  expectedAttendance: 99,
  submittedAt: '2030-01-01T00:00:00.000Z',
};

const renderAt = (path: string) =>
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/lead/unassigned" element={<LeadUnassignedQueue />} />
          <Route path="/lead/unassigned/:id" element={<LeadQueuedRequest />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );

beforeEach(() => {
  vi.resetAllMocks();
  api.queue.mockResolvedValue([entry]);
  api.queuedRequest.mockResolvedValue({
    ...entry,
    status: 'SUBMITTED',
    purpose: 'Welcome new students',
    description: 'Full-day programme',
    preferredLayout: 'THEATRE',
    layoutNotes: 'Stage left',
  } as QueuedRequestDetail);
  api.coordinators.mockResolvedValue([marcus]);
});

describe('US-55 AC-3: each queue entry shows what the Lead needs', () => {
  // TC-S3-161 · US-55 AC-3 · fails if an entry misses the event name, Organiser, organisation, category, preferred date, attendance or submission time
  // Code: LeadUnassignedQueue -> QueueRow
  it('shows event, Organiser and organisation, category, preferred date, attendance and submission time', async () => {
    renderAt('/lead/unassigned');

    const row = within((await screen.findByText('Freshman Orientation 2030')).closest('li')!);
    expect(row.getByText(/Olive · Acme Corp · Student engagement/)).toBeInTheDocument();
    expect(row.getByText(/Preferred .*2030.* expected/)).toBeInTheDocument();
    expect(row.getByText(/Submitted .*2030/)).toBeInTheDocument();
    expect(row.getByRole('link', { name: 'Open' })).toHaveAttribute('href', '/lead/unassigned/EVT-283');
  });
});

describe('US-55 AC-4, AC-5, AC-9: open a queued request and assign it', () => {
  // TC-S3-162, TC-S3-163, TC-S3-164 · US-55 AC-4, AC-5, AC-6 · fails if the request's details are not shown, Assign works before a Coordinator is chosen, or the chosen one is not sent and confirmed
  // Code: LeadQueuedRequest (useQueuedRequest, useAssignableCoordinators, useAssignRequest)
  it('shows the request, and assigns it to the chosen Coordinator', async () => {
    const user = userEvent.setup();
    api.assign.mockResolvedValue({ id: 'EVT-283', coordinator: marcus } as AssignmentResult);
    renderAt('/lead/unassigned/EVT-283');

    expect(await screen.findByText('Welcome new students')).toBeInTheDocument();
    expect(screen.getByText('THEATRE — Stage left')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Assign' })).toBeDisabled();

    await user.selectOptions(await screen.findByLabelText('Coordinator'), 'USR-030');
    await user.click(screen.getByRole('button', { name: 'Assign' }));

    await waitFor(() => expect(api.assign).toHaveBeenCalledWith('EVT-283', 'USR-030'));
    expect(await screen.findByRole('status')).toHaveTextContent('Assigned to Marcus.');
  });

  // TC-S3-167 · US-55 AC-9 · fails if assigning an already-assigned request is not blocked with the current assignee shown
  // Code: LeadQueuedRequest (assign.error -> apiErrorMessage); EventsAssignmentService.alreadyAssigned
  it('shows the current assignee when the request was already assigned', async () => {
    const user = userEvent.setup();
    api.assign.mockRejectedValue(
      new AxiosError('Conflict', 'ERR_BAD_REQUEST', undefined, undefined, {
        status: 409,
        data: { statusCode: 409, message: 'this request is already assigned to Fatima', currentAssignee: { name: 'Fatima' } },
      } as AxiosResponse),
    );
    renderAt('/lead/unassigned/EVT-283');

    await user.selectOptions(await screen.findByLabelText('Coordinator'), 'USR-030');
    await user.click(screen.getByRole('button', { name: 'Assign' }));

    expect(await screen.findByText(/already assigned to Fatima/i)).toBeInTheDocument();
    expect(screen.queryByRole('status')).toBeNull();
  });
});
