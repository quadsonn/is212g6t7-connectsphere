import { fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { CalendarEntry } from '@/types/api';
import { type CalendarFilters, NO_FILTERS, applyFilters, compactTimeRange, daysIn, facetCounts } from './calendar-utils';
import { FilterPanel, WeekGrid } from './components/calendar-views';

const at = (h: number, m = 0) => new Date(2030, 9, 14, h, m).toISOString();

const entry = (over: Partial<CalendarEntry> = {}): CalendarEntry => ({
  id: 'BKG-001',
  kind: 'CONFIRMED',
  venueId: 'VEN-001',
  start: at(9),
  end: at(10),
  eventName: 'Quarterly town hall',
  organiserName: 'Olive Organiser',
  expectedAttendance: 120,
  reason: null,
  createdByName: null,
  needsReview: false,
  needsReviewReason: null,
  holdExpiresAt: null,
  ...over,
});

const venues = [
  { id: 'VEN-001', name: 'Main Hall', location: null, capacity: 200 },
  { id: 'VEN-002', name: 'Seminar Room 3', location: null, capacity: 40 },
];
// Mon 14 – Sun 20 Oct 2030.
const days = daysIn(new Date(2030, 9, 14), new Date(2030, 9, 21));

afterEach(() => vi.useRealTimers());

describe('US-16: week view time labels', () => {
  it('US-16: compact ranges drop leading zeros and on-the-hour minutes', () => {
    expect(compactTimeRange(at(9), at(10))).toBe('9–10');
    expect(compactTimeRange(at(11, 15), at(12, 30))).toBe('11:15–12:30');
    expect(compactTimeRange(at(9), at(17, 5))).toBe('9–17:05');
  });
});

describe('US-16: week view cells', () => {
  it('US-16 AC-1: a free day is an empty, faintly filled cell with no "Available" text', () => {
    render(<WeekGrid days={days} venues={[venues[0]]} entries={[]} onSelect={() => {}} />);

    const free = screen.getAllByTestId('available-cell');
    expect(free).toHaveLength(7);
    // Only screen readers hear it; nothing is printed in the cell.
    expect(within(free[0]).getByText('Available')).toHaveClass('sr-only');
  });

  it('US-16: free cells stay blank when the Availability filter hides free time', () => {
    render(<WeekGrid days={days} venues={[venues[0]]} entries={[entry()]} onSelect={() => {}} showAvailable={false} />);

    expect(screen.queryByTestId('available-cell')).toBeNull();
  });

  it('US-16 AC-4: a booking is a pill with a compact time and its name', () => {
    render(<WeekGrid days={days} venues={[venues[0]]} entries={[entry({ start: at(11, 15), end: at(12, 30) })]} onSelect={() => {}} />);

    const pill = screen.getByRole('button', { name: /Quarterly town hall/ });
    expect(pill).toHaveTextContent('11:15–12:30');
    expect(pill).not.toHaveAttribute('title');
    expect(screen.getAllByTestId('available-cell')).toHaveLength(6);
  });

  it('US-16 AC-4: hovering a pill shows full time, name and status; click still selects it', async () => {
    const onSelect = vi.fn();
    const user = userEvent.setup();
    render(
      <WeekGrid
        days={days}
        venues={[venues[0]]}
        entries={[entry({ kind: 'TENTATIVE', needsReview: true, holdExpiresAt: at(18) })]}
        onSelect={onSelect}
      />,
    );
    const pill = screen.getByRole('button', { name: /Quarterly town hall/ });

    await user.hover(pill);
    const tip = screen.getByRole('tooltip');
    expect(tip).toHaveTextContent('Tentative');
    expect(tip).toHaveTextContent(/expires 14 Oct/);
    expect(tip).toHaveTextContent('Conflict – needs review');
    expect(tip).toHaveTextContent('Quarterly town hall');
    expect(tip).toHaveTextContent('Main Hall');
    expect(pill).toHaveAttribute('aria-describedby', tip.id);

    await user.click(pill);
    expect(onSelect).toHaveBeenCalledWith(expect.objectContaining({ id: 'BKG-001' }));

    await user.unhover(pill);
    expect(screen.queryByRole('tooltip')).toBeNull();
  });

  it('US-16: the whole current-day column is tinted', () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(2030, 9, 16, 12));
    render(<WeekGrid days={days} venues={venues} entries={[]} onSelect={() => {}} />);

    const header = screen.getByRole('columnheader', { current: 'date' });
    expect(header).toHaveTextContent('Wed 16');
    expect(header).toHaveClass('bg-brand-50/70');
    // Wednesday is the fourth column (after Venue) in every row.
    for (const row of screen.getAllByRole('row').slice(1)) {
      expect(row.children[3]).toHaveClass('bg-brand-50/70');
      expect(row.children[2]).not.toHaveClass('bg-brand-50/70');
    }
  });

  it('US-16: a long venue name wraps, with a tooltip only when it is cut off', async () => {
    const user = userEvent.setup();
    const long = 'The Exceptionally Long Named Multi-Purpose Auditorium and Conference Centre';
    render(
      <WeekGrid
        days={days}
        venues={[venues[0], { id: 'VEN-009', name: long, location: null, capacity: 500 }]}
        entries={[]}
        onSelect={() => {}}
      />,
    );
    const longName = screen.getByText(long);
    expect(longName).toHaveClass('line-clamp-2');
    Object.defineProperty(longName, 'scrollHeight', { configurable: true, value: 60 });
    Object.defineProperty(longName, 'clientHeight', { configurable: true, value: 40 });

    await user.hover(screen.getByText('Main Hall'));
    expect(screen.queryByRole('tooltip')).toBeNull();

    await user.hover(longName);
    expect(screen.getByRole('tooltip')).toHaveTextContent(long);
  });
});

describe('US-16 AC-3: filter panel', () => {
  const entries = [entry(), entry({ id: 'BKG-002', kind: 'PENDING', venueId: 'VEN-002' })];

  function Harness({ onChange = () => {} }: { onChange?: (f: CalendarFilters) => void }) {
    const [filters, setFilters] = useState<CalendarFilters>(NO_FILTERS);
    const [open, setOpen] = useState(true);
    return (
      <FilterPanel
        filters={filters}
        counts={facetCounts(entries)}
        venues={venues}
        open={open}
        onOpenChange={setOpen}
        onChange={(next) => {
          setFilters(next);
          onChange(next);
        }}
      />
    );
  }

  it('US-16 AC-3: a venue search box replaces the "starts with" letters', async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(<Harness onChange={onChange} />);

    expect(screen.queryByText(/starts with/i)).toBeNull();
    await user.type(screen.getByRole('searchbox', { name: 'Search venues' }), 'seminar');

    // The Venue checkbox list narrows with the search.
    expect(screen.getByRole('checkbox', { name: /Seminar Room 3/ })).toBeInTheDocument();
    expect(screen.queryByRole('checkbox', { name: /Main Hall/ })).toBeNull();
    expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({ search: 'seminar' }));
    expect(screen.getByRole('button', { name: /Filters \(1\)/ })).toBeInTheDocument();
  });

  it('US-16: Available has no count; the other statuses keep theirs', () => {
    render(<Harness />);

    expect(screen.getByText('Available').closest('label')).toHaveTextContent(/^Available$/);
    expect(screen.getByText('Confirmed').closest('label')).toHaveTextContent('Confirmed1');
    expect(screen.getByText('Pending').closest('label')).toHaveTextContent('Pending1');
    expect(screen.getByText('Blocked').closest('label')).toHaveTextContent('Blocked0');
  });

  it('US-16: the panel collapses and expands', () => {
    render(<Harness />);
    const toggle = screen.getByRole('button', { name: /^Filters/ });
    expect(toggle).toHaveAttribute('aria-expanded', 'true');

    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByRole('searchbox')).toBeNull();

    fireEvent.click(toggle);
    expect(screen.getByRole('searchbox')).toBeInTheDocument();
  });

  it('US-16 AC-3: the search narrows the calendar itself, ignoring case', () => {
    const filtered = applyFilters(venues, entries, days, { ...NO_FILTERS(), search: '  MAIN ' });

    expect(filtered.venues.map((v) => v.id)).toEqual(['VEN-001']);
    expect(filtered.entries.map((e) => e.id)).toEqual(['BKG-001']);
  });
});
