import { focusManager, QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AxiosError, type AxiosResponse } from 'axios';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { CoordinatorChangeRequestDetail } from '@/pages/coordinator-change-request-detail';
import type { ArrangementCheck, ChangeRequestReview } from '@/types/api';
import { eventsApi } from '../api/events.api';
import { ArrangementCheckPanel } from './arrangement-check';

vi.mock('../api/events.api', () => ({
  eventsApi: {
    getChangeRequestForReview: vi.fn(),
    approveChangeRequest: vi.fn(),
    rejectChangeRequest: vi.fn(),
  },
}));

const api = vi.mocked(eventsApi);

const OLD = { start: '2030-10-01T01:00:00.000Z', end: '2030-10-01T05:00:00.000Z' };
const NEW = { start: '2030-10-02T01:00:00.000Z', end: '2030-10-02T05:00:00.000Z' };

const check = (overrides: Partial<ArrangementCheck> = {}): ArrangementCheck => ({
  newWindow: NEW,
  venueBookings: [
    {
      bookingId: 'b1',
      venueId: 'v1',
      venueName: 'Main Hall',
      status: 'APPROVED',
      current: OLD,
      proposed: NEW,
      moves: true,
      available: true,
      conflicts: [],
      capacityWarning: null,
    },
  ],
  equipmentReservations: [
    {
      equipmentId: 'eq',
      equipmentType: 'Projector',
      reservationIds: ['r1'],
      quantity: 4,
      status: 'APPROVED',
      current: OLD,
      proposed: NEW,
      available: true,
      reason: null,
    },
  ],
  equipment: [],
  warnings: [],
  works: [
    { kind: 'VENUE_BOOKING', label: 'Venue booking at Main Hall', reason: null },
    { kind: 'EQUIPMENT_RESERVATION', label: '4 × Projector reservation', reason: null },
  ],
  conflicts: [],
  canApprove: true,
  ...overrides,
});

const withConflict = () =>
  check({
    works: [{ kind: 'EQUIPMENT_RESERVATION', label: '4 × Projector reservation', reason: null }],
    conflicts: [
      {
        kind: 'VENUE_BOOKING',
        label: 'Venue booking at Main Hall',
        reason: 'Main Hall is already booked for "Gala" at the new time (setup and turnaround included).',
      },
    ],
    canApprove: false,
  });

describe('US-48 the arrangement check panel', () => {
  it('US-48 AC-4: says everything still works, and lists it', () => {
    render(<ArrangementCheckPanel check={check()} />);

    expect(screen.getByText('Everything still works with the proposed details.')).toBeInTheDocument();
    expect(within(screen.getByRole('list', { name: 'Still works' })).getAllByRole('listitem')).toHaveLength(2);
  });

  it('US-48 AC-2/AC-4: lists each conflict with its reason', () => {
    render(<ArrangementCheckPanel check={withConflict()} />);

    const alert = screen.getByRole('alert');
    expect(alert).toHaveTextContent('1 arrangement would conflict');
    expect(within(alert).getByRole('list', { name: 'Conflicts' })).toHaveTextContent(
      'Venue booking at Main Hall: Main Hall is already booked for "Gala" at the new time',
    );
  });

  it('US-48 AC-6: shows what approval would move to the new details', () => {
    render(<ArrangementCheckPanel check={check()} />);

    const moving = screen.getByRole('list', { name: 'Will move' });
    expect(within(moving).getAllByRole('listitem').map((li) => li.textContent)).toEqual([
      expect.stringMatching(/^Venue booking at Main Hall: .+ → .+/),
      expect.stringMatching(/^4 × Projector: .+ → .+/),
    ]);
    expect(screen.getByText(/rebooked for the new time and the original released/)).toBeInTheDocument();
  });

  it('says there is nothing to re-check when nothing moves', () => {
    render(
      <ArrangementCheckPanel
        check={check({
          newWindow: null,
          venueBookings: [],
          equipmentReservations: [],
          works: [],
        })}
      />,
    );

    expect(screen.getByText(/nothing to re-check/)).toBeInTheDocument();
  });
});

describe('US-48 the review page', () => {
  const capacityWarning = {
    type: 'CAPACITY_EXCEEDED' as const,
    bookingId: 'b1',
    bookingStatus: 'APPROVED',
    venueId: 'v1',
    venueName: 'Main Hall',
    capacity: 200,
    proposedAttendance: 250,
    message: 'The proposed attendance of 250 exceeds the capacity of Main Hall (200).',
  };

  const review = (
    status: 'PENDING' | 'REJECTED',
    c: ArrangementCheck,
    warnings: (typeof capacityWarning)[] = [],
  ): ChangeRequestReview =>
    ({
      request: {
        id: 'cr-1',
        status,
        reason: 'The speaker moved.',
        createdAt: '2030-09-01T00:00:00.000Z',
        decidedAt: status === 'PENDING' ? null : '2030-09-02T00:00:00.000Z',
        requestedBy: { id: 'o1', name: 'Olive', email: 'o@x.test' },
        proposedStart: NEW.start,
        proposedEnd: NEW.end,
        proposedAttendance: null,
        equipmentChanged: false,
        equipment: [],
      },
      event: {
        id: 'e1',
        name: 'Conf',
        status: 'CONFIRMED',
        proposedStart: OLD.start,
        proposedEnd: OLD.end,
        expectedAttendance: 100,
        equipmentRequirements: [],
      },
      warnings,
      check: c,
    }) as unknown as ChangeRequestReview;

  const venueConflict = {
    kind: 'VENUE_BOOKING' as const,
    label: 'Venue booking at Main Hall',
    reason: 'Main Hall is already booked for "Gala" at the new time (setup and turnaround included).',
  };
  const equipmentConflict = {
    kind: 'EQUIPMENT_RESERVATION' as const,
    label: '4 × Projector reservation',
    reason: 'Only 1 of 4 Projector free for the new time.',
  };
  const conflicted = (...conflicts: (typeof venueConflict | typeof equipmentConflict)[]) =>
    check({ works: [], conflicts, canApprove: false });

  const renderPage = () =>
    render(
      <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
        <MemoryRouter initialEntries={['/coordinator/change-requests/cr-1']}>
          <Routes>
            <Route path="/coordinator/change-requests/:id" element={<CoordinatorChangeRequestDetail />} />
            <Route path="/coordinator/change-requests" element={<p>Back on the list</p>} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>,
    );

  const approveButton = () => screen.getByRole('button', { name: 'Approve' });
  const rejectButton = () => screen.getByRole('button', { name: 'Reject' });
  const blockedMessage = () => screen.getByRole('list', { name: 'Why Approve is unavailable' });

  beforeEach(() => vi.resetAllMocks());

  it('US-48 AC-1: shows the check when a pending request is opened', async () => {
    api.getChangeRequestForReview.mockResolvedValue(review('PENDING', withConflict()));
    renderPage();

    expect(await screen.findByText('Arrangement check')).toBeInTheDocument();
    expect(screen.getByText(/1 arrangement would conflict/)).toBeInTheDocument();
  });

  it.each([
    ['a venue conflict', [venueConflict]],
    ['an equipment conflict', [equipmentConflict]],
    ['both', [venueConflict, equipmentConflict]],
  ])('US-48 AC-5a: disables Approve for %s, listing every conflict and its reason next to it', async (_label, conflicts) => {
    api.getChangeRequestForReview.mockResolvedValue(review('PENDING', conflicted(...conflicts)));
    renderPage();

    await waitFor(() => expect(approveButton()).toBeDisabled());
    expect(approveButton()).toHaveAttribute('aria-describedby', 'approve-blocked');
    const items = within(blockedMessage()).getAllByRole('listitem').map((li) => li.textContent);
    expect(items).toEqual(conflicts.map((c) => `${c.label}: ${c.reason}`));
    // Reject stays available.
    expect(rejectButton()).toBeEnabled();
  });

  it('US-48 AC-5b: a capacity shortfall alone warns but keeps Approve enabled', async () => {
    api.getChangeRequestForReview.mockResolvedValue(review('PENDING', check(), [capacityWarning]));
    renderPage();

    expect(await screen.findByText(capacityWarning.message)).toBeInTheDocument();
    expect(approveButton()).toBeEnabled();
    expect(screen.queryByRole('list', { name: 'Why Approve is unavailable' })).not.toBeInTheDocument();
  });

  it('US-48 AC-5c: no conflicts — Approve enabled, with the preview of what moves', async () => {
    api.getChangeRequestForReview.mockResolvedValue(review('PENDING', check()));
    renderPage();

    await waitFor(() => expect(approveButton()).toBeEnabled());
    expect(screen.getByRole('list', { name: 'Will move' })).toBeInTheDocument();
  });

  it('US-48 AC-5a: Reject stays enabled and still requires a reason', async () => {
    api.getChangeRequestForReview.mockResolvedValue(review('PENDING', conflicted(venueConflict)));
    api.rejectChangeRequest.mockResolvedValue({ id: 'cr-1', status: 'REJECTED' } as never);
    renderPage();
    const user = userEvent.setup();

    await user.click(await screen.findByRole('button', { name: 'Reject' }));
    await user.click(screen.getByRole('button', { name: 'Confirm rejection' }));
    expect(screen.getByText('A reason is required.')).toBeInTheDocument();
    expect(api.rejectChangeRequest).not.toHaveBeenCalled();

    await user.type(screen.getByLabelText(/Reason for rejecting/), 'The hall is taken.');
    await user.click(screen.getByRole('button', { name: 'Confirm rejection' }));
    await waitFor(() => expect(api.rejectChangeRequest).toHaveBeenCalledWith('cr-1', 'The hall is taken.'));
  });

  it('US-48: Re-check runs the check again and refreshes the button state', async () => {
    api.getChangeRequestForReview
      .mockResolvedValueOnce(review('PENDING', conflicted(venueConflict)))
      .mockResolvedValue(review('PENDING', check()));
    renderPage();
    const user = userEvent.setup();

    await waitFor(() => expect(approveButton()).toBeDisabled());
    await user.click(screen.getByRole('button', { name: 'Re-check' }));

    await waitFor(() => expect(approveButton()).toBeEnabled());
    expect(api.getChangeRequestForReview).toHaveBeenCalledTimes(2);
    expect(screen.getByText('Everything still works with the proposed details.')).toBeInTheDocument();
  });

  it('US-48: returning to the page re-runs the check', async () => {
    api.getChangeRequestForReview
      .mockResolvedValueOnce(review('PENDING', check()))
      .mockResolvedValue(review('PENDING', conflicted(equipmentConflict)));
    renderPage();

    await waitFor(() => expect(approveButton()).toBeEnabled());
    act(() => {
      focusManager.setFocused(false);
      focusManager.setFocused(true);
    });

    await waitFor(() => expect(approveButton()).toBeDisabled());
    expect(api.getChangeRequestForReview).toHaveBeenCalledTimes(2);
    focusManager.setFocused(undefined);
  });

  it('US-48 AC-8: a stale page — the server refuses, the page refreshes and Approve is disabled', async () => {
    api.getChangeRequestForReview
      .mockResolvedValueOnce(review('PENDING', check()))
      .mockResolvedValue(review('PENDING', conflicted(venueConflict)));
    api.approveChangeRequest.mockRejectedValue(
      new AxiosError('Conflict', 'ERR_BAD_REQUEST', undefined, undefined, {
        status: 409,
        data: {
          code: 'CHANGE_REQUEST_CHECK_FAILED',
          message: 'Cannot approve: …',
          conflicts: [venueConflict],
        },
      } as AxiosResponse),
    );
    renderPage();
    const user = userEvent.setup();

    await user.click(await screen.findByRole('button', { name: 'Approve' }));

    expect(
      await screen.findByText(/Not approved — something changed since this page loaded\. Nothing was changed and the request is still pending/),
    ).toBeInTheDocument();
    // Refreshed: still pending, now blocked — not rejected, not navigated away.
    await waitFor(() => expect(approveButton()).toBeDisabled());
    expect(rejectButton()).toBeEnabled();
    expect(screen.queryByText(/This request was rejected/)).not.toBeInTheDocument();
    expect(screen.queryByText('Back on the list')).not.toBeInTheDocument();
  });
});
