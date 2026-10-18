import { CheckCircle2 } from 'lucide-react';
import { useState } from 'react';
import { useLocation } from 'react-router-dom';

import { PageHeader } from '@/components/layout/app-shell';
import { LinkButton } from '@/components/ui/link-button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select } from '@/components/ui/form';
import { EmptyState, ErrorState, TableSkeleton } from '@/components/ui/states';
import { Badge } from '@/components/ui/badge';
import { useReplacementsNeeded } from '@/features/bookings/hooks/use-bookings';
import { EventStatusBadge } from '@/features/events/components/event-status-badge';
import { useEvents } from '@/features/events/hooks/use-events';
import { apiErrorMessage } from '@/lib/api-client';
import { COORDINATOR_QUEUE_STATUSES } from '@/lib/status';
import { formatDateRange } from '@/lib/utils';
import type { EventStatus } from '@/types/api';

/**
 * REAL data — GET /events returns only events assigned to this coordinator
 * (US-02 AC-6). The queue filter below is presentation: the server has already
 * decided which events are visible; this narrows to those awaiting action.
 */
export function CoordinatorDashboard() {
  const { data: events, isPending, isError, error } = useEvents();
  // US-52 AC-2: events with a booking whose venue became unavailable. The
  // server returns only this Coordinator's own.
  const { data: replacementsNeeded } = useReplacementsNeeded();
  const venueUnavailable = new Set((replacementsNeeded ?? []).map((b) => b.eventId));
  const [statusFilter, setStatusFilter] = useState<'ALL' | EventStatus>('ALL');
  // US-27: set when the Coordinator arrives here after reassigning an event.
  const notice = (useLocation().state as { notice?: string } | null)?.notice;

  const queue = events?.filter(
    (event) =>
      COORDINATOR_QUEUE_STATUSES.includes(event.status) &&
      (statusFilter === 'ALL' || event.status === statusFilter),
  );

  return (
    <>
      <PageHeader
        title="My events"
        description="Every event assigned to you, from new requests to confirmed events."
      />

      {notice ? (
        <div
          role="status"
          className="mb-4 flex items-center gap-3 rounded-lg border border-emerald-300 bg-emerald-50 px-4 py-3 text-sm text-emerald-900"
        >
          <CheckCircle2 className="size-4 shrink-0" aria-hidden="true" />
          {notice}
        </div>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>Awaiting review</CardTitle>
          <div className="flex items-center gap-3">
            {events ? (
              <Select
                aria-label="Filter event requests by status"
                className="h-9 w-auto min-w-44"
                value={statusFilter}
                onChange={(event) => setStatusFilter(event.target.value as 'ALL' | EventStatus)}
              >
                <option value="ALL">All outcomes</option>
                {COORDINATOR_QUEUE_STATUSES.map((status) => (
                  <option key={status} value={status}>
                    {status.replaceAll('_', ' ')}
                  </option>
                ))}
              </Select>
            ) : null}
            {queue ? <span className="text-sm text-ink-500">{queue.length} waiting</span> : null}
          </div>
        </CardHeader>

        {isPending ? <TableSkeleton /> : null}

        {isError ? (
          <CardContent>
            <ErrorState message={apiErrorMessage(error, 'Could not load your queue.')} />
          </CardContent>
        ) : null}

        {queue && queue.length === 0 ? (
          <EmptyState
            title={statusFilter === 'ALL' ? 'Nothing waiting' : 'No requests found'}
            description={
              statusFilter === 'ALL'
                ? 'Requests assigned to you appear here as soon as an organiser submits them.'
                : 'No requests currently match this status filter.'
            }
          />
        ) : null}

        {queue && queue.length > 0 ? (
          <ul className="divide-y divide-ink-100">
            {queue.map((event) => (
              <li key={event.id} className="flex flex-wrap items-center gap-4 px-5 py-4">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2.5">
                    <span className="truncate font-medium text-ink-900">{event.name}</span>
                    <EventStatusBadge status={event.status} />
                    {venueUnavailable.has(event.id) ? (
                      <Badge className="bg-red-50 text-red-800 ring-red-300">Venue unavailable</Badge>
                    ) : null}
                  </div>
                  <p className="mt-1 text-xs text-ink-500">
                    {formatDateRange(event.proposedStart, event.proposedEnd)} ·{' '}
                    {event.expectedAttendance} expected
                  </p>
                </div>

                <div className="flex shrink-0 flex-wrap gap-2">
                  <LinkButton to={`/coordinator/events/${event.id}`} size="sm" variant="secondary">
                    View details
                  </LinkButton>
                </div>
              </li>
            ))}
          </ul>
        ) : null}
      </Card>
    </>
  );
}
