import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { eventsApi } from '@/features/events/api/events.api';
import type { ChangeRequest, ChangeRequestApproval, ChangeRequestReview } from '@/types/api';
import { CoordinatorChangeRequestDetail } from './coordinator-change-request-detail';

/**
 * UI tests for US-37 (Review change requests): the Coordinator's review page
 * for one change request, rendered with React Testing Library, API mocked.
 * The server's rules are proven by test/events-change-review.e2e-spec.ts; the
 * browser journey by e2e/us36-us37-change-requests.spec.ts.
 */

vi.mock('@/features/events/api/events.api', () => ({
  eventsApi: { getChangeRequestForReview: vi.fn(), approveChangeRequest: vi.fn(), rejectChangeRequest: vi.fn() },
}));

const api = vi.mocked(eventsApi);

const WARNING = {
  type: 'CAPACITY_EXCEEDED',
  bookingId: 'BKG-001',
  bookingStatus: 'APPROVED',
  venueId: 'VEN-002',
  venueName: 'Main Hall',
  capacity: 300,
  proposedAttendance: 350,
  message: 'Main Hall holds 300; the proposed attendance is 350.',
};

/** A pending request raising attendance from 120 to 350, with Main Hall (300) booked. */
const review = (overrides: Partial<ChangeRequestReview> = {}) =>
  ({
    request: {
      id: 'CRQ-001',
      eventId: 'EVT-200',
      status: 'PENDING',
      reason: 'Demand has tripled',
      proposedStart: null,
      proposedEnd: null,
      proposedAttendance: 350,
      equipmentChanged: false,
      equipment: [],
      createdAt: '2026-10-20T02:00:00.000Z',
      requestedBy: { id: 'USR-006', name: 'Olivia Organiser', email: 'organiser@example.com' },
    },
    event: {
      id: 'EVT-200',
      name: 'Careers Fair',
      status: 'PLANNING',
      proposedStart: '2030-10-01T01:00:00.000Z',
      proposedEnd: '2030-10-01T09:00:00.000Z',
      expectedAttendance: 120,
      equipmentRequirements: [],
    },
    warnings: [WARNING],
    check: {
      newWindow: null,
      venueBookings: [],
      equipmentReservations: [],
      equipment: [],
      warnings: [WARNING],
      works: [],
      conflicts: [],
      canApprove: true,
    },
    ...overrides,
  }) as unknown as ChangeRequestReview;

const renderPage = () =>
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <MemoryRouter initialEntries={['/coordinator/change-requests/CRQ-001']}>
        <Routes>
          <Route path="/coordinator/change-requests/:id" element={<CoordinatorChangeRequestDetail />} />
          <Route path="/coordinator/change-requests" element={<p>Change requests list</p>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );

beforeEach(() => {
  vi.resetAllMocks();
  api.getChangeRequestForReview.mockResolvedValue(review());
});

describe('US-37 AC-2, AC-6: what is proposed, why, and a capacity warning before deciding', () => {
  // TC-S2-181 · US-37 AC-2 · fails if the current and proposed values, or the Organiser's reason, were not shown
  // Code: "Reason for the change" card and ChangeRequestComparison's Field / Current / Proposed rows.
  it('shows the current and proposed values side by side, with the reason', async () => {
    renderPage();

    expect(await screen.findByText('Demand has tripled')).toBeInTheDocument();
    const row = screen.getByRole('row', { name: /Expected attendance/ });
    expect(within(row).getByText('120')).toBeInTheDocument();
    expect(within(row).getByText('350')).toBeInTheDocument();
  });

  // TC-S2-181 · US-37 AC-6 · fails if the capacity warning was missing, came after the decision, or blocked approval
  // Code: `warnings` render as an alert above "Your decision"; capacity never disables Approve.
  it('warns about the booked venue’s capacity above the decision, without blocking Approve', async () => {
    renderPage();

    const warning = await screen.findByRole('alert');
    expect(warning).toHaveTextContent('Main Hall holds 300; the proposed attendance is 350.');
    const decision = screen.getByRole('heading', { name: 'Your decision' });
    expect(warning.compareDocumentPosition(decision) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Approve' })).toBeEnabled();
  });
});

describe('US-37 AC-3, AC-4, AC-5: approving, and rejecting with a reason', () => {
  // TC-S2-181 · US-37 AC-3 · fails if a rejection could be sent without a reason, or the given reason was not sent
  // Code: handleReject needs a non-blank reason; then POST /change-requests/:id/reject with it.
  it('needs a reason to reject, then sends it and returns to the list', async () => {
    api.rejectChangeRequest.mockResolvedValue({ id: 'CRQ-001', status: 'REJECTED' } as ChangeRequest);
    const user = userEvent.setup();
    renderPage();

    await user.click(await screen.findByRole('button', { name: 'Reject' }));
    await user.click(screen.getByRole('button', { name: 'Confirm rejection' }));
    expect(screen.getByText('A reason is required.')).toBeInTheDocument();
    expect(api.rejectChangeRequest).not.toHaveBeenCalled();

    await user.type(screen.getByLabelText(/Reason for rejecting/), 'Main Hall is too small');
    await user.click(screen.getByRole('button', { name: 'Confirm rejection' }));

    await waitFor(() => expect(api.rejectChangeRequest).toHaveBeenCalledWith('CRQ-001', 'Main Hall is too small'));
    expect(await screen.findByText('Change requests list')).toBeInTheDocument();
  });

  // TC-S2-181 · US-37 AC-4 · fails if Approve did not send the approval
  // Code: Approve -> POST /change-requests/:id/approve, then back to the list with a notice.
  it('approves and returns to the list', async () => {
    api.approveChangeRequest.mockResolvedValue({
      arrangements: { venueBookings: [], equipmentReservations: [] },
    } as unknown as ChangeRequestApproval);
    const user = userEvent.setup();
    renderPage();

    await user.click(await screen.findByRole('button', { name: 'Approve' }));

    await waitFor(() => expect(api.approveChangeRequest).toHaveBeenCalledWith('CRQ-001'));
    expect(await screen.findByText('Change requests list')).toBeInTheDocument();
  });

  // TC-S2-181 · US-37 AC-3, AC-4 · fails if a decided request still offered Approve or Reject
  // Code: a status other than PENDING replaces "Your decision" with "This request was ...".
  it('offers no decision once the request has been decided', async () => {
    api.getChangeRequestForReview.mockResolvedValue(
      review({ request: { ...review().request, status: 'REJECTED', decidedAt: '2026-10-21T02:00:00.000Z' } }),
    );
    renderPage();

    expect(await screen.findByText(/^This request was rejected on /)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Approve' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Reject' })).not.toBeInTheDocument();
  });
});
