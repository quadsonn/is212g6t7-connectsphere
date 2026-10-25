import { ArrowLeft } from 'lucide-react';
import { useParams } from 'react-router-dom';

import { PageHeader } from '@/components/layout/app-shell';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { LinkButton } from '@/components/ui/link-button';
import { EmptyState, ErrorState, LoadingState, TableSkeleton } from '@/components/ui/states';
import { EventStatusBadge } from '@/features/events/components/event-status-badge';
import { TechnicalRequirementsView } from '@/features/events/components/technical-requirements';
import { useRelatedEvent, useRelatedEvents } from '@/features/events/hooks/use-events';
import { attendanceBandLabel } from '@/lib/attendance-bands';
import { apiErrorMessage } from '@/lib/api-client';
import { formatDateRange, humanise } from '@/lib/utils';
import { ACCESSIBILITY_FEATURE_LABELS } from '@/types/api';

/**
 * US-25 AC-3 — Venue Staff and Technical Support see the latest saved
 * information of events their work is tied to. The server decides which
 * events those are (RELATED scope: a venue booking, or an equipment
 * reservation); this page only renders what comes back.
 *
 * Shared by both roles; `basePath` is where the role's routes live.
 */
export function RelatedEventsList({ basePath }: { basePath: string }) {
  const { data: events, isPending, isError, error } = useRelatedEvents();

  return (
    <>
      <PageHeader
        title="Related events"
        description="Events that need your venues or equipment, with their latest details."
      />

      <Card>
        {isPending ? <TableSkeleton /> : null}

        {isError ? (
          <CardContent>
            <ErrorState message={apiErrorMessage(error, 'Could not load events.')} />
          </CardContent>
        ) : null}

        {events && events.length === 0 ? (
          <EmptyState
            title="No related events"
            description="Events appear here once they have a booking, a reservation, or recorded equipment requirements."
          />
        ) : null}

        {events && events.length > 0 ? (
          <ul className="divide-y divide-ink-100">
            {events.map((event) => (
              <li key={event.id} className="flex flex-wrap items-center gap-4 px-5 py-4">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2.5">
                    <span className="truncate font-medium text-ink-900">{event.name}</span>
                    <EventStatusBadge status={event.status} />
                  </div>
                  <p className="mt-1 text-xs text-ink-500">
                    {formatDateRange(event.proposedStart, event.proposedEnd)} ·{' '}
                    {attendanceBandLabel(event.expectedAttendance)} expected
                  </p>
                </div>
                <LinkButton to={`${basePath}/${event.id}`} size="sm" variant="secondary">
                  View details
                </LinkButton>
              </li>
            ))}
          </ul>
        ) : null}
      </Card>
    </>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="text-xs font-medium uppercase tracking-wide text-ink-500">{label}</dt>
      <dd className="mt-1 whitespace-pre-line text-sm text-ink-900">{children}</dd>
    </div>
  );
}

export function RelatedEventDetail({ basePath }: { basePath: string }) {
  const { id } = useParams<{ id: string }>();
  const { data: event, isPending, isError, error } = useRelatedEvent(id ?? '');

  return (
    <>
      <PageHeader
        title={event?.name ?? 'Event'}
        description="The latest saved information for this event."
        action={
          <LinkButton to={basePath} variant="secondary" size="sm">
            <ArrowLeft className="size-4" aria-hidden="true" />
            Back to events
          </LinkButton>
        }
      />

      {isPending ? <LoadingState label="Loading event…" /> : null}
      {isError ? <ErrorState message={apiErrorMessage(error, 'Could not load this event.')} /> : null}

      {event ? (
        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Overview</CardTitle>
              <div className="flex items-center gap-3">
                <EventStatusBadge status={event.status} />
                <span className="text-xs text-ink-500">
                  Last updated {new Date(event.updatedAt).toLocaleString()}
                </span>
              </div>
            </CardHeader>
            <CardContent>
              <dl className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <Field label="Dates">{formatDateRange(event.proposedStart, event.proposedEnd)}</Field>
                <Field label="Expected attendance">{attendanceBandLabel(event.expectedAttendance)}</Field>
                <Field label="Preferred layout">
                  {event.preferredLayout ? humanise(event.preferredLayout) : 'No preference'}
                </Field>
                <Field label="Layout notes">{event.layoutNotes ?? '—'}</Field>
                <Field label="Coordinator">
                  {event.coordinator
                    ? `${event.coordinator.name} (${event.coordinator.email})`
                    : 'Not assigned'}
                </Field>
                <div className="sm:col-span-2">
                  <Field label="Programme">{event.programme ?? '—'}</Field>
                </div>
              </dl>
            </CardContent>
          </Card>

          {/* US-28 AC-3 — what the Coordinator recorded for Technical Support. */}
          <Card>
            <CardHeader>
              <CardTitle>Equipment and technical requirements</CardTitle>
            </CardHeader>
            <CardContent>
              <TechnicalRequirementsView event={event} />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Accessibility needs</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {event.accessibilityRequirements.length > 0 ? (
                <div className="flex flex-wrap gap-2">
                  {event.accessibilityRequirements.map((feature) => (
                    <Badge key={feature} className="bg-ink-100 text-ink-700 ring-ink-300">
                      {ACCESSIBILITY_FEATURE_LABELS[feature]}
                    </Badge>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-ink-500">None recorded.</p>
              )}
              <dl>
                <Field label="Notes">{event.accessibilityNotes ?? '—'}</Field>
              </dl>
            </CardContent>
          </Card>
        </div>
      ) : null}
    </>
  );
}
