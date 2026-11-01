import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { EventChangeEntry, EventChangeHistory } from '@/types/api';
import { eventsApi } from '../api/events.api';
import { ChangeHistory } from './change-history';

/**
 * UI tests for US-25 (View history of changes made to an event's information):
 * the Change history card on the Coordinator's event page, rendered with React
 * Testing Library, API mocked. What the server records, and in what order, is
 * proven by test/events-planning-history.e2e-spec.ts (and the reassignment
 * entry by test/events-reassign.e2e-spec.ts); the browser journey by
 * e2e/us24-us27-planning.spec.ts.
 */

vi.mock('../api/events.api', () => ({ eventsApi: { getHistory: vi.fn() } }));

const api = vi.mocked(eventsApi);

const coordinator = { id: 'USR-004', name: 'Cody Coordinator', email: 'coord.a@example.com', role: 'EVENT_COORDINATOR' } as const;

const entry = (id: string, createdAt: string, changes: EventChangeEntry['changes'], extra: Partial<EventChangeEntry> = {}) =>
  ({
    id,
    eventId: 'EVT-105',
    changes,
    requiresReview: false,
    affectedArrangements: [],
    createdAt,
    changedBy: coordinator,
    ...extra,
  }) as EventChangeEntry;

const history = (entries: EventChangeEntry[], message: string | null = null): EventChangeHistory => ({
  eventId: 'EVT-105',
  entries,
  message,
});

const renderHistory = () =>
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <ChangeHistory eventId="EVT-105" />
    </QueryClientProvider>,
  );

beforeEach(() => {
  vi.resetAllMocks();
});

describe('US-25 AC-1, AC-2: each change, in order, with before, after, who and when', () => {
  // TC-S2-75, TC-S2-79 · US-25 AC-1, AC-2 · fails if entries were reordered, or one lacked the field, previous and new value, who or when
  // Code: ChangeHistory lists entries in the order the server sends (oldest first), each with a <time>, the
  // person and role, and a Field / Previous / New table formatted by formatChangeValue().
  it('lists the changes in order, each with what changed, from what, to what, by whom and when', async () => {
    api.getHistory.mockResolvedValue(
      history([
        entry('CHG-001', '2026-10-01T02:00:00.000Z', [{ field: 'expectedAttendance', previous: 320, next: 350 }]),
        entry('CHG-002', '2026-10-02T02:00:00.000Z', [{ field: 'programme', previous: null, next: 'First draft' }]),
      ]),
    );
    renderHistory();

    const items = await screen.findAllByRole('listitem');
    expect(items).toHaveLength(2);
    expect(screen.getByText('2 changes')).toBeInTheDocument();

    const [first, second] = items;
    expect(within(first).getByRole('row', { name: 'Expected attendance 320 350' })).toBeInTheDocument();
    expect(within(first).getByText('Cody Coordinator (Event Coordinator)')).toBeInTheDocument();
    expect(within(first).getByText((_, el) => el?.tagName === 'TIME')).toHaveAttribute(
      'datetime',
      '2026-10-01T02:00:00.000Z',
    );
    expect(within(second).getByRole('row', { name: 'Programme — First draft' })).toBeInTheDocument();
  });

  // TC-S2-71 · US-24 AC-2, US-25 AC-2 · fails if a change flagged for review looked like an ordinary one in the history
  // Code: an entry with requiresReview shows a "Requires review" badge and the arrangements it affects.
  it('marks a flagged change and names the arrangement it affects', async () => {
    api.getHistory.mockResolvedValue(
      history([
        entry('CHG-001', '2026-10-01T02:00:00.000Z', [{ field: 'expectedAttendance', previous: 320, next: 500 }], {
          requiresReview: true,
          affectedArrangements: ['VENUE_BOOKING'],
        }),
      ]),
    );
    renderHistory();

    expect(await screen.findByText('Requires review')).toBeInTheDocument();
    expect(screen.getByText('Affects: Confirmed venue booking')).toBeInTheDocument();
  });

  // TC-S2-88 · US-26 AC-4 · fails if a reassignment did not read as a change of Coordinator in the history
  // Code: CHANGE_FIELD_LABELS.coordinator = 'Coordinator'; the names are shown as stored.
  it('shows a reassignment as the Coordinator changing from one to the other', async () => {
    api.getHistory.mockResolvedValue(
      history([
        entry('CHG-001', '2026-10-01T02:00:00.000Z', [
          { field: 'coordinator', previous: 'Cody Coordinator', next: 'Casey Coordinator' },
        ], { changedBy: { id: 'USR-012', name: 'Leah Lead', email: 'lead@example.com', role: 'EVENT_COORDINATOR_LEAD' } }),
      ]),
    );
    renderHistory();

    expect(await screen.findByRole('row', { name: 'Coordinator Cody Coordinator Casey Coordinator' })).toBeInTheDocument();
    expect(screen.getByText(/Leah Lead/)).toBeInTheDocument();
  });
});

describe('US-25 AC-3: no changes recorded', () => {
  // TC-S2-80 · US-25 AC-3 · fails if an event with no changes showed an empty card without saying why
  // Code: with no entries, ChangeHistory shows the server's message instead of a list.
  it('says that no changes have been recorded', async () => {
    api.getHistory.mockResolvedValue(
      history([], 'No changes have been recorded for this event since it was created.'),
    );
    renderHistory();

    expect(
      await screen.findByText('No changes have been recorded for this event since it was created.'),
    ).toBeInTheDocument();
    expect(screen.queryByRole('listitem')).not.toBeInTheDocument();
  });
});
