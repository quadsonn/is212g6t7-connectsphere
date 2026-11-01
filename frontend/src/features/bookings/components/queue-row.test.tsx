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

describe('US-21 AC-5: graded urgency', () => {
  // TC-S2-45 · US-21 AC-5 · fails if a request's urgency was graded wrongly
  // Code: urgencyFor(start) grades started, today, tomorrow and this-week events.
  it.each([
    [on(16, 20), 'critical', 'Event has started'],
    [on(16, 23, 30), 'critical', 'Event today'],
    [on(17), 'soon', 'Event tomorrow'],
    [on(18), 'soon', 'Event in 2 days'],
    [on(19), 'upcoming', 'in 3 days'],
    [on(23), 'upcoming', 'in 7 days'],
  ])('US-21 AC-5: an event at %s is %s ("%s")', (start, level, label) => {
    expect(urgencyFor(start, NOW)).toEqual({ level, label });
  });

  // TC-S2-45 · US-21 AC-5 · fails if a request more than a week away was flagged
  // Code: urgencyFor() returns null beyond seven days.
  it('US-21 AC-5: more than a week away gets no indicator at all', () => {
    expect(urgencyFor(on(24), NOW)).toBeNull();
  });

  // TC-S2-45 · US-21 AC-5 · fails if "tomorrow" was judged by hours instead of calendar days
  // Code: urgencyFor() compares calendar days.
  it('US-21 AC-5: 9am tomorrow is "tomorrow" even at 11pm, though under 24 hours away', () => {
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

describe('US-21: queue row', () => {
  // TC-S2-46 · US-21 AC-6 · fails if clicking an entry did not open its full request
  // Code: QueueRow is one link to /venues/bookings/:id.
  it('US-21: the whole row is one link to the details page, with no "View details" button', async () => {
    const user = userEvent.setup();
    renderRow();

    expect(screen.queryByText('View details')).toBeNull();
    const row = screen.getByRole('link', { name: /Quarterly town hall/ });
    expect(row).toHaveAttribute('href', '/venues/bookings/BKG-007');

    await user.click(screen.getByText('Main Hall', { exact: false }));
    expect(screen.getByText('Details page')).toBeInTheDocument();
  });

  // TC-S2-46 · US-21 AC-6 · fails if an entry could not be opened without a mouse
  // Code: the row link is focusable and opens on Enter.
  it('US-21: the row opens from the keyboard', async () => {
    const user = userEvent.setup();
    renderRow();

    await user.tab();
    expect(screen.getByRole('link')).toHaveFocus();
    await user.keyboard('{Enter}');
    expect(screen.getByText('Details page')).toBeInTheDocument();
  });

  // TC-S2-45 · US-21 AC-5 · fails if urgent requests were not visibly flagged
  // Code: QueueRow styles each urgency level with a bar and badge.
  it('US-21 AC-5: red and amber rows get a thin left bar and a badge; upcoming is muted text with no bar', () => {
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

  // TC-S2-42 · US-21 AC-2 · fails if an entry's date, time, attendance and requester did not fit at a glance
  // Code: QueueRow's meta line shows venue, time, attendance and requester.
  it('US-21: the meta line is short, and times drop "local"', () => {
    renderRow();

    expect(screen.getByText('10 – 49 people · Cora Coordinator (Coordinator) · submitted 3 Oct')).toBeInTheDocument();
    expect(screen.getByRole('link')).not.toHaveTextContent('local');
  });
});
