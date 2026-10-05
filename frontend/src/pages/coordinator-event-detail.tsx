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
import { ChangeHistory } from '@/features/events/components/change-history';
import { EventStatusBadge } from '@/features/events/components/event-status-badge';
import { PlanningEditForm } from '@/features/events/components/planning-edit-form';
import { ReassignEvent } from '@/features/events/components/reassign-event';
import { TechnicalRequirementsCard } from '@/features/events/components/technical-requirements';
import { ARRANGEMENT_LABELS } from '@/features/events/lib/change-format';
import { BookingRequestForm } from '@/features/bookings/components/booking-request-form';
import { EventBookingsList } from '@/features/bookings/components/event-bookings-list';
import { useEventBookings } from '@/features/bookings/hooks/use-bookings';
import { useAuth } from '@/features/auth/hooks/use-auth';
import {
  useAssignCoordinator,
  useAssignedRequest,
  useReviewEvent,
  useStartPlanning,
} from '@/features/events/hooks/use-events';
import { apiErrorMessage } from '@/lib/api-client';
import { ASSIGNABLE_EVENT_STATUSES, PLANNING_EVENT_STATUSES } from '@/lib/status';
import type { PlanningUpdateResult } from '@/types/api';
import { formatDateRange, humanise } from '@/lib/utils';
import type { EventStatus } from '@/types/api';

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
  const assignCoordinator = useAssignCoordinator();
  const { data: eventBookings = [] } = useEventBookings(id);
  const [decision, setDecision] = useState<Decision>('');
  const [decisionText, setDecisionText] = useState('');
  const startPlanning = useStartPlanning();
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

  function assignToMe() {
    if (!event || !session) return;
    assignCoordinator.mutate({ id: event.id, coordinatorId: session.userId });
  }

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
              <div className="sm:col-span-2">
                <Field label="Programme">
                  <span className="whitespace-pre-line">{event.programme ?? '—'}</span>
                </Field>
              </div>
            </CardContent>
          </Card>

          {event.status === 'APPROVED' && isAssignedToMe ? (
            <Card>
              <CardHeader>
                <CardTitle>Planning</CardTitle>
              </CardHeader>
              <CardContent className="flex flex-wrap items-center justify-between gap-3">
                <p className="text-sm text-ink-500">
                  This event is approved. Start planning to refine its details and arrange the
                  venue and equipment.
                </p>
                <Button
                  type="button"
                  size="sm"
                  disabled={startPlanning.isPending}
                  onClick={() => startPlanning.mutate(event.id)}
                >
                  Start planning
                </Button>
                {startPlanning.error ? (
                  <p className="w-full text-sm text-red-700">
                    {apiErrorMessage(startPlanning.error, 'Could not start planning.')}
                  </p>
                ) : null}
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

          <TechnicalRequirementsCard event={event} editable={inPlanning && isAssignedToMe} />

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
                <>
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <Field label="Assigned to">{event.coordinator.name}</Field>
                    <Field label="Email">{event.coordinator.email}</Field>
                  </div>
                  {isAssignedToMe && ASSIGNABLE_EVENT_STATUSES.includes(event.status) ? (
                    <ReassignEvent eventId={event.id} eventName={event.name ?? 'This event'} />
                  ) : null}
                </>
              ) : (
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <p className="text-sm text-ink-500">
                    No coordinator assigned yet — this request can't be reviewed until one is.
                  </p>
                  <Button
                    type="button"
                    size="sm"
                    disabled={assignCoordinator.isPending}
                    onClick={assignToMe}
                  >
                    Assign to me
                  </Button>
                </div>
              )}
              {assignCoordinator.error ? (
                <p className="text-sm text-red-700">
                  {apiErrorMessage(assignCoordinator.error, 'Could not assign a coordinator.')}
                </p>
              ) : null}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Clarification history</CardTitle>
            </CardHeader>
            <CardContent>
              {event.clarifications.length > 0 ? (
                <ol className="space-y-3 border-l border-ink-200 pl-4">
                  {event.clarifications.map((message) => (
                    <li key={message.id} className="text-sm">
                      <p className="text-ink-800">{message.body}</p>
                      <p className="mt-1 text-xs text-ink-500">
                        {message.author.name} · {new Date(message.createdAt).toLocaleString()}
                      </p>
                    </li>
                  ))}
                </ol>
              ) : (
                <p className="text-sm text-ink-500">No clarification messages yet.</p>
              )}
            </CardContent>
          </Card>

          {canBook || eventBookings.length > 0 ? (
            <Card>
              <CardHeader>
                <CardTitle>Venue booking</CardTitle>
              </CardHeader>
              <CardContent className="space-y-5">
                {eventBookings.length > 0 ? (
                  <EventBookingsList
                    bookings={eventBookings}
                    detailPath={(bookingId) => `/coordinator/bookings/${bookingId}`}
                  />
                ) : null}
                {canBook ? <BookingRequestForm event={event} /> : null}
              </CardContent>
            </Card>
          ) : null}
          <ChangeHistory eventId={event.id} />

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
