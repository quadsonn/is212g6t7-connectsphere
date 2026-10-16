import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import type { BookingDecision } from '@/types/api';
import { BookingDecisionHistory } from './booking-decision-history';

const decision = (overrides: Partial<BookingDecision>): BookingDecision => ({
  id: 'd1',
  kind: 'DECISION',
  outcome: 'APPROVED',
  reason: null,
  createdAt: '2030-10-01T01:00:00.000Z',
  decidedBy: { id: 'u1', name: 'Vera Staff', email: 'v@example.com', role: 'VENUE_STAFF' },
  ...overrides,
});

describe('US-44: booking history', () => {
  it('US-44: a release on cancellation reads "Released", with its reason, by the system', () => {
    render(
      <BookingDecisionHistory
        decisions={[
          decision({}),
          decision({ id: 'd2', kind: 'RELEASE', outcome: 'RELEASED', reason: 'Event cancelled', decidedBy: null }),
        ]}
      />,
    );

    expect(screen.getByText('Approved')).toBeInTheDocument();
    expect(screen.getByText('Released')).toBeInTheDocument();
    expect(screen.getByText('Event cancelled')).toBeInTheDocument();
    expect(screen.getByText(/^System ·/)).toBeInTheDocument();
  });

  it('US-44: names the canceller when one was recorded', () => {
    render(
      <BookingDecisionHistory
        decisions={[
          decision({
            kind: 'RELEASE',
            outcome: 'RELEASED',
            reason: 'Event cancelled',
            decidedBy: { id: 'u2', name: 'Olive Organiser', email: 'o@example.com', role: 'EVENT_ORGANISER' },
          }),
        ]}
      />,
    );

    expect(screen.getByText(/^Olive Organiser \(Event organiser\) ·/i)).toBeInTheDocument();
  });
});
