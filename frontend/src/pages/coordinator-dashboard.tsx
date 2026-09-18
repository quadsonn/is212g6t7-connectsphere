import { useState } from 'react';

import { PageHeader } from '@/components/layout/app-shell';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Field, Select, Textarea } from '@/components/ui/form';
import { EmptyState, ErrorState, TableSkeleton } from '@/components/ui/states';
import { EventStatusBadge } from '@/features/events/components/event-status-badge';
import {
  useAssignedEvents,
  useEventDetail,
  useReviewEvent,
} from '@/features/events/hooks/use-events';
import { apiErrorMessage } from '@/lib/api-client';
import { COORDINATOR_QUEUE_STATUSES } from '@/lib/status';
import type { EventRequest, EventStatus } from '@/types/api';
import { formatDateRange } from '@/lib/utils';

/**
 * REAL data — GET /events returns only events assigned to this coordinator
 * (US-02 AC-6). The queue filter below is presentation: the server has already
 * decided which events are visible; this narrows to those awaiting action.
 */
export function CoordinatorDashboard() {
  const { data: events, isPending, isError, error } = useAssignedEvents();
  const { approve, requestClarification, reject, returnForAmendment } = useReviewEvent();
  const [selectedEvent, setSelectedEvent] = useState<EventRequest | null>(null);
  const [statusFilter, setStatusFilter] = useState<'ALL' | EventStatus>('ALL');
  const [decision, setDecision] = useState<'clarify' | 'return' | 'reject' | 'approve' | ''>('');
  const [decisionText, setDecisionText] = useState('');
  const detail = useEventDetail(selectedEvent?.id ?? null);

  const queue = events?.filter(
    (event) =>
      COORDINATOR_QUEUE_STATUSES.includes(event.status) &&
      (statusFilter === 'ALL' || event.status === statusFilter),
  );

  const isReviewing =
    approve.isPending ||
    requestClarification.isPending ||
    reject.isPending ||
    returnForAmendment.isPending;
  const canDecide = selectedEvent
    ? selectedEvent.status === 'SUBMITTED' || selectedEvent.status === 'UNDER_REVIEW'
    : false;

  const reviewError =
    approve.error ??
    requestClarification.error ??
    reject.error ??
    returnForAmendment.error;

  function closeReview() {
    if (isReviewing) return;
    setSelectedEvent(null);
    setDecision('');
    setDecisionText('');
  }

  function submitDecision() {
    if (!selectedEvent) return;

    if (decision === 'approve') {
      approve.mutate(selectedEvent.id, { onSuccess: closeReview });
    } else if (decision === 'clarify') {
      requestClarification.mutate(
        { id: selectedEvent.id, question: decisionText.trim() },
        { onSuccess: closeReview },
      );
    } else if (decision === 'reject') {
      reject.mutate(
        { id: selectedEvent.id, reason: decisionText.trim() },
        { onSuccess: closeReview },
      );
    } else if (decision === 'return') {
      returnForAmendment.mutate(
        { id: selectedEvent.id, reason: decisionText.trim() },
        { onSuccess: closeReview },
      );
    }
  }

  return (
    <>
      <PageHeader
        title="Review queue"
        description="Requests assigned to you that are waiting on a decision."
      />

      <Card>
        <CardHeader>
          <CardTitle>Awaiting review</CardTitle>
          <div className="flex items-center gap-3">
            {events ? (
              <Select
                aria-label="Filter event requests by status"
                className="h-9 w-auto min-w-44"
                value={statusFilter}
                onChange={(event) => setStatusFilter(event.target.value as 'ALL' | EventStatus)}
              >
                <option value="ALL">All outcomes</option>
                {COORDINATOR_QUEUE_STATUSES.map((status) => (
                  <option key={status} value={status}>
                    {status.replaceAll('_', ' ')}
                  </option>
                ))}
              </Select>
            ) : null}
            {queue ? <span className="text-sm text-ink-500">{queue.length} shown</span> : null}
          </div>
        </CardHeader>

        {isPending ? <TableSkeleton /> : null}

        {isError ? (
          <CardContent>
            <ErrorState message={apiErrorMessage(error, 'Could not load your queue.')} />
          </CardContent>
        ) : null}

        {queue && queue.length === 0 ? (
          <EmptyState
            title="No requests found"
            description="Assigned requests remain here after a decision and can be filtered by status."
          />
        ) : null}

        {queue && queue.length > 0 ? (
          <ul className="divide-y divide-ink-100">
            {queue.map((event) => (
              <li key={event.id} className="flex flex-wrap items-center gap-4 px-5 py-4">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2.5">
                    <span className="truncate font-medium text-ink-900">{event.name}</span>
                    <EventStatusBadge status={event.status} />
                  </div>
                  <p className="mt-1 text-xs text-ink-500">
                    {formatDateRange(event.proposedStart, event.proposedEnd)} ·{' '}
                    {event.expectedAttendance} expected
                  </p>
                </div>

                <div className="flex shrink-0 flex-wrap gap-2">
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => {
                      setSelectedEvent(event);
                      setDecision('');
                      setDecisionText('');
                    }}
                  >
                    View
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        ) : null}
      </Card>

      {selectedEvent ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink-900/40 px-4 py-6">
          <div
            className="max-h-full w-full max-w-2xl overflow-y-auto rounded-xl bg-white shadow-xl"
            role="dialog"
            aria-modal="true"
            aria-labelledby="review-event-title"
          >
            <div className="border-b border-ink-100 px-6 py-5">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h2 id="review-event-title" className="text-lg font-semibold text-ink-900">
                    Review event request
                  </h2>
                  <p className="mt-1 text-sm text-ink-500">
                    Review the submitted details before making a decision.
                  </p>
                </div>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  onClick={closeReview}
                  aria-label="Close review"
                >
                  Close
                </Button>
              </div>
            </div>

            <div className="space-y-5 px-6 py-5">
              {detail.isPending ? <p className="text-sm text-ink-500">Loading request details...</p> : null}

              {detail.isError ? (
                <p className="text-sm text-red-700">
                  {apiErrorMessage(detail.error, 'Could not load the full request.')}
                </p>
              ) : null}

              {detail.data ? <>
              <div className="flex items-center justify-between gap-3">
                <span className="text-sm font-medium text-ink-800">Current status</span>
                <EventStatusBadge status={detail.data.status} />
              </div>

              {detail.data.decisionReason ? (
                <p className="rounded-lg bg-ink-50 p-3 text-sm text-ink-700">
                  <strong className="font-medium text-ink-900">Decision reason:</strong>{' '}
                  {detail.data.decisionReason}
                </p>
              ) : null}
              {detail.data.clarificationRequest ? (
                <p className="rounded-lg bg-ink-50 p-3 text-sm text-ink-700">
                  <strong className="font-medium text-ink-900">Latest clarification:</strong>{' '}
                  {detail.data.clarificationRequest}
                </p>
              ) : null}

              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Event name" htmlFor="review-event-name">
                  <input
                    id="review-event-name"
                    className="h-10 w-full rounded-lg border border-ink-300 bg-ink-50 px-3 text-sm text-ink-900"
                    value={detail.data.name ?? 'Not provided'}
                    readOnly
                  />
                </Field>
                <Field label="Category" htmlFor="review-event-category">
                  <input
                    id="review-event-category"
                    className="h-10 w-full rounded-lg border border-ink-300 bg-ink-50 px-3 text-sm text-ink-900"
                    value={detail.data.category ?? 'Not provided'}
                    readOnly
                  />
                </Field>
              </div>

              <Field label="Purpose" htmlFor="review-event-purpose">
                <Textarea
                  id="review-event-purpose"
                  value={detail.data.purpose ?? 'Not provided'}
                  readOnly
                  rows={2}
                  className="bg-ink-50"
                />
              </Field>

              <Field label="Description" htmlFor="review-event-description">
                <Textarea
                  id="review-event-description"
                  value={detail.data.description ?? 'Not provided'}
                  readOnly
                  rows={4}
                  className="bg-ink-50"
                />
              </Field>

              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Proposed dates" htmlFor="review-event-dates">
                  <input
                    id="review-event-dates"
                    className="h-10 w-full rounded-lg border border-ink-300 bg-ink-50 px-3 text-sm text-ink-900"
                    value={formatDateRange(detail.data.proposedStart, detail.data.proposedEnd)}
                    readOnly
                  />
                </Field>
                <Field label="Expected attendance" htmlFor="review-event-attendance">
                  <input
                    id="review-event-attendance"
                    className="h-10 w-full rounded-lg border border-ink-300 bg-ink-50 px-3 text-sm text-ink-900"
                    value={detail.data.expectedAttendance ?? 'Not provided'}
                    readOnly
                  />
                </Field>
              </div>

              <div>
                <h3 className="text-sm font-medium text-ink-800">Clarification history</h3>
                {detail.data.clarifications?.length ? (
                  <ol className="mt-2 space-y-3 border-l border-ink-200 pl-4">
                    {detail.data.clarifications.map((message) => (
                      <li key={message.id} className="text-sm">
                        <p className="text-ink-800">{message.body}</p>
                        <p className="mt-1 text-xs text-ink-500">
                          {message.author.name} · {new Date(message.createdAt).toLocaleString()}
                        </p>
                      </li>
                    ))}
                  </ol>
                ) : (
                  <p className="mt-2 text-sm text-ink-500">No clarification messages yet.</p>
                )}
              </div>

              {canDecide ? (
                <div className="space-y-4 border-t border-ink-100 pt-5">
                  <Field
                    label="Decision"
                    htmlFor="review-decision"
                    hint="Choose what should happen to this request."
                  >
                    <Select
                      id="review-decision"
                      value={decision}
                      onChange={(event) => {
                        setDecision(event.target.value as typeof decision);
                        setDecisionText('');
                      }}
                    >
                      <option value="">Select a decision</option>
                      <option value="approve">Approve</option>
                      <option value="clarify">Request clarification</option>
                      <option value="return">Return for changes</option>
                      <option value="reject">Reject</option>
                    </Select>
                  </Field>

                  {decision && decision !== 'approve' ? (
                    <Field
                      label={decision === 'clarify' ? 'Clarification question' : 'Reason'}
                      htmlFor="review-decision-note"
                      required
                    >
                      <Textarea
                        id="review-decision-note"
                        value={decisionText}
                        onChange={(event) => setDecisionText(event.target.value)}
                        rows={3}
                        placeholder={
                          decision === 'clarify'
                            ? 'Type your question for the organiser'
                            : 'Explain this decision to the organiser'
                        }
                      />
                    </Field>
                  ) : null}
                </div>
              ) : null}
              </> : null}

              {reviewError ? (
                <p className="text-sm text-red-700">
                  {apiErrorMessage(reviewError, 'Could not save this review decision.')}
                </p>
              ) : null}
            </div>

            <div className="flex flex-wrap justify-end gap-2 border-t border-ink-100 px-6 py-4">
              <Button
                type="button"
                size="sm"
                disabled={
                  !canDecide ||
                  !decision ||
                  isReviewing ||
                  (decision !== 'approve' && decisionText.trim().length === 0)
                }
                onClick={submitDecision}
              >
                Submit decision
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
