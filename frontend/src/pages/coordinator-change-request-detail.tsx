import { AlertTriangle } from 'lucide-react';
import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';

import { PageHeader } from '@/components/layout/app-shell';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Field, Textarea } from '@/components/ui/form';
import { LinkButton } from '@/components/ui/link-button';
import { ErrorState, LoadingState } from '@/components/ui/states';
import { ChangeRequestComparison } from '@/features/events/components/change-request-comparison';
import { EventStatusBadge } from '@/features/events/components/event-status-badge';
import {
  useChangeRequestReview,
  useDecideChangeRequest,
} from '@/features/events/hooks/use-events';
import { apiErrorMessage } from '@/lib/api-client';
import { formatDate, formatDateRange } from '@/lib/utils';
import type { ChangeRequestApproval } from '@/types/api';

/** What the Coordinator is told once an approval has moved things. */
function approvalNotice(eventName: string, result: ChangeRequestApproval): string {
  const { venueBookings, equipmentReservations } = result.arrangements;
  const parts: string[] = [];

  if (venueBookings.length > 0) {
    parts.push(
      `${venueBookings.length} venue booking${venueBookings.length === 1 ? '' : 's'} moved and sent back to Venue Staff for approval`,
    );
  }
  if (equipmentReservations.length > 0) {
    parts.push(
      `${equipmentReservations.length} equipment reservation${equipmentReservations.length === 1 ? '' : 's'} released for Technical Support to reserve again`,
    );
  }

  return `Approved. ${eventName} now has the requested changes.${
    parts.length > 0 ? ` ${parts.join('; ')}.` : ''
  }`;
}

/**
 * US-38 — one change request, for the Coordinator to approve or reject.
 *
 * Order matters: the capacity warning (AC-6) sits above the decision, so it is
 * read before the buttons are reached.
 */
export function CoordinatorChangeRequestDetail() {
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const { data: review, isPending, isError, error } = useChangeRequestReview(id);
  const { approve, reject } = useDecideChangeRequest(id ?? '');

  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState('');
  const [submitted, setSubmitted] = useState(false);

  if (isPending) {
    return (
      <>
        <PageHeader title="Change request" description="Loading…" />
        <LoadingState label="Loading change request…" />
      </>
    );
  }

  if (isError || !review) {
    return (
      <>
        <PageHeader title="Change request" description="Loading…" />
        <ErrorState message={apiErrorMessage(error, 'Could not load this change request.')} />
        <div className="mt-4">
          <LinkButton to="/coordinator/change-requests" variant="secondary">
            Back to change requests
          </LinkButton>
        </div>
      </>
    );
  }

  const { request, event, warnings, impact } = review;
  const hasImpact =
    impact.venueBookings.length > 0 || impact.equipmentReservations.length > 0;
  const busy = approve.isPending || reject.isPending;
  const decided = request.status !== 'PENDING';
  const eventName = event.name ?? 'Untitled event';

  const done = (notice: string) =>
    navigate('/coordinator/change-requests', { state: { notice } });

  function handleApprove() {
    approve.mutate(undefined, {
      onSuccess: (result) => done(approvalNotice(eventName, result)),
    });
  }

  function handleReject(e: React.FormEvent) {
    e.preventDefault();
    setSubmitted(true);
    if (reason.trim() === '') return;

    reject.mutate(reason.trim(), {
      onSuccess: () => done(`Rejected. ${eventName} is unchanged.`),
    });
  }

  const decisionError = approve.error ?? reject.error;

  return (
    <>
      <PageHeader
        title={eventName}
        description={`Change requested by ${request.requestedBy.name} on ${formatDate(request.createdAt)}`}
        action={<EventStatusBadge status={event.status} />}
      />

      <div className="max-w-3xl space-y-5">
        {/* AC-6, and clashes at a new time: shown before the decision. Warnings, not blocks. */}
        {warnings.length > 0 ? (
          <div
            role="alert"
            className="flex items-start gap-3 rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900"
          >
            <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
            <div className="space-y-1">
              <p className="font-medium">Check before you decide</p>
              {warnings.map((warning, index) => (
                <p key={`${warning.type}-${index}`}>{warning.message}</p>
              ))}
              <p className="text-xs">
                You can still approve it, but the arrangements may need to change.
              </p>
            </div>
          </div>
        ) : null}

        <Card>
          <CardHeader>
            <CardTitle>Reason for the change</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="whitespace-pre-line text-sm text-ink-900">{request.reason}</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Current and proposed</CardTitle>
          </CardHeader>
          <CardContent>
            <ChangeRequestComparison review={review} />
          </CardContent>
        </Card>

        {hasImpact && request.status === 'PENDING' ? (
          <Card>
            <CardHeader>
              <CardTitle>If you approve</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm text-ink-800">
              <p className="text-ink-500">
                The event's dates change, so its existing arrangements are re-reviewed rather than
                left on the old dates.
              </p>
              <ul className="list-disc space-y-1.5 pl-5">
                {impact.venueBookings.map((booking) => (
                  <li key={booking.bookingId}>
                    Venue booking at {booking.venueName ?? 'the booked venue'} moves from{' '}
                    {formatDateRange(booking.from.start, booking.from.end)} to{' '}
                    {formatDateRange(booking.to.start, booking.to.end)} and goes back to Venue Staff
                    for approval.
                  </li>
                ))}
                {impact.equipmentReservations.map((reservation) => (
                  <li key={reservation.reservationId}>
                    {reservation.quantity} × {reservation.equipmentType} reservation is released;
                    Technical Support will need to reserve it again for the new dates.
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        ) : null}

        {decided ? (
          <ErrorState
            className="border-ink-200 bg-ink-50 text-ink-800"
            message={`This request was ${request.status.toLowerCase()}${
              request.decidedAt ? ` on ${formatDate(request.decidedAt)}` : ''
            }.`}
          />
        ) : (
          <Card>
            <CardHeader>
              <CardTitle>Your decision</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {rejecting ? (
                <form className="space-y-4" onSubmit={handleReject} noValidate>
                  <Field
                    label="Reason for rejecting"
                    htmlFor="reject-reason"
                    required
                    hint="The Organiser will see this on their event."
                    errors={submitted && reason.trim() === '' ? ['A reason is required.'] : undefined}
                  >
                    <Textarea
                      id="reject-reason"
                      rows={3}
                      maxLength={2000}
                      value={reason}
                      onChange={(e) => setReason(e.target.value)}
                      aria-invalid={submitted && reason.trim() === ''}
                    />
                  </Field>
                  <div className="flex justify-end gap-2">
                    <Button
                      type="button"
                      variant="secondary"
                      onClick={() => {
                        setRejecting(false);
                        setSubmitted(false);
                      }}
                      disabled={busy}
                    >
                      Back
                    </Button>
                    <Button type="submit" disabled={busy}>
                      {reject.isPending ? 'Rejecting…' : 'Confirm rejection'}
                    </Button>
                  </div>
                </form>
              ) : (
                <div className="flex flex-wrap justify-end gap-2">
                  <Button type="button" variant="secondary" onClick={() => setRejecting(true)} disabled={busy}>
                    Reject
                  </Button>
                  <Button type="button" onClick={handleApprove} disabled={busy}>
                    {approve.isPending ? 'Approving…' : 'Approve'}
                  </Button>
                </div>
              )}

              {decisionError ? (
                <p role="alert" className="text-sm text-red-700">
                  {apiErrorMessage(decisionError, 'Could not record your decision.')}
                </p>
              ) : null}
            </CardContent>
          </Card>
        )}

        <LinkButton to="/coordinator/change-requests" variant="ghost">
          Back to change requests
        </LinkButton>
      </div>
    </>
  );
}
