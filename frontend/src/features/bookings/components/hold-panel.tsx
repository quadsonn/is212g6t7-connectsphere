import { useState } from 'react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { DateTimeField } from '@/components/ui/date-time-field';
import { Field } from '@/components/ui/form';
import { ErrorState } from '@/components/ui/states';
import { apiErrorMessage } from '@/lib/api-client';
import { todayInVenueTime } from '@/lib/calendar';
import { FULL_DAY_TIME_SLOTS } from '@/lib/date-time';
import { formatDateTime } from '@/lib/utils';
import type { VenueBooking } from '@/types/api';
import { useHolds } from '../hooks/use-bookings';
import { holdProblems, isLiveHold } from '../holds';

/**
 * US-54 AC-5 — a tentative hold on the booking page: when it expires, and
 * Convert / Extend / Release while it is live. Once it has expired or been
 * released the actions are gone and the panel says how it ended; the server
 * refuses them anyway (409). Renders nothing for a booking that was never a hold.
 */
export function HoldPanel({ booking, now = new Date() }: { booking: VenueBooking; now?: Date }) {
  const { convert, extend, release } = useHolds();
  const [extending, setExtending] = useState(false);
  const [expiresAt, setExpiresAt] = useState('');

  if (booking.status !== 'HELD' && booking.status !== 'RELEASED') return null;

  const live = isLiveHold(booking, now);
  const expiry = booking.holdExpiresAt ? formatDateTime(booking.holdExpiresAt) : '—';
  const pending = convert.isPending || extend.isPending || release.isPending;
  const error = convert.error ?? extend.error ?? release.error;
  const problems = holdProblems({ start: booking.start, end: booking.end, expiresAt, eventStart: null }, now);

  return (
    <Card className="border-sky-200">
      <CardHeader>
        <CardTitle>Tentative hold</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {live ? (
          <p className="text-sm text-ink-800">
            This slot is held until <strong>{expiry}</strong>. If it is not confirmed by then, it is released
            automatically and the venue becomes available.
          </p>
        ) : booking.status === 'RELEASED' ? (
          <p className="text-sm text-ink-800">
            Released{booking.releaseReason ? `: ${booking.releaseReason}` : ''}. The slot is available again.
          </p>
        ) : (
          <p className="text-sm text-ink-800">This hold expired at {expiry}. The slot is available again.</p>
        )}

        {live && extending ? (
          <div className="space-y-3 rounded-lg border border-sky-200 bg-sky-50 p-4">
            <Field
              label="New expiry"
              htmlFor="hold-extend"
              required
              hint="Must be in the future and before the held time and the event start."
              errors={problems.length > 0 ? problems : undefined}
            >
              <DateTimeField
                id="hold-extend"
                label="New expiry"
                value={expiresAt}
                onChange={setExpiresAt}
                slots={FULL_DAY_TIME_SLOTS}
                min={todayInVenueTime()}
                invalid={problems.length > 0}
              />
            </Field>
            <div className="flex flex-wrap justify-end gap-2">
              <Button type="button" size="sm" variant="secondary" onClick={() => setExtending(false)}>
                Cancel
              </Button>
              <Button
                type="button"
                size="sm"
                disabled={pending || !expiresAt || problems.length > 0}
                onClick={() =>
                  extend.mutate(
                    { id: booking.id, expiresAt: new Date(expiresAt).toISOString() },
                    {
                      onSuccess: () => {
                        setExtending(false);
                        toast.success('Hold extended.');
                      },
                    },
                  )
                }
              >
                Save new expiry
              </Button>
            </div>
          </div>
        ) : null}

        {error ? <ErrorState message={apiErrorMessage(error, 'Could not update this hold.')} /> : null}

        {live && !extending ? (
          <div className="flex flex-wrap justify-end gap-2">
            <Button
              type="button"
              size="sm"
              variant="danger"
              disabled={pending}
              onClick={() => release.mutate(booking.id, { onSuccess: () => toast.success('Hold released.') })}
            >
              Release
            </Button>
            <Button type="button" size="sm" variant="secondary" disabled={pending} onClick={() => setExtending(true)}>
              Extend
            </Button>
            <Button
              type="button"
              size="sm"
              disabled={pending}
              onClick={() => convert.mutate(booking.id, { onSuccess: () => toast.success('Hold confirmed as a booking.') })}
            >
              Convert to booking
            </Button>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
