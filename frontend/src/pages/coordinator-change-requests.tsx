import { CheckCircle2 } from 'lucide-react';
import { useLocation } from 'react-router-dom';

import { PageHeader } from '@/components/layout/app-shell';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { LinkButton } from '@/components/ui/link-button';
import { EmptyState, ErrorState, TableSkeleton } from '@/components/ui/states';
import { EventStatusBadge } from '@/features/events/components/event-status-badge';
import { usePendingChangeRequests } from '@/features/events/hooks/use-events';
import { apiErrorMessage } from '@/lib/api-client';
import { formatDate, STRETCHED_LINK } from '@/lib/utils';

/**
 * US-38 AC-1 — change requests waiting on this Coordinator. The server returns
 * only requests on events assigned to them; nothing is filtered here.
 */
export function CoordinatorChangeRequests() {
  const { data: requests, isPending, isError, error } = usePendingChangeRequests();
  // Set when the Coordinator arrives here after approving or rejecting one.
  const notice = (useLocation().state as { notice?: string } | null)?.notice;

  return (
    <>
      <PageHeader
        title="Change requests"
        description="Changes Organisers have asked for on events assigned to you."
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
          <CardTitle>Pending</CardTitle>
          {requests ? <span className="text-sm text-ink-500">{requests.length} waiting</span> : null}
        </CardHeader>

        {isPending ? <TableSkeleton /> : null}

        {isError ? (
          <CardContent>
            <ErrorState message={apiErrorMessage(error, 'Could not load change requests.')} />
          </CardContent>
        ) : null}

        {requests && requests.length === 0 ? (
          <EmptyState
            title="No pending change requests"
            description="When an Organiser asks to change one of your events, it appears here."
          />
        ) : null}

        {requests && requests.length > 0 ? (
          <ul className="divide-y divide-ink-100">
            {requests.map((request) => (
              <li
                key={request.id}
                className="group relative flex flex-wrap items-center gap-4 px-5 py-4 transition-colors hover:bg-ink-50"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2.5">
                    <span className="truncate font-medium text-ink-900 group-hover:text-brand-700 group-hover:underline">
                      {request.event.name ?? 'Untitled event'}
                    </span>
                    <EventStatusBadge status={request.event.status} />
                  </div>
                  <p className="mt-1 line-clamp-1 text-sm text-ink-600">{request.reason}</p>
                  <p className="mt-1 text-xs text-ink-500">
                    Requested by {request.requestedBy.name} · {formatDate(request.createdAt)}
                  </p>
                </div>

                <div className="flex shrink-0 flex-wrap gap-2">
                  <LinkButton
                    to={`/coordinator/events/${request.event.id}`}
                    size="sm"
                    variant="secondary"
                    className={STRETCHED_LINK}
                  >
                    View details
                  </LinkButton>
                  <LinkButton
                    to={`/coordinator/change-requests/${request.id}`}
                    size="sm"
                    className="relative z-10"
                  >
                    Review
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
