import { PageHeader } from '@/components/layout/app-shell';
import { Card, CardHeader } from '@/components/ui/card';
import { LinkButton } from '@/components/ui/link-button';
import { EmptyState, ErrorState, TableSkeleton } from '@/components/ui/states';
import { useQueue } from '@/features/assignments/hooks/use-assignments';
import { apiErrorMessage } from '@/lib/api-client';
import { formatDateRange, formatDateTime } from '@/lib/utils';
import type { QueueEntry } from '@/types/api';

function QueueRow({ entry }: { entry: QueueEntry }) {
  return (
    <li className="flex flex-wrap items-start justify-between gap-3 px-5 py-4">
      <div className="min-w-0 space-y-1">
        <p className="font-medium text-ink-900">{entry.name ?? 'Untitled event'}</p>
        <p className="text-sm text-ink-700">
          {entry.organiser.name} · {entry.organisation ?? 'No organisation recorded'}
          {entry.category ? ` · ${entry.category}` : ''}
        </p>
        <p className="text-sm text-ink-700">
          Preferred {formatDateRange(entry.proposedStart, entry.proposedEnd)} ·{' '}
          {entry.expectedAttendance ?? '—'} expected
        </p>
        <p className="text-xs text-ink-500">
          Submitted {entry.submittedAt ? formatDateTime(entry.submittedAt) : '—'}
        </p>
      </div>
      <LinkButton to={`/lead/unassigned/${entry.id}`} variant="secondary" size="sm">
        Open
      </LinkButton>
    </li>
  );
}

/** The Lead's queue of submitted requests that have no Coordinator yet. */
export function LeadUnassignedQueue() {
  const { data: entries, isPending, isError, error } = useQueue();

  return (
    <>
      <PageHeader
        title="Unassigned queue"
        description="Submitted requests waiting for a Coordinator, oldest first."
      />

      <Card aria-busy={isPending}>
        <CardHeader>
          <p className="text-sm text-ink-500">
            {entries ? `${entries.length} waiting for assignment` : ''}
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
            title="The queue is empty"
            description="New event requests appear here as soon as an Organiser submits them."
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
