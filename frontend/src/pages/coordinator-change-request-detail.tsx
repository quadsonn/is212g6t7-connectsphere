import axios from 'axios';
import { AlertTriangle } from 'lucide-react';
import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';

import { PageHeader } from '@/components/layout/app-shell';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Field, Textarea } from '@/components/ui/form';
import { LinkButton } from '@/components/ui/link-button';
import { ErrorState, LoadingState } from '@/components/ui/states';
import { ArrangementCheckPanel } from '@/features/events/components/arrangement-check';
import { ChangeRequestComparison } from '@/features/events/components/change-request-comparison';
import { EventStatusBadge } from '@/features/events/components/event-status-badge';
import {
  useChangeRequestReview,
  useDecideChangeRequest,
} from '@/features/events/hooks/use-events';
import { apiErrorMessage } from '@/lib/api-client';
import { formatDate } from '@/lib/utils';
import type { ChangeRequestApproval, ChangeRequestCheckFailedBody } from '@/types/api';

/**
 * What the Coordinator is told once an approval has moved things. US-48 AC-7:
 * each arrangement was rebooked for the new details and the original released.
 */
function approvalNotice(eventName: string, result: ChangeRequestApproval): string {
  const { venueBookings, equipmentReservations } = result.arrangements;
  const parts: string[] = [];

  if (venueBookings.length > 0) {
    parts.push(
      `${venueBookings.length} venue booking${venueBookings.length === 1 ? '' : 's'} rebooked for the new time`,
    );
  }
  if (equipmentReservations.length > 0) {
    parts.push(
      `${equipmentReservations.length} equipment reservation${equipmentReservations.length === 1 ? '' : 's'} rebooked for the new time`,
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
 *
 * US-48: the arrangement check — what still works, what would conflict and
 * why, and what approval would move — sits above the decision too. A venue or
 * equipment conflict disables Approve (capacity alone never does); Reject
 * stays available. Re-check runs the check again, as does returning to the
 * page. If something changed after the page loaded, the server refuses the
 * approval, changes nothing and leaves the request pending; the page then
 * refreshes so Approve is disabled.
 */
export function CoordinatorChangeRequestDetail() {
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const {
    data: review,
    isPending,
    isError,
    error,
    refetch,
    isFetching,
  } = useChangeRequestReview(id);
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

  const { request, event, warnings, check } = review;
  // US-48: any venue or equipment conflict blocks approval. Capacity is only
  // ever a warning (`warnings`), never a conflict.
  const blocked = check.conflicts.length > 0;
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
  // US-48 AC-8: the server refused the approval — something changed after the
  // page loaded. Nothing was changed and the request is still pending.
  const failedCheck =
    axios.isAxiosError<ChangeRequestCheckFailedBody>(approve.error) &&
    approve.error.response?.data?.code === 'CHANGE_REQUEST_CHECK_FAILED'
      ? approve.error.response.data
      : null;

  return (
    <>
      <PageHeader
        title={eventName}
        description={`Change requested by ${request.requestedBy.name} on ${formatDate(request.createdAt)}`}
        action={<EventStatusBadge status={event.status} />}
      />

      <div className="max-w-3xl space-y-5">
        {/* AC-6 (and US-48 AC-2): capacity, shown before the decision. A warning, not a block. */}
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

        {/* US-48 AC-1..AC-4, AC-6: the arrangement check, while it can still be decided. */}
        {request.status === 'PENDING' ? <ArrangementCheckPanel check={check} /> : null}

        {failedCheck ? (
          <div role="alert" className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-900">
            <p className="font-medium">
              Not approved — something changed since this page loaded. Nothing was changed and the
              request is still pending. The check below has been refreshed.
            </p>
            <ul className="mt-2 list-disc space-y-1 pl-5">
              {failedCheck.conflicts.map((conflict, i) => (
                <li key={i}>
                  <span className="font-medium">{conflict.label}:</span> {conflict.reason}
                </li>
              ))}
            </ul>
          </div>
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
                <div className="space-y-3">
                  {/* US-48: every conflict, next to the button it disables. */}
                  {blocked ? (
                    <div
                      id="approve-blocked"
                      className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-900"
                    >
                      <p className="font-medium">
                        Approve is unavailable while {check.conflicts.length === 1 ? 'this conflicts' : 'these conflict'}:
                      </p>
                      <ul className="mt-1 list-disc space-y-0.5 pl-5" aria-label="Why Approve is unavailable">
                        {check.conflicts.map((conflict, i) => (
                          <li key={i}>
                            <span className="font-medium">{conflict.label}:</span> {conflict.reason}
                          </li>
                        ))}
                      </ul>
                      <p className="mt-1 text-xs">
                        Reject the request with a reason, or re-check once the arrangements change.
                      </p>
                    </div>
                  ) : null}
                  <div className="flex flex-wrap justify-end gap-2">
                    <Button
                      type="button"
                      variant="ghost"
                      onClick={() => {
                        approve.reset();
                        void refetch();
                      }}
                      disabled={busy || isFetching}
                    >
                      {isFetching ? 'Re-checking…' : 'Re-check'}
                    </Button>
                    <Button type="button" variant="secondary" onClick={() => setRejecting(true)} disabled={busy}>
                      Reject
                    </Button>
                    <Button
                      type="button"
                      onClick={handleApprove}
                      disabled={busy || blocked || isFetching}
                      aria-describedby={blocked ? 'approve-blocked' : undefined}
                    >
                      {approve.isPending ? 'Approving…' : 'Approve'}
                    </Button>
                  </div>
                </div>
              )}

              {decisionError && !failedCheck ? (
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
