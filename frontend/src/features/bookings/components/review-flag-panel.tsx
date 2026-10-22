import { useState } from 'react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ErrorState } from '@/components/ui/states';
import { Field, Textarea } from '@/components/ui/form';
import { apiErrorMessage } from '@/lib/api-client';
import type { VenueBooking } from '@/types/api';
import { useResolveReview } from '../hooks/use-bookings';
import { NeedsReviewBadge } from './needs-review-badge';

/**
 * US-51 — a booking flagged "Conflict - needs review" after a buffer change:
 * why, and a way for the managing Venue Staff member to mark it resolved.
 * The booking detail page is only reachable by them. Renders nothing for an
 * unflagged booking.
 */
export function ReviewFlagPanel({ booking }: { booking: VenueBooking }) {
  const resolve = useResolveReview();
  const [note, setNote] = useState('');

  if (!booking.needsReview) return null;

  const onResolve = () =>
    resolve.mutate(
      { id: booking.id, note: note.trim() || undefined },
      { onSuccess: () => toast.success('Conflict marked as resolved.') },
    );

  return (
    <Card className="border-red-200">
      <CardHeader>
        <CardTitle className="flex flex-wrap items-center gap-2">
          <NeedsReviewBadge />
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-ink-800">{booking.needsReviewReason}</p>
        <p className="text-xs text-ink-500">
          The booking itself has not been changed. Resolve the clash with the organisers, then mark it
          resolved.
        </p>
        <Field label="Resolution note (optional)" htmlFor={`resolve-note-${booking.id}`}>
          <Textarea
            id={`resolve-note-${booking.id}`}
            rows={2}
            value={note}
            onChange={(e) => setNote(e.target.value)}
          />
        </Field>
        {resolve.error ? (
          <ErrorState message={apiErrorMessage(resolve.error, 'Could not mark this resolved.')} />
        ) : null}
        <div className="flex justify-end">
          <Button type="button" onClick={onResolve} disabled={resolve.isPending}>
            {resolve.isPending ? 'Saving…' : 'Mark resolved'}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
