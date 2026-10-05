import axios from 'axios';
import { useState } from 'react';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Field, Textarea } from '@/components/ui/form';
import { apiErrorMessage } from '@/lib/api-client';
import { BOOKING_STATUS_STYLES } from '@/lib/status';
import type { BookingConflictErrorBody, VenueBooking } from '@/types/api';
import { useDecideBooking } from '../hooks/use-bookings';
import { ConflictList } from './conflict-list';

type Choice = 'approve' | 'reject' | '';

/**
 * US-23 — the Venue Staff member's actions on one request.
 *
 * AC-1: available from the detail view. AC-2: reject cannot be submitted
 * without a reason. AC-3: approve takes an optional note. AC-7: once a
 * decision is recorded, approve/reject are gone. AC-6: the only remaining
 * action is an explicit, reasoned reversal, recorded as a new entry.
 */
export function BookingDecisionPanel({ booking }: { booking: VenueBooking }) {
  const { approve, reject, reverse } = useDecideBooking();
  const [choice, setChoice] = useState<Choice>('');
  const [text, setText] = useState('');
  const [reversing, setReversing] = useState(false);

  const pending = approve.isPending || reject.isPending || reverse.isPending;
  const error = approve.error ?? reject.error ?? reverse.error;
  const conflicts =
    axios.isAxiosError<BookingConflictErrorBody>(error) && error.response?.status === 409
      ? (error.response.data.conflicts ?? [])
      : [];

  const reset = () => {
    setChoice('');
    setText('');
    setReversing(false);
    approve.reset();
    reject.reset();
    reverse.reset();
  };

  function submitDecision() {
    if (choice === 'approve') {
      approve.mutate({ id: booking.id, note: text.trim() || undefined }, { onSuccess: reset });
    } else if (choice === 'reject') {
      reject.mutate({ id: booking.id, reason: text.trim() }, { onSuccess: reset });
    }
  }

  function submitReversal() {
    reverse.mutate({ id: booking.id, reason: text.trim() }, { onSuccess: reset });
  }

  const errorBlock = error ? (
    <div role="alert" className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-900">
      <p>{apiErrorMessage(error, 'Could not record this decision.')}</p>
      {conflicts.length > 0 ? <ConflictList conflicts={conflicts} /> : null}
    </div>
  ) : null;

  // Pending: approve or reject.
  if (booking.status === 'REQUESTED') {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Decision</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Decision">
            {(['approve', 'reject'] as const).map((option) => (
              <Button
                key={option}
                type="button"
                size="sm"
                role="radio"
                aria-checked={choice === option}
                variant={choice === option ? (option === 'approve' ? 'primary' : 'danger') : 'secondary'}
                onClick={() => {
                  setChoice(option);
                  setText('');
                }}
              >
                {option === 'approve' ? 'Approve' : 'Reject'}
              </Button>
            ))}
          </div>

          {choice ? (
            <Field
              label={choice === 'reject' ? 'Reason for rejection' : 'Note (optional)'}
              htmlFor="booking-decision-text"
              required={choice === 'reject'}
              hint={
                choice === 'reject'
                  ? 'Shown to the Coordinator and Organiser.'
                  : 'Anything the Coordinator should know, e.g. access times.'
              }
            >
              <Textarea
                id="booking-decision-text"
                rows={3}
                value={text}
                onChange={(e) => setText(e.target.value)}
              />
            </Field>
          ) : null}

          {errorBlock}

          <div className="flex justify-end">
            <Button
              type="button"
              size="sm"
              disabled={!choice || pending || (choice === 'reject' && text.trim().length === 0)}
              onClick={submitDecision}
            >
              {pending ? 'Saving…' : 'Submit decision'}
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  // Decided: approve/reject are no longer offered (AC-7). Only a reversal.
  const reversedTo = booking.status === 'APPROVED' ? 'REJECTED' : 'APPROVED';

  return (
    <Card>
      <CardHeader>
        <CardTitle>Decision</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-ink-700">
          This request has been {BOOKING_STATUS_STYLES[booking.status].label.toLowerCase()}. The
          decision is recorded and can't be changed — but it can be reversed, which adds a new entry
          to the history.
        </p>

        {reversing ? (
          <div className="space-y-4 rounded-lg border border-amber-200 bg-amber-50 p-4">
            <p className="text-sm font-medium text-amber-900">
              Reverse to {BOOKING_STATUS_STYLES[reversedTo].label.toLowerCase()}?
            </p>
            <Field label="Reason for reversal" htmlFor="booking-reversal-reason" required>
              <Textarea
                id="booking-reversal-reason"
                rows={3}
                value={text}
                onChange={(e) => setText(e.target.value)}
              />
            </Field>
            {errorBlock}
            <div className="flex flex-wrap justify-end gap-2">
              <Button type="button" size="sm" variant="secondary" onClick={reset}>
                Cancel
              </Button>
              <Button
                type="button"
                size="sm"
                variant="danger"
                disabled={pending || text.trim().length === 0}
                onClick={submitReversal}
              >
                {pending ? 'Saving…' : 'Confirm reversal'}
              </Button>
            </div>
          </div>
        ) : (
          <div className="flex justify-end">
            <Button type="button" size="sm" variant="secondary" onClick={() => setReversing(true)}>
              Reverse this decision
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
