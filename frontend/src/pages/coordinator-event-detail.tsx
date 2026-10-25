import { AlertTriangle, ArrowLeft, CheckCircle2, Pencil } from 'lucide-react';
import { useState } from 'react';
import { useParams } from 'react-router-dom';

import { PageHeader } from '@/components/layout/app-shell';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Field as FormField, Select, Textarea } from '@/components/ui/form';
import { LinkButton } from '@/components/ui/link-button';
import { ErrorState, LoadingState } from '@/components/ui/states';
import { ClarificationThread } from '@/features/events/components/clarification-thread';
import { ChangeHistory } from '@/features/events/components/change-history';
import { ConfirmArrangementsCard } from '@/features/events/components/confirm-arrangements-card';
import { EventStatusBadge } from '@/features/events/components/event-status-badge';
import { PlanningEditForm } from '@/features/events/components/planning-edit-form';
import { RejectUnfulfillable } from '@/features/events/components/reject-unfulfillable';
import { TechnicalRequirementsCard } from '@/features/events/components/technical-requirements';
import { TechnicalSupportCard } from '@/features/events/components/technical-support-card';
import { EquipmentUnavailableNotice } from '@/features/events/components/equipment-unavailable-notice';
import { ARRANGEMENT_LABELS } from '@/features/events/lib/change-format';
import { BookingRequestForm } from '@/features/bookings/components/booking-request-form';
import { EventBookingsList } from '@/features/bookings/components/event-bookings-list';
import { VenueArrangementBadge } from '@/features/bookings/components/venue-arrangement-badge';
import { VenueUnavailablePanel } from '@/features/bookings/components/venue-unavailable-panel';
import { useEventBookings, useReleaseBooking } from '@/features/bookings/hooks/use-bookings';
import { useAuth } from '@/features/auth/hooks/use-auth';
import {
  useAssignedRequest,
  useReviewEvent,
  useStartPlanning,
} from '@/features/events/hooks/use-events';
import { attendanceBandLabel } from '@/lib/attendance-bands';
import { apiErrorMessage } from '@/lib/api-client';
import { SafetyHistory } from '@/features/safety/components/safety-history';
import { useResubmitSafety, useSafetyReviews } from '@/features/safety/hooks/use-safety';
import {
  CONFIRMABLE_EVENT_STATUSES,
  PLANNING_EVENT_STATUSES,
  UNFULFILLABLE_REJECTION_STATUSES,
} from '@/lib/status';
import type { PlanningUpdateResult } from '@/types/api';
import { formatDateRange, formatDateTime, humanise } from '@/lib/utils';
import type { EventStatus } from '@/types/api';
import { ACCESSIBILITY_FEATURE_LABELS, FACILITY_LABELS } from '@/types/api';

/** Mirrors BOOKABLE_EVENT_STATUSES in the backend's booking.types.ts (US-21). */
const BOOKABLE_EVENT_STATUSES: EventStatus[] = ['APPROVED', 'PLANNING', 'AWAITING_ARRANGEMENTS'];

type Decision = 'clarify' | 'return' | 'reject' | 'approve' | '';

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
  const { session } = useAuth();
  const { data: event, isPending, isError, error } = useAssignedRequest(id ?? '');
  const { approve, requestClarification, reject, returnForAmendment } = useReviewEvent();
  const { data: eventBookings = [] } = useEventBookings(id);
  // US-53 AC-5/AC-6: derived "venue arranged", and releasing one booking.
  const releaseBooking = useReleaseBooking();
  const [decision, setDecision] = useState<Decision>('');
  const [decisionText, setDecisionText] = useState('');
  const startPlanning = useStartPlanning();
  const { data: safetyReviews = [] } = useSafetyReviews(id, Boolean(event));
  const resubmitSafety = useResubmitSafety(id ?? '');
  // Optional note to the Safety Officer, sent with the event.
  const [safetyComment, setSafetyComment] = useState('');
  // The latest review is feedback the Coordinator has not answered yet.
  const latestSafety = safetyReviews[safetyReviews.length - 1];
  const awaitingMyResponse =
    latestSafety !== undefined &&
    latestSafety.outcome !== 'APPROVED' &&
    latestSafety.resubmittedAt === null;
  const [editing, setEditing] = useState(false);
  // US-25: what the last save did — shown until the next edit begins.
  const [lastSave, setLastSave] = useState<PlanningUpdateResult['change'] | 'unchanged' | null>(
    null,
  );

  const isReviewing =
    approve.isPending ||
    requestClarification.isPending ||
    reject.isPending ||
    returnForAmendment.isPending;
  const isAssignedToMe = Boolean(event && session && event.coordinatorId === session.userId);
  const inPlanning = event ? PLANNING_EVENT_STATUSES.includes(event.status) : false;

  function handleSaved(result: PlanningUpdateResult) {
    setLastSave(result.change ?? 'unchanged');
    setEditing(false);
  }

  const canDecide = event
    ? (event.status === 'SUBMITTED' || event.status === 'UNDER_REVIEW') &&
      event.coordinator !== null
    : false;
  // US-21: only the assigned Coordinator books, and only once approved.
  const canBook = event
    ? BOOKABLE_EVENT_STATUSES.includes(event.status) && event.coordinator?.id === session?.userId
    : false;

  const reviewError = approve.error ?? requestClarification.error ?? reject.error ?? returnForAmendment.error;

  function resetDecision() {
    setDecision('');
    setDecisionText('');
  }

  function submitDecision() {
    if (!event) return;

    if (decision === 'approve') {
      approve.mutate(event.id, { onSuccess: resetDecision });
    } else if (decision === 'clarify') {
      requestClarification.mutate(
        { id: event.id, question: decisionText.trim() },
        { onSuccess: resetDecision },
      );
    } else if (decision === 'reject') {
      reject.mutate({ id: event.id, reason: decisionText.trim() }, { onSuccess: resetDecision });
    } else if (decision === 'return') {
      returnForAmendment.mutate(
        { id: event.id, reason: decisionText.trim() },
        { onSuccess: resetDecision },
      );
    }
  }

  return (
    <>
      <PageHeader
        title={event?.name ?? 'Event request'}
        description="Everything captured for this request, so you can assess it."
        action={
          <LinkButton to="/coordinator" variant="secondary" size="sm">
            <ArrowLeft className="size-4" aria-hidden="true" />
            Back to my events
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
                {event.arrangementsConfirmedAt ? (
                  <span className="text-xs text-ink-500">
                    Arrangements confirmed {formatDateTime(event.arrangementsConfirmedAt)}
                  </span>
                ) : null}
              </div>
            </CardHeader>
            <CardContent className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field label="Purpose">{event.purpose ?? '—'}</Field>
              <Field label="Expected attendance">{attendanceBandLabel(event.expectedAttendance)}</Field>
              <Field label="Proposed dates">
                {formatDateRange(event.proposedStart, event.proposedEnd)}
              </Field>
              <Field label="Category">{event.category ?? '—'}</Field>
              <div className="sm:col-span-2">
                <Field label="Description">{event.description ?? '—'}</Field>
              </div>
              <div className="sm:col-span-2">
                <Field label="Programme">
                  <span className="whitespace-pre-line">{event.programme ?? '—'}</span>
                </Field>
              </div>
            </CardContent>
          </Card>

          {(event.status === 'APPROVED' || event.status === 'SAFETY_REJECTED') && isAssignedToMe ? (
            <Card>
              <CardHeader>
                <CardTitle>Planning</CardTitle>
              </CardHeader>
              <CardContent className="flex flex-wrap items-center justify-between gap-3">
                <p className="text-sm text-ink-500">
                  {event.status === 'SAFETY_REJECTED'
                    ? 'The Safety Officer rejected this event, and it is blocked from confirmation. Resume planning to rework it; its venue and equipment will need to be approved again.'
                    : 'This event is approved. Start planning to refine its details and arrange the venue and equipment.'}
                </p>
                <Button
                  type="button"
                  size="sm"
                  disabled={startPlanning.isPending}
                  onClick={() => startPlanning.mutate(event.id)}
                >
                  {event.status === 'SAFETY_REJECTED' ? 'Resume planning' : 'Start planning'}
                </Button>
                {startPlanning.error ? (
                  <p className="w-full text-sm text-red-700">
                    {apiErrorMessage(startPlanning.error, 'Could not start planning.')}
                  </p>
                ) : null}
              </CardContent>
            </Card>
          ) : null}

          {isAssignedToMe &&
          (safetyReviews.length > 0 ||
            event.status === 'AWAITING_SAFETY_CHECK' ||
            event.status === 'SAFETY_REJECTED') ? (
            <Card>
              <CardHeader>
                <CardTitle>Safety check</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {event.status === 'AWAITING_SAFETY_CHECK' ? (
                  <p className="text-sm text-ink-600">
                    You confirmed the arrangements. The event is waiting for the Safety
                    Officer; it cannot be confirmed until it passes.
                  </p>
                ) : null}

                {awaitingMyResponse && event.status === 'PLANNING' ? (
                  <div className="rounded-lg border border-amber-300 bg-amber-50 p-4">
                    <p className="text-sm text-amber-900">
                      {latestSafety.outcome === 'CHANGES_REQUESTED'
                        ? `The Safety Officer asked for changes${
                            latestSafety.returnStage
                              ? ` to the ${latestSafety.returnStage.toLowerCase()} planning`
                              : ''
                          }. Make them, then send the event back for a safety check.`
                        : 'The Safety Officer rejected this event. Rework the plan, then send the event back for a safety check.'}
                    </p>
                    <div className="mt-3">
                      <label
                        htmlFor="safety-comment"
                        className="block text-sm font-medium text-amber-900"
                      >
                        Comment for the Safety Officer{' '}
                        <span className="font-normal text-amber-800">(optional)</span>
                      </label>
                      <Textarea
                        id="safety-comment"
                        rows={3}
                        maxLength={1000}
                        className="mt-1 bg-white"
                        placeholder="What did you change, or why do you believe the concern is met?"
                        value={safetyComment}
                        onChange={(e) => setSafetyComment(e.target.value)}
                      />
                    </div>
                    <div className="mt-3 flex flex-wrap items-center gap-3">
                      <Button
                        type="button"
                        size="sm"
                        disabled={resubmitSafety.isPending}
                        onClick={() =>
                          resubmitSafety.mutate(safetyComment, {
                            onSuccess: () => setSafetyComment(''),
                          })
                        }
                      >
                        {resubmitSafety.isPending ? 'Sending…' : 'Send back for safety check'}
                      </Button>
                      <span className="text-xs text-amber-900">
                        Available once the venue and equipment are confirmed and something has
                        changed.
                      </span>
                    </div>
                    {resubmitSafety.error ? (
                      <p role="alert" className="mt-2 text-sm text-red-700">
                        {apiErrorMessage(resubmitSafety.error, 'Could not send it back.')}
                      </p>
                    ) : null}
                  </div>
                ) : null}

                <SafetyHistory reviews={safetyReviews} />
              </CardContent>
            </Card>
          ) : null}

          {inPlanning && isAssignedToMe ? (
            <Card>
              <CardHeader>
                <CardTitle>Update event information</CardTitle>
                {!editing ? (
                  <Button
                    type="button"
                    size="sm"
                    variant="secondary"
                    onClick={() => {
                      setLastSave(null);
                      setEditing(true);
                    }}
                  >
                    <Pencil className="size-4" aria-hidden="true" />
                    Edit details
                  </Button>
                ) : null}
              </CardHeader>
              <CardContent className="space-y-4">
                {lastSave && lastSave !== 'unchanged' && lastSave.requiresReview ? (
                  <div
                    role="status"
                    className="flex items-start gap-3 rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900"
                  >
                    <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
                    <span>
                      Saved, and <strong>flagged for review</strong>: this change affects
                      arrangements that are already confirmed (
                      {lastSave.affectedArrangements.map((a) => ARRANGEMENT_LABELS[a]).join(', ')}).
                    </span>
                  </div>
                ) : null}
                {lastSave && lastSave !== 'unchanged' && !lastSave.requiresReview ? (
                  <div
                    role="status"
                    className="flex items-center gap-3 rounded-lg border border-emerald-300 bg-emerald-50 px-4 py-3 text-sm text-emerald-900"
                  >
                    <CheckCircle2 className="size-4 shrink-0" aria-hidden="true" />
                    Changes saved.
                  </div>
                ) : null}
                {lastSave === 'unchanged' ? (
                  <p role="status" className="text-sm text-ink-500">
                    Nothing changed, so nothing was saved.
                  </p>
                ) : null}

                {editing ? (
                  <PlanningEditForm
                    event={event}
                    onSaved={handleSaved}
                    onCancel={() => setEditing(false)}
                  />
                ) : (
                  <p className="text-sm text-ink-500">
                    Changes to the dates, attendance, layout, accessibility or equipment of an event
                    with confirmed arrangements are flagged for review.
                  </p>
                )}
              </CardContent>
            </Card>
          ) : null}

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
                      {/* The same wording the Organiser chose from (US-06 AC-6). */}
                      {ACCESSIBILITY_FEATURE_LABELS[feature]}
                    </Badge>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-ink-500">None recorded.</p>
              )}
              <Field label="Notes">{event.accessibilityNotes ?? '—'}</Field>
            </CardContent>
          </Card>

          {/* US-19 AC-3: what the venue must have; suitability checks venues against it. */}
          <Card>
            <CardHeader>
              <CardTitle>Required facilities</CardTitle>
            </CardHeader>
            <CardContent>
              {event.requiredFacilities?.length ? (
                <div className="flex flex-wrap gap-2">
                  {event.requiredFacilities.map((facility) => (
                    <Badge key={facility} className="bg-ink-100 text-ink-700 ring-ink-300">
                      {FACILITY_LABELS[facility]}
                    </Badge>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-ink-500">None recorded.</p>
              )}
            </CardContent>
          </Card>
          <EquipmentUnavailableNotice items={event.unavailableEquipment} />

          <TechnicalRequirementsCard event={event} editable={inPlanning && isAssignedToMe} />

          {/* US-61: only the event's own Coordinator assigns, and only once
              technical support needs are recorded (AC-1). */}
          {isAssignedToMe && event.technicalSupportNeeds?.trim() ? (
            <TechnicalSupportCard eventId={event.id} editable />
          ) : null}

          <Card>
            <CardHeader>
              <CardTitle>Registration</CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-1 gap-4 sm:grid-cols-2">
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

          <Card>
            <CardHeader>
              <CardTitle>Coordinator</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {event.coordinator ? (
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <Field label="Assigned to">{event.coordinator.name}</Field>
                  <Field label="Email">{event.coordinator.email}</Field>
                </div>
              ) : (
                <p className="text-sm text-ink-500">
                  No coordinator assigned yet — the Event Coordinator Lead assigns one.
                </p>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Clarification history</CardTitle>
            </CardHeader>
            <CardContent>
              {/* US-58 AC4: each response with the details it updated. */}
              <ClarificationThread
                messages={event.clarifications}
                viewerId={session?.userId}
                pendingLabel={
                  event.status === 'AWAITING_CLARIFICATION' ? "Waiting for the organiser's reply" : undefined
                }
              />
            </CardContent>
          </Card>

          {/* US-52: bookings whose venue became unavailable, and their replacement. */}
          <VenueUnavailablePanel event={event} canRequest={canBook} />

          {canBook || eventBookings.length > 0 ? (
            <Card>
              <CardHeader>
                <CardTitle>Venue booking</CardTitle>
                {canBook ? <VenueArrangementBadge eventId={event.id} /> : null}
              </CardHeader>
              <CardContent className="space-y-5">
                {eventBookings.length > 0 ? (
                  <EventBookingsList
                    bookings={eventBookings}
                    detailPath={(bookingId) => `/coordinator/bookings/${bookingId}`}
                    onRelease={canBook ? (bookingId) => releaseBooking.mutate(bookingId) : undefined}
                    releasingId={releaseBooking.isPending ? releaseBooking.variables : null}
                  />
                ) : null}
                {releaseBooking.error ? (
                  <ErrorState
                    message={apiErrorMessage(releaseBooking.error, 'Could not release this booking.')}
                  />
                ) : null}
                {canBook ? <BookingRequestForm event={event} /> : null}
              </CardContent>
            </Card>
          ) : null}
          {/* US-42. Not while safety feedback waits for an answer: "Send back
              for safety check" above is the way back in then. */}
          {CONFIRMABLE_EVENT_STATUSES.includes(event.status) && isAssignedToMe && !awaitingMyResponse ? (
            <ConfirmArrangementsCard eventId={event.id} />
          ) : null}
          <ChangeHistory eventId={event.id} />

          {/* US-47: reject a request that cannot be fulfilled. */}
          {UNFULFILLABLE_REJECTION_STATUSES.includes(event.status) && isAssignedToMe ? (
            <RejectUnfulfillable eventId={event.id} />
          ) : null}

          {canDecide ? (
            <Card>
              <CardHeader>
                <CardTitle>Review decision</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <FormField
                  label="Decision"
                  htmlFor="review-decision"
                  hint="Choose what should happen to this request."
                >
                  <Select
                    id="review-decision"
                    value={decision}
                    onChange={(e) => {
                      setDecision(e.target.value as Decision);
                      setDecisionText('');
                    }}
                  >
                    <option value="">Select a decision</option>
                    <option value="approve">Approve</option>
                    <option value="clarify">Request clarification</option>
                    <option value="return">Return for changes</option>
                    <option value="reject">Reject</option>
                  </Select>
                </FormField>

                {decision && decision !== 'approve' ? (
                  <FormField
                    label={decision === 'clarify' ? 'Clarification question' : 'Reason'}
                    htmlFor="review-decision-note"
                    required
                  >
                    <Textarea
                      id="review-decision-note"
                      value={decisionText}
                      onChange={(e) => setDecisionText(e.target.value)}
                      rows={3}
                      placeholder={
                        decision === 'clarify'
                          ? 'Type your question for the organiser'
                          : 'Explain this decision to the organiser'
                      }
                    />
                  </FormField>
                ) : null}

                {reviewError ? (
                  <p className="text-sm text-red-700">
                    {apiErrorMessage(reviewError, 'Could not save this review decision.')}
                  </p>
                ) : null}

                <div className="flex justify-end">
                  <Button
                    type="button"
                    size="sm"
                    disabled={
                      !decision ||
                      isReviewing ||
                      (decision !== 'approve' && decisionText.trim().length === 0)
                    }
                    onClick={submitDecision}
                  >
                    Submit decision
                  </Button>
                </div>
              </CardContent>
            </Card>
          ) : null}
        </div>
      ) : null}
    </>
  );
}
