import { useState } from 'react';
import { Plus } from 'lucide-react';
import { Link } from 'react-router-dom';

import { PageHeader } from '@/components/layout/app-shell';
import { Button } from '@/components/ui/button';
import { LinkButton } from '@/components/ui/link-button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { EmptyState, ErrorState, TableSkeleton } from '@/components/ui/states';
import { ClarificationPanel } from '@/features/events/components/clarification-panel';
import { EventStatusBadge } from '@/features/events/components/event-status-badge';
import { useMyRequest, useMyRequests } from '@/features/events/hooks/use-events';
import { apiErrorMessage } from '@/lib/api-client';
import { attendanceBandLabel } from '@/lib/attendance-bands';
import { formatDateRange } from '@/lib/utils';

/** REAL data — GET /events, scoped by the backend to this organiser's own. */
export function OrganiserDashboard() {
  // US-05: the Organiser-specific endpoint, which also carries decision
  // reasons and outstanding clarifications.
  const { data: events, isPending, isError, error } = useMyRequests();
  const [selectedEventId, setSelectedEventId] = useState<string | null>(null);
  // US-58: the Organiser's view, which carries the clarification thread.
  const detail = useMyRequest(selectedEventId ?? undefined);

  function closeDetail() {
    setSelectedEventId(null);
  }

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
                  <th scope="col" className="px-5 py-3 font-medium">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-ink-100">
                {events.map((event) => (
                  <tr key={event.id} className="relative hover:bg-ink-50">
                    <td className="px-5 py-3.5">
                      {/* A draft may have these fields still empty (US-04). The
                          after:inset-0 pseudo-element stretches this single
                          link to cover the whole row, so the row is clickable
                          without breaking table semantics or adding a second
                          tab stop. */}
                      <Link
                        to={`/organiser/${event.id}`}
                        className="static font-medium text-ink-900 after:absolute after:inset-0 after:content-[''] hover:underline"
                      >
                        {event.name ?? (
                          <span className="italic text-ink-400">Untitled draft</span>
                        )}
                      </Link>
                      <span className="mt-0.5 block max-w-md truncate text-xs text-ink-500">
                        {event.purpose ?? 'No purpose entered yet'}
                      </span>
                    </td>
                    <td className="px-5 py-3.5 text-ink-600">
                      {formatDateRange(event.proposedStart, event.proposedEnd)}
                    </td>
                    <td className="px-5 py-3.5 text-ink-600">
                      {attendanceBandLabel(event.expectedAttendance)}
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
                    <td className="px-5 py-3.5">
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={() => setSelectedEventId(event.id)}
                      >
                        View
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
      </Card>

      {selectedEventId ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink-900/40 px-4 py-6">
          <div
            className="max-h-full w-full max-w-2xl overflow-y-auto rounded-xl bg-white shadow-xl"
            role="dialog"
            aria-modal="true"
            aria-labelledby="organiser-event-title"
          >
            <div className="flex items-start justify-between gap-4 border-b border-ink-100 px-6 py-5">
              <div>
                <h2 id="organiser-event-title" className="text-lg font-semibold text-ink-900">
                  Event request
                </h2>
                <p className="mt-1 text-sm text-ink-500">Request details and clarification history.</p>
              </div>
              <Button type="button" size="sm" variant="ghost" onClick={closeDetail}>
                Close
              </Button>
            </div>

            {detail.isPending ? <p className="px-6 py-5 text-sm text-ink-500">Loading request details...</p> : null}
            {detail.isError ? (
              <p className="px-6 py-5 text-sm text-red-700">
                {apiErrorMessage(detail.error, 'Could not load this request.')}
              </p>
            ) : null}
            {detail.data ? (
              <div className="space-y-5 px-6 py-5">
                <div className="flex items-center justify-between gap-3">
                  <span className="text-sm font-medium text-ink-800">Current status</span>
                  <EventStatusBadge status={detail.data.status} />
                </div>

                <div className="space-y-4 text-sm text-ink-700">
                  <p><strong className="font-medium text-ink-900">Name:</strong> {detail.data.name ?? 'Not provided'}</p>
                  <p><strong className="font-medium text-ink-900">Purpose:</strong> {detail.data.purpose ?? 'Not provided'}</p>
                  <p><strong className="font-medium text-ink-900">Description:</strong> {detail.data.description ?? 'Not provided'}</p>
                  <p><strong className="font-medium text-ink-900">Proposed dates:</strong> {formatDateRange(detail.data.proposedStart, detail.data.proposedEnd)}</p>
                  <p><strong className="font-medium text-ink-900">Expected attendance:</strong> {detail.data.expectedAttendance ?? 'Not provided'}</p>
                </div>

                {detail.data.decisionReason ? (
                  <p className="rounded-lg bg-ink-50 p-3 text-sm text-ink-700">
                    <strong className="font-medium text-ink-900">Decision reason:</strong>{' '}
                    {detail.data.decisionReason}
                  </p>
                ) : null}

                <div className="space-y-2">
                  <h3 className="text-sm font-medium text-ink-800">Clarification history</h3>
                  {/* US-58: the same thread and reply form as the request page. */}
                  <ClarificationPanel key={detail.data.id} event={detail.data} onResponded={closeDetail} />
                </div>
              </div>
            ) : null}

          </div>
        </div>
      ) : null}
    </>
  );
}
