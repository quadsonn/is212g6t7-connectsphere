import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { AVAILABILITY_FACETS, ENTRY_STYLES, holdExpiryLabel } from './calendar-utils';
import { CalendarLegend } from './components/calendar-views';

/** US-54 AC-4 — the calendar's words for holds and pending requests. */
describe('US-54: calendar labels', () => {
  it('US-54: a pending request is "Pending"; a live hold is "Tentative"', () => {
    expect(ENTRY_STYLES.PENDING.label).toBe('Pending');
    expect(ENTRY_STYLES.TENTATIVE.label).toBe('Tentative');
    expect(AVAILABILITY_FACETS.map((f) => f.label)).toEqual(['Available', 'Pending', 'Tentative', 'Confirmed', 'Blocked']);
  });

  it('US-54 AC-4: a hold shows its expiry; nothing else does', () => {
    expect(holdExpiryLabel({ kind: 'TENTATIVE', holdExpiresAt: '2030-10-18T06:30:00.000Z' })).toMatch(/^expires 18 Oct, \d\d:\d\d$/);
    expect(holdExpiryLabel({ kind: 'PENDING', holdExpiresAt: null })).toBeNull();
    expect(holdExpiryLabel({ kind: 'CONFIRMED', holdExpiresAt: null })).toBeNull();
  });

  it('US-54: the legend lists Pending and Tentative separately', () => {
    render(<CalendarLegend />);

    for (const label of ['Available', 'Pending', 'Tentative', 'Confirmed', 'Blocked']) {
      expect(screen.getByText(label)).toBeInTheDocument();
    }
  });
});
