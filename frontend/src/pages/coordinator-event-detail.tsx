import { ArrowLeft } from 'lucide-react';
import { useParams } from 'react-router-dom';

import { PageHeader } from '@/components/layout/app-shell';
import { LinkButton } from '@/components/ui/link-button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ErrorState, LoadingState } from '@/components/ui/states';
import { EventStatusBadge } from '@/features/events/components/event-status-badge';
import { useAssignedRequest } from '@/features/events/hooks/use-events';
import { apiErrorMessage } from '@/lib/api-client';
import { formatDateRange, humanise } from '@/lib/utils';

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="text-xs font-medium uppercase tracking-wide text-ink-500">{label}</dt>
      <dd className="mt-1 text-sm text-ink-900">{children}</dd>
    </div>
  );
}

export function CoordinatorEventDetail() {
  const { id } = useParams<{ id: string }>();
  const { data: event, isPending, isError, error } = useAssignedRequest(id ?? '');

  return (
    <>
      <PageHeader
        title={event?.name ?? 'Event request'}
        description="Everything captured for this request, so you can assess it."
        action={
          <LinkButton to="/coordinator" variant="secondary" size="sm">
            <ArrowLeft className="size-4" aria-hidden="true" />
            Back to queue
          </LinkButton>
        }
      />

      {isPending ? <LoadingState label="Loading request…" /> : null}

      {isError ? (
        <ErrorState message={apiErrorMessage(error, 'Could not load this request.')} />
      ) : null}

      {event ? (
        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Overview</CardTitle>
              <div className="flex items-center gap-2">
                <EventStatusBadge status={event.status} />
                {event.statusView.decision ? (
                  <span className="text-xs text-ink-500">
                    {event.statusView.decision.reason ?? 'No reason given'}
                  </span>
                ) : null}
              </div>
            </CardHeader>
            <CardContent className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field label="Purpose">{event.purpose ?? '—'}</Field>
              <Field label="Expected attendance">{event.expectedAttendance ?? '—'}</Field>
              <Field label="Proposed dates">
                {formatDateRange(event.proposedStart, event.proposedEnd)}
              </Field>
              <Field label="Category">{event.category ?? '—'}</Field>
              <div className="sm:col-span-2">
                <Field label="Description">{event.description ?? '—'}</Field>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Venue requirements</CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field label="Preferred layout">
                {event.preferredLayout ? humanise(event.preferredLayout) : 'No preference'}
              </Field>
              <div className="sm:col-span-2">
                <Field label="Layout notes">{event.layoutNotes ?? '—'}</Field>
              </div>
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
                      {humanise(feature)}
                    </Badge>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-ink-500">None recorded.</p>
              )}
              <Field label="Notes">{event.accessibilityNotes ?? '—'}</Field>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Equipment and registration</CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <Field label="Equipment needs">{event.equipmentNeeds ?? 'None recorded.'}</Field>
              </div>
              <Field label="Registration">
                {event.registrationEnabled ? 'Open to attendees' : 'Not open for registration'}
              </Field>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Raised by</CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field label="Organiser">{event.organiser.name}</Field>
              <Field label="Email">{event.organiser.email}</Field>
            </CardContent>
          </Card>
        </div>
      ) : null}
    </>
  );
}
