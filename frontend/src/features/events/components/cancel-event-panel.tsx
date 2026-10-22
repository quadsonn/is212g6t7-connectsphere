import { useState } from 'react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Field, Textarea } from '@/components/ui/form';
import { ErrorState } from '@/components/ui/states';
import { useCancelEvent } from '@/features/events/hooks/use-events';
import { apiErrorMessage } from '@/lib/api-client';
import type { CancellationResult, OrganiserRequestView } from '@/types/api';

/** "1 venue booking", "2 venue bookings". */
function countOf(count: number, noun: string): string {
  return `${count} ${noun}${count === 1 ? '' : 's'}`;
}

/** US-65: "Event cancelled. 1 venue booking and 2 equipment reservations were released." */
function cancelledMessage({ released }: CancellationResult): string {
  return released.venueBookings + released.equipmentReservations > 0
    ? `Event cancelled. ${countOf(released.venueBookings, 'venue booking')} and ${countOf(released.equipmentReservations, 'equipment reservation')} were released.`
    : 'Event cancelled.';
}

/**
 * US-43 — the Organiser's cancellation form.
 *
 * AC-2: a reason is required and the Organiser confirms before anything is
 * applied. The confirmation is the second step of this panel — "Cancel event"
 * only opens it, and the destructive button is the only thing that sends
 * `confirm: true`. The server re-checks eligibility and the reason.
 */
export function CancelEventPanel({
  event,
  onClose,
}: {
  event: OrganiserRequestView;
  onClose: () => void;
}) {
  const [reason, setReason] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const cancel = useCancelEvent(event.id);

  const reasonErrors = submitted && reason.trim() === '' ? ['A reason is required.'] : [];

  function handleConfirm(e: React.FormEvent) {
    e.preventDefault();
    setSubmitted(true);
    if (reason.trim() === '') return;

    cancel.mutate(
      { reason: reason.trim(), confirm: true },
      {
        onSuccess: (result) => {
          // US-65 AC2: confirm it went through, and what it released.
          toast.success(cancelledMessage(result));
          onClose();
        },
      },
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Cancel this event?</CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleConfirm} noValidate className="space-y-4">
          <p className="text-sm text-ink-700">
            Cancelling releases every venue booking and equipment reservation held for{' '}
            <strong>{event.name ?? 'this event'}</strong>, closes any pending change request, and
            tells the coordinator and everyone registered. It cannot be undone.
          </p>

          <Field
            label="Reason for cancelling"
            htmlFor="cancel-reason"
            required
            errors={reasonErrors}
          >
            <Textarea
              id="cancel-reason"
              rows={3}
              maxLength={2000}
              value={reason}
              aria-invalid={reasonErrors.length > 0}
              onChange={(e) => setReason(e.target.value)}
            />
          </Field>

          {cancel.isError ? (
            <ErrorState message={apiErrorMessage(cancel.error, 'Could not cancel this event.')} />
          ) : null}

          <div className="flex gap-3">
            <Button type="submit" variant="danger" disabled={cancel.isPending}>
              {cancel.isPending ? 'Cancelling…' : 'Confirm cancellation'}
            </Button>
            <Button type="button" variant="ghost" onClick={onClose} disabled={cancel.isPending}>
              Keep event
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
