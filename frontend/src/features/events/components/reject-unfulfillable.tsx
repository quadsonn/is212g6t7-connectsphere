import { useState } from 'react';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Field, Textarea } from '@/components/ui/form';
import { apiErrorMessage } from '@/lib/api-client';
import { UNFULFILLABLE_REASON_LABELS, type UnfulfillableReason } from '@/types/api';
import { useRejectUnfulfillable } from '../hooks/use-events';

const REASONS = Object.keys(UNFULFILLABLE_REASON_LABELS) as UnfulfillableReason[];

/**
 * US-47 — the Coordinator rejects an approved request when no suitable venue
 * or equipment can ultimately be found (AC-1), choosing a reason and adding a
 * comment (AC-2), neither of which can be left out (AC-3). The server moves
 * the event to Rejected (AC-4), releases its venue bookings and equipment
 * (AC-5), and notifies the Organiser (AC-6).
 *
 * Shown only to the responsible Coordinator while the event is being
 * arranged; the server enforces both.
 */
export function RejectUnfulfillable({ eventId }: { eventId: string }) {
  const reject = useRejectUnfulfillable(eventId);
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState<UnfulfillableReason | ''>('');
  const [comment, setComment] = useState('');

  const reset = () => {
    setOpen(false);
    setReason('');
    setComment('');
    reject.reset();
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Can't be fulfilled?</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {!open ? (
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-ink-700">
              If no suitable venue or equipment can be found, reject the request so the Organiser
              gets a clear outcome.
            </p>
            <Button type="button" size="sm" variant="danger" onClick={() => setOpen(true)}>
              Reject request
            </Button>
          </div>
        ) : (
          <>
            <fieldset>
              <legend className="text-sm font-medium text-ink-800">
                Reason<span className="ml-1 text-red-600" aria-hidden="true">*</span>
                <span className="sr-only"> (required)</span>
              </legend>
              <div className="mt-2 space-y-1.5" role="radiogroup">
                {REASONS.map((value) => (
                  <label key={value} className="flex items-center gap-2 text-sm text-ink-800">
                    <input
                      type="radio"
                      name="unfulfillable-reason"
                      value={value}
                      checked={reason === value}
                      onChange={() => setReason(value)}
                    />
                    {UNFULFILLABLE_REASON_LABELS[value]}
                  </label>
                ))}
              </div>
            </fieldset>

            <Field
              label="Comment"
              htmlFor="unfulfillable-comment"
              required
              hint="Shown to the Organiser with the reason."
            >
              <Textarea
                id="unfulfillable-comment"
                rows={3}
                value={comment}
                maxLength={2000}
                onChange={(e) => setComment(e.target.value)}
              />
            </Field>

            <p className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
              The event will be rejected, and its venue bookings and equipment reservations
              released. Their records are kept.
            </p>

            {reject.error ? (
              <p role="alert" className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-900">
                {apiErrorMessage(reject.error, 'Could not reject this request.')}
              </p>
            ) : null}

            <div className="flex flex-wrap justify-end gap-2">
              <Button type="button" size="sm" variant="secondary" onClick={reset}>
                Cancel
              </Button>
              <Button
                type="button"
                size="sm"
                variant="danger"
                disabled={!reason || comment.trim().length === 0 || reject.isPending}
                onClick={() => {
                  if (!reason) return;
                  reject.mutate({ reason, comment: comment.trim() });
                }}
              >
                {reject.isPending ? 'Rejecting…' : 'Confirm rejection'}
              </Button>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
