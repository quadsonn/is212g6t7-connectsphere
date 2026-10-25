import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { EVENT_STATUS_STYLES } from '@/lib/status';
import { EVENT_STATUSES } from '@/types/api';
import { EventStatusBadge } from './event-status-badge';

/**
 * UI tests for US-11 (Event status updates automatically as actions are
 * taken), AC-1: whatever status the API reports, the screen shows exactly one
 * plain-language label for it. Status changes themselves are proven by
 * test/events-status-lifecycle.e2e-spec.ts and the browser tests.
 */
describe('US-11 AC-1: every status has one visible label', () => {
  // TC-S1-88 · US-11 AC-1 · fails if a status rendered as a blank, a raw code, or the same words as another status
  // Code: EventStatusBadge renders EVENT_STATUS_STYLES[status].label, typed Record<EventStatus, …> so none can be missing.
  it.each(EVENT_STATUSES)('Given %s, Then the badge shows its own label and no raw code', (status) => {
    render(<EventStatusBadge status={status} />);

    const label = EVENT_STATUS_STYLES[status].label;
    expect(screen.getByText(label)).toBeInTheDocument();
    expect(label).not.toMatch(/_/);
  });

  // TC-S1-88 · US-11 AC-1 · fails if two statuses looked the same on screen, so a user could not tell them apart
  // Code: each EVENT_STATUS_STYLES entry has a distinct label.
  it('Then no two statuses share a label', () => {
    const labels = EVENT_STATUSES.map((status) => EVENT_STATUS_STYLES[status].label);

    expect(new Set(labels).size).toBe(labels.length);
  });

  // TC-S1-88 · US-11 AC-1 · fails if the AC's own list of statuses could not all be shown
  // Code: the frontend's EVENT_STATUSES mirrors the API's EventStatus enum.
  it('Then every status the AC lists can be shown', () => {
    for (const status of ['DRAFT', 'SUBMITTED', 'UNDER_REVIEW', 'APPROVED', 'PLANNING', 'AWAITING_ARRANGEMENTS', 'CONFIRMED', 'COMPLETED', 'CANCELLED', 'REJECTED']) {
      expect(EVENT_STATUSES).toContain(status);
    }
  });
});
