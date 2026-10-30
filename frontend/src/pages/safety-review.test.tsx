import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { safetyApi } from '@/features/safety/api/safety.api';
import type { SafetyDecisionResult, SafetyReviewPacket } from '@/types/api';
import { SafetyReview } from './safety-review';

/**
 * UI tests for US-57 (the Safety Officer's review and decision). Rendered with
 * React Testing Library, API mocked. The server's rules (queue entry, one
 * decision, Safety Officer only, what each outcome does) are proven by
 * test/safety-check.e2e-spec.ts.
 */

vi.mock('@/features/safety/api/safety.api', () => ({
  safetyApi: { packet: vi.fn(), decide: vi.fn() },
}));

const api = vi.mocked(safetyApi);

const packet = {
  event: {
    id: 'EVT-300',
    name: 'Careers Fair',
    purpose: 'Meet employers',
    category: 'Careers',
    status: 'AWAITING_SAFETY_CHECK',
    proposedStart: '2030-10-01T09:00:00.000Z',
    proposedEnd: '2030-10-01T13:00:00.000Z',
    expectedAttendance: 150,
    preferredLayout: 'THEATRE',
    layoutNotes: null,
    accessibilityRequirements: ['STEP_FREE_ACCESS'],
    accessibilityNotes: null,
    equipmentNeeds: null,
    technicalSupportNeeds: null,
    coordinator: { id: 'USR-004', name: 'Cody Coordinator', email: 'coord.a@example.com' },
    organiser: { id: 'USR-006', name: 'Olivia Organiser', email: 'organiser@example.com' },
  },
  venues: [
    {
      bookingId: 'BKG-163',
      start: '2030-10-02T09:00:00.000Z',
      end: '2030-10-02T13:00:00.000Z',
      venue: {
        id: 'VEN-082',
        name: 'Main Hall',
        location: 'Student Centre',
        capacity: 200,
        supportedLayouts: [],
        accessibilityFeatures: [],
        layoutNotes: null,
        operatingInfo: 'No open flames. Maximum two doors in use after 22:00.',
      },
      capacityMargin: 50,
      blocks: [{ id: 'BLK-009', start: '2030-10-02T10:00:00.000Z', end: '2030-10-02T11:00:00.000Z', reason: 'Fire alarm testing' }],
    },
  ],
  equipment: {
    requirements: [{ equipmentId: 'EQP-022', equipmentType: 'Wireless microphone', quantity: 2, notes: null }],
    reservations: [],
  },
  history: [],
} as unknown as SafetyReviewPacket;

const renderPage = () =>
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <MemoryRouter initialEntries={['/safety/checks/EVT-300']}>
        <Routes>
          <Route path="/safety/checks/:id" element={<SafetyReview />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );

beforeEach(() => {
  vi.resetAllMocks();
  api.packet.mockResolvedValue(packet);
});

describe('US-57 AC-2: the review shows what the Safety Officer needs', () => {
  // TC-S3-178 · US-57 AC-2 · fails if the page misses the venue's capacity, restrictions or blocks, or the requested equipment
  // Code: SafetyReview (useSafetyPacket -> GET /safety/events/:id)
  it("shows each venue's capacity, restrictions and blocks, and the requested equipment", async () => {
    renderPage();

    expect(await screen.findByText('Main Hall', { exact: false })).toBeInTheDocument();
    expect(screen.getByText(/200/)).toBeInTheDocument();
    expect(screen.getByText('No open flames. Maximum two doors in use after 22:00.')).toBeInTheDocument();
    expect(screen.getByText(/Fire alarm testing/)).toBeInTheDocument();
    expect(screen.getByText(/Wireless microphone/)).toBeInTheDocument();
  });
});

describe('US-57 AC-3, AC-4, AC-6: recording a decision', () => {
  // TC-S3-179, TC-S3-180, TC-S3-182 · US-57 AC-3, AC-4, AC-6 · fails if request changes can be sent without a stage or a reason, or the stage, reason and factor comment are not sent
  // Code: SafetyReview submit (errors, SafetyDecisionPayload) -> POST /safety/events/:id/decision
  it('requires a stage and a reason to request changes, then sends them with the factor comment', async () => {
    const user = userEvent.setup();
    api.decide.mockResolvedValue({
      outcome: 'CHANGES_REQUESTED',
      returnStage: 'VENUE',
      createdAt: '2030-09-01T00:00:00.000Z',
    } as SafetyDecisionResult);
    renderPage();

    await user.click(await screen.findByRole('radio', { name: /^Request changes/ }));
    await user.click(screen.getByRole('button', { name: 'Record decision' }));

    expect(screen.getByText('Choose the planning stage to return to.')).toBeInTheDocument();
    expect(screen.getByText('A reason is required to reject or request changes.')).toBeInTheDocument();
    expect(api.decide).not.toHaveBeenCalled();

    await user.click(screen.getByRole('radio', { name: /^Venue planning/ }));
    await user.type(screen.getByLabelText(/^Reason/), 'Only one exit for 150 people');
    await user.click(within(screen.getByRole('radiogroup', { name: 'Emergency access' })).getByRole('radio', { name: 'Add a comment' }));
    await user.type(screen.getByLabelText('Emergency access — comment'), 'Rear exit locked');
    await user.click(screen.getByRole('button', { name: 'Record decision' }));

    await waitFor(() =>
      expect(api.decide).toHaveBeenCalledWith('EVT-300', {
        outcome: 'CHANGES_REQUESTED',
        returnStage: 'VENUE',
        reason: 'Only one exit for 150 people',
        emergencyAccessComment: 'Rear exit locked',
      }),
    );
    expect(await screen.findByRole('status')).toHaveTextContent(/back in venue planning/i);
  });
});
