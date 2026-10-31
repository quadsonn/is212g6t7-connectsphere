import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import type { SafetyReview } from '@/types/api';
import { SafetyHistory } from './safety-history';

/**
 * US-62 AC-2, AC-8 — what the Coordinator (and the Safety Officer) see of
 * earlier safety checks. The send-back flow itself is covered in the browser
 * by e2e/us62-safety-resubmit.spec.ts.
 */
const review = (over: Partial<SafetyReview>): SafetyReview =>
  ({
    id: 'SFR-1',
    officer: { id: 'USR-033', name: 'Sam' },
    outcome: 'REJECTED',
    reason: 'No safe route out',
    returnStage: null,
    affectedArrangements: [],
    emergencyAccessComment: null,
    crowdMovementComment: null,
    equipmentPlacementComment: null,
    accessibilityComment: null,
    resubmittedAt: null,
    resubmissionComment: null,
    createdAt: '2030-09-01T01:00:00.000Z',
    ...over,
  }) as SafetyReview;

describe('US-62 the safety history', () => {
  // TC-S4-81 · US-62 AC-2 · fails if a rejection does not say the whole plan is flagged, or the Safety Officer's factor notes are not shown
  // Code: SafetyHistory (REJECTED with affectedArrangements; FACTORS)
  it('AC-2: a rejection names the reason and that the whole plan is flagged, with the notes on each factor', () => {
    render(
      <SafetyHistory
        reviews={[
          review({
            affectedArrangements: ['VENUE_BOOKING', 'EQUIPMENT_RESERVATION'],
            emergencyAccessComment: 'Rear doors are chained',
          }),
        ]}
      />,
    );

    expect(screen.getByText('No safe route out')).toBeInTheDocument();
    expect(
      screen.getByText(/The whole plan is flagged: the venue booking and equipment reservation must be reworked/),
    ).toBeInTheDocument();
    expect(screen.getByText('Emergency access')).toBeInTheDocument();
    expect(screen.getByText('Rear doors are chained')).toBeInTheDocument();
  });

  // TC-S4-86, TC-S4-87 · US-62 AC-7, AC-8 · fails if a send-back without a note shows an empty comment, or the earlier review is not kept newest-first beside the later one
  // Code: SafetyHistory (resubmittedAt without resubmissionComment; reviews newest first)
  it('AC-7/AC-8: a send-back with no note shows when it was sent, with no comment, and earlier checks stay listed', () => {
    render(
      <SafetyHistory
        reviews={[
          review({ id: 'SFR-1', resubmittedAt: '2030-09-02T01:00:00.000Z' }),
          review({ id: 'SFR-2', outcome: 'APPROVED', reason: null }),
        ]}
      />,
    );

    expect(screen.getByText(/The Coordinator sent it back for a new check on/)).toBeInTheDocument();
    expect(screen.queryByText(/Coordinator’s comment/)).toBeNull();
    expect(screen.getAllByRole('listitem').map((li) => li.textContent?.includes('Approved'))).toEqual([true, false]);
  });
});
