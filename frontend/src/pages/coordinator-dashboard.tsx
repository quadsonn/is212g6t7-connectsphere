import { PageHeader } from '@/components/layout/app-shell';
import { Button } from '@/components/ui/button';
import { LinkButton } from '@/components/ui/link-button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { EmptyState, ErrorState, TableSkeleton } from '@/components/ui/states';
import { EventStatusBadge } from '@/features/events/components/event-status-badge';
import { useEvents } from '@/features/events/hooks/use-events';
import { apiErrorMessage } from '@/lib/api-client';
import { COORDINATOR_QUEUE_STATUSES } from '@/lib/status';
import { formatDateRange } from '@/lib/utils';

/**
 * REAL data — GET /events returns only events assigned to this coordinator
 * (US-02 AC-6). The queue filter below is presentation: the server has already
 * decided which events are visible; this narrows to those awaiting action.
 */
export function CoordinatorDashboard() {
  const { data: events, isPending, isError, error } = useEvents();

  const queue = events?.filter((event) =>
    COORDINATOR_QUEUE_STATUSES.includes(event.status),
  );

  return (
    <>
      <PageHeader
        title="Review queue"
        description="Requests assigned to you that are waiting on a decision."
      />

      <Card>
        <CardHeader>
          <CardTitle>Awaiting review</CardTitle>
          {queue ? <span className="text-sm text-ink-500">{queue.length} waiting</span> : null}
        </CardHeader>

        {isPending ? <TableSkeleton /> : null}

        {isError ? (
          <CardContent>
            <ErrorState message={apiErrorMessage(error, 'Could not load your queue.')} />
          </CardContent>
        ) : null}

        {queue && queue.length === 0 ? (
          <EmptyState
            title="Nothing waiting"
            description="Requests assigned to you appear here as soon as an organiser submits them."
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
                  </div>
                  <p className="mt-1 text-xs text-ink-500">
                    {formatDateRange(event.proposedStart, event.proposedEnd)} ·{' '}
                    {event.expectedAttendance} expected
                  </p>
                </div>

                {/* Placeholder — the review action is US-05. */}
                <div className="flex shrink-0 flex-wrap gap-2">
                  <LinkButton to={`/coordinator/events/${event.id}`} size="sm" variant="secondary">
                    View details
                  </LinkButton>
                  <Button size="sm" variant="secondary" disabled title="Not built yet">
                    Request clarification
                  </Button>
                  <Button size="sm" variant="secondary" disabled title="Not built yet">
                    Reject
                  </Button>
                  <Button size="sm" disabled title="Not built yet">
                    Approve
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        ) : null}
      </Card>
    </>
  );
}
