import { AlertTriangle } from 'lucide-react';
import { useMemo, useState } from 'react';

import { PageHeader } from '@/components/layout/app-shell';
import { Badge } from '@/components/ui/badge';
import { Card, CardHeader } from '@/components/ui/card';
import { Field, Select } from '@/components/ui/form';
import { LinkButton } from '@/components/ui/link-button';
import { EmptyState, ErrorState, TableSkeleton } from '@/components/ui/states';
import { useAuth } from '@/features/auth/hooks/use-auth';
import { BookingStatusBadge } from '@/features/bookings/components/booking-status-badge';
import { NeedsReviewBadge } from '@/features/bookings/components/needs-review-badge';
import { useBookingQueue } from '@/features/bookings/hooks/use-bookings';
import { useVenues } from '@/features/venues/hooks/use-venues';
import { apiErrorMessage } from '@/lib/api-client';
import { cn, formatDate, formatDateRange } from '@/lib/utils';
import type { BookingQueueEntry, BookingQueueQuery, BookingStatus } from '@/types/api';
import { DatePicker } from '@/components/ui/date-picker';

type View = 'pending' | 'decided';

/** AC-3: the sort options, as one select. */
const SORTS = {
  'eventDate-asc': 'Event date — soonest first',
  'eventDate-desc': 'Event date — latest first',
  'submitted-desc': 'Submitted — newest first',
  'submitted-asc': 'Submitted — oldest first',
} as const;
type SortKey = keyof typeof SORTS;

const DEFAULT_SORT: Record<View, SortKey> = {
  pending: 'eventDate-asc',
  decided: 'submitted-desc',
};

/** "2030-10-01" -> start or end of that Singapore day, as a UTC instant. */
function dayBoundary(date: string, end: boolean): string | undefined {
  if (!date) return undefined;
  // +08:00: the queue filters by the venue's (Singapore) calendar day.
  return new Date(`${date}T${end ? '23:59:59.999' : '00:00:00'}+08:00`).toISOString();
}

/** AC-5: how close the event is, in words. */
function urgencyLabel(days: number): string {
  if (days < 0) return 'Event has started';
  if (days === 0) return 'Event today';
  if (days === 1) return 'Event tomorrow';
  return `Event in ${days} days`;
}

function QueueRow({ entry }: { entry: BookingQueueEntry }) {
  return (
    <li
      className={cn(
        'flex flex-wrap items-start justify-between gap-3 px-5 py-4',
        entry.urgent && 'border-l-4 border-l-red-500 bg-red-50/40',
        // US-44: released bookings hold nothing; kept in the history, greyed.
        entry.status === 'RELEASED' && 'opacity-60',
      )}
    >
      <div className="min-w-0 space-y-1">
        <div className="flex flex-wrap items-center gap-2">
          <p className="font-medium text-ink-900">{entry.event.name ?? 'Untitled event'}</p>
          {entry.urgent ? (
            <Badge className="bg-red-50 text-red-800 ring-red-300" srPrefix="Priority">
              <AlertTriangle className="size-3" aria-hidden="true" />
              {urgencyLabel(entry.daysUntilStart)}
            </Badge>
          ) : null}
        </div>
        <p className="text-sm text-ink-700">
          {entry.venue.name} · {formatDateRange(entry.start, entry.end)}
        </p>
        <p className="text-xs text-ink-500">
          {entry.expectedAttendance ?? '—'} expected · requested by{' '}
          {entry.requestedBy?.name ?? '—'} for organiser {entry.event.organiser.name} · submitted{' '}
          {formatDate(entry.createdAt)}
        </p>
      </div>
      <div className="flex items-center gap-3">
        {entry.needsReview ? <NeedsReviewBadge /> : null}
        <BookingStatusBadge status={entry.status} />
        <LinkButton to={`/venues/bookings/${entry.id}`} variant="secondary" size="sm">
          View details
        </LinkButton>
      </div>
    </li>
  );
}

/** US-22 — the Venue Staff member's queue of booking requests. */
export function VenueBookingQueue() {
  const { session } = useAuth();
  const { data: venues } = useVenues({ sortBy: 'name' });
  // AC-4: the venue filter offers only venues this staff member manages.
  const myVenues = useMemo(
    () => venues?.filter((v) => v.managedById === session?.userId && v.status === 'PUBLISHED') ?? [],
    [venues, session],
  );

  const [view, setView] = useState<View>('pending');
  const [venueId, setVenueId] = useState('');
  const [status, setStatus] = useState<BookingStatus | ''>('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [sort, setSort] = useState<SortKey>(DEFAULT_SORT.pending);

  const [sortBy, sortOrder] = sort.split('-') as [
    BookingQueueQuery['sortBy'],
    BookingQueueQuery['sortOrder'],
  ];
  const query: BookingQueueQuery = {
    view,
    sortBy,
    sortOrder,
    ...(venueId ? { venueId } : {}),
    ...(view === 'decided' && status ? { status } : {}),
    ...(from ? { from: dayBoundary(from, false) } : {}),
    ...(to ? { to: dayBoundary(to, true) } : {}),
  };
  const { data: entries, isPending, isError, error } = useBookingQueue(query);
  const urgentCount = entries?.filter((e) => e.urgent).length ?? 0;

  function switchView(next: View) {
    setView(next);
    setStatus('');
    setSort(DEFAULT_SORT[next]);
  }

  return (
    <>
      <PageHeader
        title="Booking requests"
        description="Venue booking requests for the venues you manage."
      />

      <Card aria-busy={isPending}>
        <CardHeader>
          {/* AC-7: pending and decided are separate views. */}
          <div role="tablist" aria-label="Queue view" className="flex gap-1 rounded-lg bg-ink-100 p-1">
            {(['pending', 'decided'] as const).map((tab) => (
              <button
                key={tab}
                type="button"
                role="tab"
                aria-selected={view === tab}
                onClick={() => switchView(tab)}
                className={cn(
                  'rounded-md px-3 py-1.5 text-sm font-medium transition-colors',
                  view === tab ? 'bg-white text-ink-900 shadow-sm' : 'text-ink-600 hover:text-ink-900',
                )}
              >
                {tab === 'pending' ? 'Pending' : 'Decided'}
              </button>
            ))}
          </div>
          <p className="text-sm text-ink-500">
            {entries ? `${entries.length} ${view === 'pending' ? 'waiting' : 'decided'}` : ''}
            {urgentCount > 0 ? ` · ${urgentCount} due within a week` : ''}
          </p>
        </CardHeader>

        {/* AC-3 / AC-4 */}
        <div className="grid grid-cols-1 gap-3 border-b border-ink-200 px-5 py-4 sm:grid-cols-2 lg:grid-cols-5">
          <Field label="Venue" htmlFor="queue-venue">
            <Select id="queue-venue" value={venueId} onChange={(e) => setVenueId(e.target.value)}>
              <option value="">All my venues</option>
              {myVenues.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="From" htmlFor="queue-from">
            {/* Filters look back as well as forward, so past dates stay selectable. */}
            <DatePicker id="queue-from" label="From" value={from} onChange={setFrom} />
          </Field>
          <Field label="To" htmlFor="queue-to">
            <DatePicker id="queue-to" label="To" value={to} onChange={setTo} min={from || undefined} />
          </Field>
          {view === 'decided' ? (
            <Field label="Status" htmlFor="queue-status">
              <Select
                id="queue-status"
                value={status}
                onChange={(e) => setStatus(e.target.value as BookingStatus | '')}
              >
                <option value="">Approved, rejected and released</option>
                <option value="APPROVED">Approved</option>
                <option value="REJECTED">Rejected</option>
                {/* US-44: event cancelled, or a hold released or expired. */}
                <option value="RELEASED">Released</option>
              </Select>
            </Field>
          ) : null}
          <Field label="Sort by" htmlFor="queue-sort">
            <Select id="queue-sort" value={sort} onChange={(e) => setSort(e.target.value as SortKey)}>
              {Object.entries(SORTS).map(([key, label]) => (
                <option key={key} value={key}>
                  {label}
                </option>
              ))}
            </Select>
          </Field>
        </div>

        {view === 'pending' && urgentCount > 0 ? (
          <p className="border-b border-ink-200 bg-red-50 px-5 py-2 text-xs text-red-900">
            Requests with less than a week before the event are flagged and shown first.
          </p>
        ) : null}

        {isPending ? <TableSkeleton /> : null}
        {isError ? (
          <div className="p-5">
            <ErrorState message={apiErrorMessage(error, 'Could not load booking requests.')} />
          </div>
        ) : null}

        {entries && entries.length === 0 ? (
          <EmptyState
            title={view === 'pending' ? 'No pending requests' : 'No decided requests'}
            description={
              view === 'pending'
                ? 'Booking requests for your venues will appear here when Coordinators submit them.'
                : 'Requests you approve or reject will appear here.'
            }
          />
        ) : null}

        {entries && entries.length > 0 ? (
          <ul className="divide-y divide-ink-100">
            {entries.map((entry) => (
              <QueueRow key={entry.id} entry={entry} />
            ))}
          </ul>
        ) : null}
      </Card>
    </>
  );
}
