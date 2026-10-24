import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { describe, expect, it } from 'vitest';

import type { BookingQueueEntry } from '@/types/api';
import { urgencyFor } from '../queue-urgency';
import { QueueRow } from './queue-row';

// Wed 16 Oct 2030, 23:00 local — late in the day, so 24-hour periods and
// calendar days disagree about "tomorrow".
const NOW = new Date(2030, 9, 16, 23, 0);
const on = (day: number, hour = 9, minute = 0) => new Date(2030, 9, day, hour, minute).toISOString();

describe('US-22 AC-5: graded urgency', () => {
  it.each([
    [on(16, 20), 'critical', 'Event has started'],
    [on(16, 23, 30), 'critical', 'Event today'],
    [on(17), 'soon', 'Event tomorrow'],
    [on(18), 'soon', 'Event in 2 days'],
    [on(19), 'upcoming', 'in 3 days'],
    [on(23), 'upcoming', 'in 7 days'],
  ])('US-22 AC-5: an event at %s is %s ("%s")', (start, level, label) => {
    expect(urgencyFor(start, NOW)).toEqual({ level, label });
  });

  it('US-22 AC-5: more than a week away gets no indicator at all', () => {
    expect(urgencyFor(on(24), NOW)).toBeNull();
  });

  it('US-22 AC-5: 9am tomorrow is "tomorrow" even at 11pm, though under 24 hours away', () => {
    expect(urgencyFor(on(17, 9), NOW)?.label).toBe('Event tomorrow');
  });
});

const entry = (over: Partial<BookingQueueEntry> = {}): BookingQueueEntry =>
  ({
    id: 'BKG-007',
    status: 'REQUESTED',
    start: on(17, 9),
    end: on(17, 11),
    createdAt: on(3),
    expectedAttendance: 49,
    needsReview: false,
    urgent: true,
    daysUntilStart: 0,
    venue: { id: 'VEN-001', name: 'Main Hall' },
    event: { id: 'EVT-001', name: 'Quarterly town hall', status: 'APPROVED', organiser: { id: 'USR-1', name: 'Olive', email: 'o@x' } },
    requestedBy: { id: 'USR-2', name: 'Cora Coordinator', email: 'c@x' },
    ...over,
  }) as BookingQueueEntry;

function renderRow(props: Partial<Parameters<typeof QueueRow>[0]> = {}) {
  return render(
    <MemoryRouter initialEntries={['/venues/bookings']}>
      <Routes>
        <Route
          path="/venues/bookings"
          element={
            <ul>
              <QueueRow entry={entry()} urgency={urgencyFor(on(17), NOW)} showStatus={false} {...props} />
            </ul>
          }
        />
        <Route path="/venues/bookings/:id" element={<p>Details page</p>} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('US-22: queue row', () => {
  it('US-22: the whole row is one link to the details page, with no "View details" button', async () => {
    const user = userEvent.setup();
    renderRow();

    expect(screen.queryByText('View details')).toBeNull();
    const row = screen.getByRole('link', { name: /Quarterly town hall/ });
    expect(row).toHaveAttribute('href', '/venues/bookings/BKG-007');

    await user.click(screen.getByText('Main Hall', { exact: false }));
    expect(screen.getByText('Details page')).toBeInTheDocument();
  });

  it('US-22: the row opens from the keyboard', async () => {
    const user = userEvent.setup();
    renderRow();

    await user.tab();
    expect(screen.getByRole('link')).toHaveFocus();
    await user.keyboard('{Enter}');
    expect(screen.getByText('Details page')).toBeInTheDocument();
  });

  it('US-22 AC-5: red and amber rows get a thin left bar and a badge; upcoming is muted text with no bar', () => {
    const { unmount } = renderRow({ urgency: { level: 'critical', label: 'Event today' } });
    expect(screen.getByRole('link')).toHaveClass('border-l-red-500');
    expect(screen.getByRole('link')).not.toHaveClass('bg-red-50/40');
    expect(screen.getByText('Priority:', { exact: false }).parentElement).toHaveClass('bg-red-50');
    unmount();

    const amber = renderRow({ urgency: { level: 'soon', label: 'Event tomorrow' } });
    expect(screen.getByRole('link')).toHaveClass('border-l-amber-500');
    expect(screen.getByText('Event tomorrow').closest('span')).toHaveClass('bg-amber-50');
    amber.unmount();

    renderRow({ urgency: { level: 'upcoming', label: 'in 5 days' } });
    expect(screen.getByRole('link')).toHaveClass('border-l-transparent');
    expect(screen.queryByText('Priority:', { exact: false })).toBeNull();
    expect(screen.getByText('in 5 days')).toHaveClass('text-ink-500');
  });

  it('US-51: a conflict is a solid red badge; Pending rows carry no status badge', () => {
    renderRow({ entry: entry({ needsReview: true }) });

    expect(screen.getByText('Conflict – needs review').closest('span')).toHaveClass('bg-red-600', 'text-white');
    expect(screen.queryByText('Pending')).toBeNull();
  });

  it('US-22: the meta line is short, and times drop "local"', () => {
    renderRow();

    expect(screen.getByText('10 – 49 people · Cora Coordinator (Coordinator) · submitted 3 Oct')).toBeInTheDocument();
    expect(screen.getByRole('link')).not.toHaveTextContent('local');
  });
});
