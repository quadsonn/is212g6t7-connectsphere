import { Pencil } from 'lucide-react';
import { useNavigate, useParams } from 'react-router-dom';

import { PageHeader } from '@/components/layout/app-shell';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { LinkButton } from '@/components/ui/link-button';
import { Button } from '@/components/ui/button';
import { ErrorState, LoadingState } from '@/components/ui/states';
import { EventStatusBadge } from '@/features/events/components/event-status-badge';
import { useMyRequest } from '@/features/events/hooks/use-events';
import { EventBookingsList } from '@/features/bookings/components/event-bookings-list';
import { useEventBookings } from '@/features/bookings/hooks/use-bookings';
import { apiErrorMessage } from '@/lib/api-client';
import { attendanceBandLabel } from '@/lib/attendance-bands';
import { EDITABLE_EVENT_STATUSES } from '@/lib/status';
import { formatDate, humanise } from '@/lib/utils';
import { ACCESSIBILITY_FEATURE_LABELS } from '@/types/api';

/** A labelled value in the detail grid — dash when the field is still empty (a draft, US-04). */
function DetailField({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <dt className="text-xs font-medium uppercase tracking-wide text-ink-500">{label}</dt>
      <dd className="mt-0.5 text-sm text-ink-900">
        {value === null || value === undefined || value === '' ? (
          <span className="text-ink-400">Not set</span>
        ) : (
          value
        )}
      </dd>
    </div>
  );
}

/** US-05 — full detail of one of the Organiser's own requests, view + entry point to edit. */
export function OrganiserRequestDetail() {
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const { data: event, isPending, isError, error } = useMyRequest(id);
  // Declared before the early returns below, per the rules of hooks.
  const { data: venueBookings } = useEventBookings(id);

  if (isPending) {
    return (
      <>
        <PageHeader title="Event request" description="Loading…" />
        <LoadingState label="Loading request…" />
      </>
    );
  }

  if (isError || !event) {
    return (
      <>
        <PageHeader title="Event request" description="Loading…" />
        <ErrorState message={apiErrorMessage(error, 'Could not load this request.')} />
      </>
    );
  }

  const isEditable = EDITABLE_EVENT_STATUSES.includes(event.status);

  return (
    <>
      <PageHeader
        title={event.name ?? 'Untitled draft'}
        description={event.category ?? 'No category entered yet'}
        action={
          <div className="flex items-center gap-3">
            <EventStatusBadge status={event.status} />
            {isEditable ? (
              <LinkButton to={`/organiser/${event.id}/edit`}>
                <Pencil className="size-4" aria-hidden="true" />
                Edit request
              </LinkButton>
            ) : null}
          </div>
        }
      />

      <div className="max-w-3xl space-y-5">
        {event.statusView.decision?.reason ? (
          <ErrorState
            className={
              event.statusView.decision.outcome === 'REJECTED'
                ? undefined
                : 'border-amber-200 bg-amber-50 text-amber-900'
            }
            message={
              event.statusView.decision.outcome === 'REJECTED'
                ? `Rejected: ${event.statusView.decision.reason}`
                : `Returned for changes: ${event.statusView.decision.reason}`
            }
          />
        ) : null}

        {event.clarificationRequested && event.clarificationRequest ? (
          <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
            <p className="font-medium">The coordinator asked for clarification</p>
            <p className="mt-1">{event.clarificationRequest}</p>
          </div>
        ) : null}

        <Card>
          <CardHeader>
            <CardTitle>About the event</CardTitle>
          </CardHeader>
          <CardContent>
            <dl className="grid gap-4 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <DetailField label="Event name" value={event.name} />
              </div>
              <DetailField label="Category" value={event.category} />
              <DetailField
                label="Registration"
                value={event.registrationEnabled ? 'Open to attendees' : 'Not open for registration'}
              />
              <div className="sm:col-span-2">
                <DetailField label="Purpose" value={event.purpose} />
              </div>
              <div className="sm:col-span-2">
                <DetailField label="Description" value={event.description} />
              </div>
            </dl>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Schedule and attendance</CardTitle>
          </CardHeader>
          <CardContent>
            <dl className="grid gap-4 sm:grid-cols-2">
              <DetailField
                label="Starts"
                value={event.proposedStart ? formatDate(event.proposedStart) : null}
              />
              <DetailField
                label="Ends"
                value={event.proposedEnd ? formatDate(event.proposedEnd) : null}
              />
              <DetailField
                label="Expected attendance"
                value={
                  event.expectedAttendance == null
                    ? null
                    : attendanceBandLabel(event.expectedAttendance)
                }
              />
            </dl>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Layout and accessibility</CardTitle>
          </CardHeader>
          <CardContent>
            <dl className="grid gap-4 sm:grid-cols-2">
              <DetailField
                label="Preferred layout"
                value={event.preferredLayout ? humanise(event.preferredLayout) : null}
              />
              <div className="sm:col-span-2">
                <DetailField label="Layout notes" value={event.layoutNotes} />
              </div>
              <div className="sm:col-span-2">
                <DetailField
                  label="Accessibility requirements"
                  value={
                    event.accessibilityRequirements.length > 0
                      ? event.accessibilityRequirements
                          .map((f) => ACCESSIBILITY_FEATURE_LABELS[f])
                          .join(', ')
                      : null
                  }
                />
              </div>
              <div className="sm:col-span-2">
                <DetailField label="Accessibility notes" value={event.accessibilityNotes} />
              </div>
              <div className="sm:col-span-2">
                <DetailField label="Equipment needs" value={event.equipmentNeeds} />
              </div>
            </dl>
          </CardContent>
        </Card>

        {/* US-23 AC-5: venue decisions and their reasons, visible to the Organiser. */}
        {venueBookings && venueBookings.length > 0 ? (
          <Card>
            <CardHeader>
              <CardTitle>Venue bookings</CardTitle>
            </CardHeader>
            <CardContent>
              <EventBookingsList bookings={venueBookings} />
            </CardContent>
          </Card>
        ) : null}

        <Button type="button" variant="ghost" onClick={() => navigate('/organiser')}>
          Back to my requests
        </Button>
      </div>
    </>
  );
}
