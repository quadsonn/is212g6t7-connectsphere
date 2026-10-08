import { ArrowLeft } from 'lucide-react';
import { useParams } from 'react-router-dom';

import { PageHeader } from '@/components/layout/app-shell';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { LinkButton } from '@/components/ui/link-button';
import { ErrorState, LoadingState } from '@/components/ui/states';
import { EventStatusBadge } from '@/features/events/components/event-status-badge';
import { RequirementsView } from '@/features/equipment/components/requirements-view';
import {
  useEventRequirementDetails,
  useEventRequirements,
} from '@/features/equipment/hooks/use-equipment';
import { apiErrorMessage } from '@/lib/api-client';
import { formatDateRange, humanise } from '@/lib/utils';
import { ACCESSIBILITY_FEATURE_LABELS } from '@/types/api';

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="text-xs font-medium uppercase tracking-wide text-ink-500">{label}</dt>
      <dd className="mt-1 whitespace-pre-line text-sm text-ink-900">{children}</dd>
    </div>
  );
}

/**
 * US-31 "View more details" — REAL data, GET /equipment/requirements/:eventId/details.
 *
 * A read-only view of the full event for Technical Support. Served by the
 * US-31 route and access rule (submitted events with a requirement source),
 * not by the US-25 Related events page, whose component loads its own data
 * through a different rule.
 */
export function EquipmentEventDetails() {
  const { eventId = '' } = useParams<{ eventId: string }>();
  const { data: event, isPending, isError, error } = useEventRequirementDetails(eventId);
  // The same requirements the previous page showed (already cached from it).
  const requirements = useEventRequirements(eventId);

  return (
    <>
      <PageHeader
        title={event?.name ?? 'Event details'}
        description={event?.description ?? (event ? 'No description provided.' : '')}
        action={
          <LinkButton to={`/equipment/requirements/${eventId}`} variant="secondary" size="sm">
            <ArrowLeft className="size-4" aria-hidden="true" />
            Back
          </LinkButton>
        }
      />

      {isPending ? <LoadingState label="Loading event…" /> : null}

      {isError ? (
        <ErrorState message={apiErrorMessage(error, 'Could not load this event’s details.')} />
      ) : null}

      {event ? (
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Overview</CardTitle>
              <EventStatusBadge status={event.status} />
            </CardHeader>
            <CardContent>
              <dl className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <Field label="Dates">{formatDateRange(event.proposedStart, event.proposedEnd)}</Field>
                <Field label="Expected attendance">{event.expectedAttendance ?? '—'}</Field>
                <Field label="Preferred layout">
                  {event.preferredLayout ? humanise(event.preferredLayout) : 'No preference'}
                </Field>
                <Field label="Layout notes">{event.layoutNotes ?? '—'}</Field>
                <Field label="Coordinator">
                  {event.coordinator
                    ? `${event.coordinator.name} (${event.coordinator.email})`
                    : 'Not yet assigned'}
                </Field>
                <div className="sm:col-span-2">
                  <Field label="Programme">{event.programme ?? '—'}</Field>
                </div>
              </dl>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Equipment and technical requirements</CardTitle>
            </CardHeader>
            <CardContent>
              {requirements.isPending ? <LoadingState label="Loading requirements…" /> : null}
              {requirements.isError ? (
                <ErrorState
                  message={apiErrorMessage(requirements.error, 'Could not load the requirements.')}
                />
              ) : null}
              {requirements.data ? <RequirementsView requirements={requirements.data} /> : null}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Accessibility needs</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {event.accessibilityRequirements.length > 0 ? (
                <ul className="list-disc space-y-1 pl-5 text-sm text-ink-900">
                  {event.accessibilityRequirements.map((feature) => (
                    <li key={feature}>{ACCESSIBILITY_FEATURE_LABELS[feature] ?? humanise(feature)}</li>
                  ))}
                </ul>
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
