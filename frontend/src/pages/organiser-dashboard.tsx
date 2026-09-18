import { Plus } from 'lucide-react';

import { PageHeader } from '@/components/layout/app-shell';
import { LinkButton } from '@/components/ui/link-button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { EmptyState, ErrorState, TableSkeleton } from '@/components/ui/states';
import { EventStatusBadge } from '@/features/events/components/event-status-badge';
import { useMyRequests } from '@/features/events/hooks/use-events';
import { apiErrorMessage } from '@/lib/api-client';
import { formatDateRange } from '@/lib/utils';

/** REAL data — GET /events, scoped by the backend to this organiser's own. */
export function OrganiserDashboard() {
  // US-05: the Organiser-specific endpoint, which also carries decision
  // reasons and outstanding clarifications.
  const { data: events, isPending, isError, error } = useMyRequests();

  return (
    <>
      <PageHeader
        title="My event requests"
        description="Requests you have raised, and where each one has reached."
        action={
          <LinkButton to="/organiser/new">
            <Plus className="size-4" aria-hidden="true" />
            New event request
          </LinkButton>
        }
      />

      <Card>
        <CardHeader>
          <CardTitle>Requests</CardTitle>
          {events ? (
            <span className="text-sm text-ink-500">{events.length} total</span>
          ) : null}
        </CardHeader>

        {isPending ? <TableSkeleton /> : null}

        {isError ? (
          <CardContent>
            <ErrorState message={apiErrorMessage(error, 'Could not load your requests.')} />
          </CardContent>
        ) : null}

        {events && events.length === 0 ? (
          <EmptyState
            title="No requests yet"
            description="When you raise an event request it will appear here with its current status."
            action={
              <LinkButton to="/organiser/new">
                <Plus className="size-4" aria-hidden="true" />
                New event request
              </LinkButton>
            }
          />
        ) : null}

        {events && events.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <caption className="sr-only">Your event requests and their status</caption>
              <thead className="border-b border-ink-200 text-xs uppercase tracking-wide text-ink-500">
                <tr>
                  <th scope="col" className="px-5 py-3 font-medium">Event</th>
                  <th scope="col" className="px-5 py-3 font-medium">Proposed dates</th>
                  <th scope="col" className="px-5 py-3 font-medium">Attendance</th>
                  <th scope="col" className="px-5 py-3 font-medium">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-ink-100">
                {events.map((event) => (
                  <tr key={event.id} className="hover:bg-ink-50">
                    <td className="px-5 py-3.5">
                      {/* A draft may have these fields still empty (US-04). */}
                      <span className="font-medium text-ink-900">
                        {event.name ?? (
                          <span className="italic text-ink-400">Untitled draft</span>
                        )}
                      </span>
                      <span className="mt-0.5 block max-w-md truncate text-xs text-ink-500">
                        {event.purpose ?? 'No purpose entered yet'}
                      </span>
                    </td>
                    <td className="px-5 py-3.5 text-ink-600">
                      {formatDateRange(event.proposedStart, event.proposedEnd)}
                    </td>
                    <td className="px-5 py-3.5 text-ink-600">
                      {event.expectedAttendance ?? '—'}
                    </td>
                    <td className="px-5 py-3.5">
                      <EventStatusBadge status={event.status} />
                      {event.status === 'REJECTED' && event.statusView.decision ? (
                        <p className="mt-1 max-w-xs text-xs text-ink-500">
                          {event.statusView.decision.reason ?? (
                            <span className="italic">No reason given</span>
                          )}
                        </p>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
      </Card>
    </>
  );
}
