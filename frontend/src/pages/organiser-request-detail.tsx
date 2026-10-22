import { Ban, Pencil, Repeat2 } from 'lucide-react';
import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';

import { PageHeader } from '@/components/layout/app-shell';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { LinkButton } from '@/components/ui/link-button';
import { Button } from '@/components/ui/button';
import { ErrorState, LoadingState } from '@/components/ui/states';
import { CancelEventPanel } from '@/features/events/components/cancel-event-panel';
import { ChangeRequestForm } from '@/features/events/components/change-request-form';
import { EventStatusBadge } from '@/features/events/components/event-status-badge';
import { PendingChangeRequest } from '@/features/events/components/pending-change-request';
import { EquipmentUnavailableNotice } from '@/features/events/components/equipment-unavailable-notice';
import { useMyRequest } from '@/features/events/hooks/use-events';
import { EventBookingsList } from '@/features/bookings/components/event-bookings-list';
import { useEventBookings } from '@/features/bookings/hooks/use-bookings';
import { apiErrorMessage } from '@/lib/api-client';
import { attendanceBandLabel } from '@/lib/attendance-bands';
import {
  CANCELLABLE_EVENT_STATUSES,
  CHANGEABLE_EVENT_STATUSES,
  EDITABLE_EVENT_STATUSES,
} from '@/lib/status';
import { formatDate, formatDateTime, humanise } from '@/lib/utils';
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
  // US-37: whether the change request form is open.
  const [changing, setChanging] = useState(false);
  // US-43: whether the cancellation confirmation is open.
  const [cancelling, setCancelling] = useState(false);

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
  const pendingChange = event.pendingChangeRequest ?? null;
  // US-38 AC-5: the outcome of the last request, until a new one is pending.
  const latestDecision = pendingChange ? null : (event.latestChangeDecision ?? null);
  // US-37: one pending request at a time, and only while the event is live.
  const canRequestChange = CHANGEABLE_EVENT_STATUSES.includes(event.status) && !pendingChange;

  // US-43 AC-1: offered from submission until the event starts. The server
  // re-checks, including the clock, so a stale page cannot cancel a started event.
  const canCancel =
    CANCELLABLE_EVENT_STATUSES.includes(event.status) &&
    (!event.proposedStart || new Date(event.proposedStart) > new Date());

  return (
    <>
      <PageHeader
        title={event.name ?? 'Untitled draft'}
        description={event.category ?? 'No category entered yet'}
        action={
          <div className="flex items-center gap-3">
            <EventStatusBadge status={event.status} />
            {canRequestChange && !changing ? (
              <Button type="button" variant="secondary" onClick={() => setChanging(true)}>
                <Repeat2 className="size-4" aria-hidden="true" />
                Request a change
              </Button>
            ) : null}
            {canCancel && !cancelling ? (
              <Button type="button" variant="secondary" onClick={() => setCancelling(true)}>
                <Ban className="size-4" aria-hidden="true" />
                Cancel event
              </Button>
            ) : null}
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
        {cancelling && canCancel ? (
          <CancelEventPanel event={event} onClose={() => setCancelling(false)} />
        ) : null}

        {event.status === 'CANCELLED' ? (
          <div
            role="status"
            className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-900"
          >
            This event has been cancelled. Its venue bookings and equipment have been released, and
            it can no longer be edited or changed.
          </div>
        ) : null}

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

        {/* US-42 AC-5: the Coordinator confirmed everything; safety review is next. */}
        {event.status === 'AWAITING_SAFETY_CHECK' ? (
          <div
            role="status"
            className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900"
          >
            <p className="font-medium">Arrangements confirmed - awaiting safety review</p>
            <p className="mt-1">
              Your coordinator has confirmed the venue and equipment
              {event.arrangementsConfirmedAt
                ? ` on ${formatDateTime(event.arrangementsConfirmedAt)}`
                : ''}
              . A Safety Officer will review the event next.
            </p>
          </div>
        ) : null}

        {event.clarificationRequested && event.clarificationRequest ? (
          <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
            <p className="font-medium">The coordinator asked for clarification</p>
            <p className="mt-1">{event.clarificationRequest}</p>
          </div>
        ) : null}

        {/* US-37: the original details stay below; the request sits alongside them. */}
        {changing && canRequestChange ? (
          <Card>
            <CardHeader>
              <CardTitle>Request a change</CardTitle>
            </CardHeader>
            <CardContent>
              <ChangeRequestForm
                event={event}
                onDone={() => setChanging(false)}
                onCancel={() => setChanging(false)}
              />
            </CardContent>
          </Card>
        ) : null}

        <EquipmentUnavailableNotice items={event.unavailableEquipment} />

        {pendingChange ? <PendingChangeRequest event={event} request={pendingChange} /> : null}

        {latestDecision?.status === 'REJECTED' ? (
          <ErrorState
            message={`Your change request was rejected${
              latestDecision.decidedAt ? ` on ${formatDate(latestDecision.decidedAt)}` : ''
            }: ${latestDecision.decisionReason ?? 'No reason given.'}`}
          />
        ) : null}

        {latestDecision?.status === 'APPROVED' ? (
          <div
            role="status"
            className="rounded-lg border border-emerald-300 bg-emerald-50 px-4 py-3 text-sm text-emerald-900"
          >
            Your change request was approved
            {latestDecision.decidedAt ? ` on ${formatDate(latestDecision.decidedAt)}` : ''}. The
            details below are the updated ones.
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

        {/* The people and planning behind the event, once a Coordinator holds it. */}
        <Card>
          <CardHeader>
            <CardTitle>Coordination</CardTitle>
          </CardHeader>
          <CardContent>
            <dl className="grid gap-4 sm:grid-cols-2">
              <DetailField
                label="Assigned coordinator"
                value={
                  event.coordinator
                    ? `${event.coordinator.name} (${event.coordinator.email})`
                    : 'Not assigned yet'
                }
              />
              <DetailField label="Programme" value={event.programme} />
              <div className="sm:col-span-2">
                <DetailField
                  label="Equipment requested"
                  value={
                    event.equipmentRequirements && event.equipmentRequirements.length > 0 ? (
                      <ul className="list-disc pl-5">
                        {event.equipmentRequirements.map((line) => (
                          <li key={line.id}>
                            {line.quantity} × {line.equipmentType}
                            {line.notes ? ` (${line.notes})` : ''}
                          </li>
                        ))}
                      </ul>
                    ) : null
                  }
                />
              </div>
              <div className="sm:col-span-2">
                <DetailField label="Technical support" value={event.technicalSupportNeeds} />
              </div>
            </dl>
          </CardContent>
        </Card>

        {/* US-23 AC-5: venue decisions and their reasons, visible to the Organiser. */}
        <Card>
          <CardHeader>
            <CardTitle>Venue</CardTitle>
          </CardHeader>
          <CardContent>
            {venueBookings && venueBookings.length > 0 ? (
              <EventBookingsList bookings={venueBookings} />
            ) : (
              <p className="text-sm text-ink-500">
                {venueBookings
                  ? 'No venue has been requested yet. Your coordinator will request one while planning the event.'
                  : 'Loading venue details…'}
              </p>
            )}
          </CardContent>
        </Card>

        <Button type="button" variant="ghost" onClick={() => navigate('/organiser')}>
          Back to my requests
        </Button>
      </div>
    </>
  );
}
