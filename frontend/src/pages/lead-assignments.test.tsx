import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { assignmentsApi } from '@/features/assignments/api/assignments.api';
import type { AssignmentResult, CoordinatorAssignments } from '@/types/api';
import { LeadAssignments } from './lead-assignments';

/**
 * UI tests for US-26 (Have an event reassigned when my availability changes)
 * and US-56 (the Lead's view of every Coordinator's assignments):
 * since Week 7 Change 5 the Event Coordinator Lead makes the reassignment, on
 * the Coordinator assignments page. Rendered with React Testing Library, API
 * mocked. The server's rules are proven by test/events-reassign.e2e-spec.ts and
 * test/events-assignment.e2e-spec.ts;
 * the browser journey by e2e/us24-us27-planning.spec.ts.
 */

vi.mock('@/features/assignments/api/assignments.api', () => ({
  assignmentsApi: { coordinators: vi.fn(), overview: vi.fn(), reassign: vi.fn() },
}));

const api = vi.mocked(assignmentsApi);

const cody = { id: 'USR-004', name: 'Cody Coordinator', email: 'coord.a@example.com' };
const casey = { id: 'USR-005', name: 'Casey Coordinator', email: 'coord.b@example.com' };

const renderPage = () =>
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <MemoryRouter>
        <LeadAssignments />
      </MemoryRouter>
    </QueryClientProvider>,
  );

/** Opens the Reassign control on Cody's event. */
async function openReassign(user: ReturnType<typeof userEvent.setup>) {
  const codyCard = (await screen.findByText('Freshman Orientation 2030')).closest('li')!;
  await user.click(within(codyCard).getByRole('button', { name: 'Reassign' }));
  return within(codyCard);
}

beforeEach(() => {
  vi.resetAllMocks();
  api.coordinators.mockResolvedValue([casey, cody]);
  api.overview.mockResolvedValue([
    { coordinator: casey, activeCount: 0, events: [] },
    {
      coordinator: cody,
      activeCount: 1,
      events: [{ id: 'EVT-107', name: 'Freshman Orientation 2030', status: 'PLANNING', eventDate: '2030-10-01T01:00:00.000Z' }],
    },
  ] as CoordinatorAssignments[]);
});

describe('US-26 AC-1: a new Coordinator can be selected', () => {
  // TC-S2-83 · US-26 AC-1 · fails if the Lead were offered the event's current Coordinator, or could confirm without choosing
  // Code: ReassignControl lists every Coordinator except `current`; Confirm is disabled until one is chosen.
  it('offers every other Coordinator, and nothing is sent until one is chosen', async () => {
    const user = userEvent.setup();
    renderPage();

    const card = await openReassign(user);
    const select = card.getByLabelText('Reassign to');
    expect(within(select).getAllByRole('option').map((o) => o.textContent)).toEqual(['Choose…', 'Casey Coordinator']);
    expect(card.getByRole('button', { name: 'Confirm' })).toBeDisabled();
  });
});

describe('US-26 AC-2, AC-3: confirming hands the event over and says both were told', () => {
  // TC-S2-85, TC-S2-87 · US-26 AC-2, AC-3 · fails if Confirm did not send the chosen Coordinator, or the Lead was not told it moved and who was notified
  // Code: Confirm calls POST /assignments/events/:id/reassign; onSuccess shows "... moved from A to B. Both have been notified."
  it('reassigns to the chosen Coordinator and confirms the move', async () => {
    const user = userEvent.setup();
    api.reassign.mockResolvedValue({
      id: 'EVT-107',
      name: 'Freshman Orientation 2030',
      status: 'PLANNING',
      coordinator: casey,
    } as AssignmentResult);
    renderPage();

    const card = await openReassign(user);
    await user.selectOptions(card.getByLabelText('Reassign to'), 'USR-005');
    await user.click(card.getByRole('button', { name: 'Confirm' }));

    await waitFor(() => expect(api.reassign).toHaveBeenCalledWith('EVT-107', 'USR-005'));
    expect(await screen.findByRole('status')).toHaveTextContent(
      '"Freshman Orientation 2030" moved from Cody Coordinator to Casey Coordinator. Both have been notified.',
    );
  });
});

describe('US-56 AC-1, AC-2: every Coordinator with their active events and a count, filterable', () => {
  // TC-S3-168, TC-S3-169 · US-56 AC-1, AC-2 · fails if a Coordinator, their count, or an event's name, status or date is missing, or the filter does not ask for that one Coordinator
  // Code: LeadAssignments (useAssignmentsOverview(filter) -> GET /assignments?coordinatorId=)
  it('shows each Coordinator with a count and their events, and filters by Coordinator', async () => {
    const user = userEvent.setup();
    renderPage();

    const row = within((await screen.findByText('Freshman Orientation 2030')).closest('li')!);
    expect(row.getByText('Planning')).toBeInTheDocument();
    expect(row.getByText(/Oct 2030/)).toBeInTheDocument();
    expect(screen.getByText('1 active event')).toBeInTheDocument();
    expect(screen.getByText('0 active events')).toBeInTheDocument();
    expect(api.overview).toHaveBeenLastCalledWith(undefined);

    await user.selectOptions(screen.getByLabelText('Coordinator'), 'USR-005');

    await waitFor(() => expect(api.overview).toHaveBeenLastCalledWith('USR-005'));
  });
});
