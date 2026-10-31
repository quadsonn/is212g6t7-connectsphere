import { PageHeader } from '@/components/layout/app-shell';
import { Badge } from '@/components/ui/badge';
import { Card, CardHeader } from '@/components/ui/card';
import { LinkButton } from '@/components/ui/link-button';
import { EmptyState, ErrorState, TableSkeleton } from '@/components/ui/states';
import { useSafetyQueue } from '@/features/safety/hooks/use-safety';
import { attendanceBandLabel } from '@/lib/attendance-bands';
import { apiErrorMessage } from '@/lib/api-client';
import { formatDate, formatDateTime, STRETCHED_LINK } from '@/lib/utils';
import type { SafetyQueueEntry } from '@/types/api';

function QueueRow({ entry }: { entry: SafetyQueueEntry }) {
  return (
    <li className="group relative flex flex-wrap items-start justify-between gap-3 px-5 py-4 transition-colors hover:bg-ink-50">
      <div className="min-w-0 space-y-1">
        <div className="flex flex-wrap items-center gap-2">
          <p className="font-medium text-ink-900 group-hover:text-brand-700 group-hover:underline">
            {entry.name ?? 'Untitled event'}
          </p>
          {entry.previousReviews > 0 ? (
            <Badge className="bg-amber-50 text-amber-900 ring-amber-400" srPrefix="Re-check">
              Re-check · {entry.previousReviews} earlier
            </Badge>
          ) : null}
        </div>
        <p className="text-sm text-ink-700">
          {attendanceBandLabel(entry.expectedAttendance)} expected ·{' '}
          {entry.proposedStart ? formatDate(entry.proposedStart) : 'Date not set'}
        </p>
        <p className="text-sm text-ink-700">
          {entry.venues.length > 0
            ? entry.venues
                .map((v) => `${v.name ?? 'Venue'} (capacity ${v.capacity ?? '—'})`)
                .join(', ')
            : 'No venue'}
        </p>
        <p className="text-xs text-ink-500">
          Coordinator {entry.coordinator?.name ?? '—'} · waiting since{' '}
          {entry.queuedAt ? formatDateTime(entry.queuedAt) : '—'}
        </p>
      </div>
      <LinkButton to={`/safety/checks/${entry.id}`} variant="secondary" size="sm" className={STRETCHED_LINK}>
        Review
      </LinkButton>
    </li>
  );
}

/** The Safety Officer's queue: events whose arrangements are confirmed. */
export function SafetyQueue() {
  const { data: entries, isPending, isError, error } = useSafetyQueue();

  return (
    <>
      <PageHeader
        title="Safety checks"
        description="Events whose venue and equipment are confirmed, waiting for an operational safety check. Longest-waiting first."
      />

      <Card aria-busy={isPending}>
        <CardHeader>
          <p className="text-sm text-ink-500">
            {entries ? `${entries.length} waiting for a check` : ''}
          </p>
        </CardHeader>

        {isPending ? <TableSkeleton /> : null}
        {isError ? (
          <div className="p-5">
            <ErrorState message={apiErrorMessage(error, 'Could not load the queue.')} />
          </div>
        ) : null}

        {entries && entries.length === 0 ? (
          <EmptyState
            title="Nothing waiting"
            description="An event appears here once all its venue bookings are approved and its requested equipment is reserved."
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
