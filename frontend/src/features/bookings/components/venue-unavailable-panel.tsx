import { AlertTriangle } from 'lucide-react';
import { useState } from 'react';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { LinkButton } from '@/components/ui/link-button';
import { formatDateRange } from '@/lib/utils';
import type { CoordinatorRequestView, ReplacementNeeded } from '@/types/api';
import { useReplacementsNeeded } from '../hooks/use-bookings';
import { BookingStatusBadge } from './booking-status-badge';
import { BookingRequestForm } from './booking-request-form';
import { SuggestedAlternatives } from './suggested-alternatives';

function AffectedBooking({
  event,
  booking,
  canRequest,
}: {
  event: CoordinatorRequestView;
  booking: ReplacementNeeded;
  canRequest: boolean;
}) {
  const [requesting, setRequesting] = useState(false);

  return (
    <Card className="border-red-200">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-red-900">
          <AlertTriangle className="size-4" aria-hidden="true" />
          Venue unavailable
        </CardTitle>
        <BookingStatusBadge status={booking.status} />
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-1 text-sm text-ink-800">
          <p>
            <span className="font-medium text-ink-900">{booking.venue.name ?? 'The booked venue'}</span>{' '}
            is unavailable
            {booking.unavailableFrom && booking.unavailableUntil
              ? ` ${formatDateRange(booking.unavailableFrom, booking.unavailableUntil)}`
              : ''}
            , affecting your booking for {formatDateRange(booking.start, booking.end)}.
          </p>
          {booking.unavailableReason ? (
            <p>
              <span className="font-medium text-ink-900">Reason:</span> {booking.unavailableReason}
            </p>
          ) : null}
          <p className="text-ink-600">
            The event has not been cancelled and its details are unchanged. Request a replacement
            venue; this booking is released once Venue Staff approve one.
          </p>
        </div>

        {booking.replacementRequests.length > 0 ? (
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-ink-500">
              Replacement requests
            </p>
            <ul className="mt-2 divide-y divide-ink-100">
              {booking.replacementRequests.map((r) => (
                <li key={r.id} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm">
                  <span>
                    {r.venue.name ?? 'Unnamed venue'} · {formatDateRange(r.start, r.end)}
                  </span>
                  <span className="flex items-center gap-2">
                    <BookingStatusBadge status={r.status} />
                    <LinkButton to={`/coordinator/bookings/${r.id}`} variant="secondary" size="sm">
                      View
                    </LinkButton>
                  </span>
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        {/* AC-4: alternatives Venue Staff suggested for this booking (US-41). */}
        <SuggestedAlternatives booking={booking} />

        {canRequest ? (
          requesting ? (
            <div className="space-y-3 rounded-lg border border-ink-200 p-4">
              <p className="text-sm font-medium text-ink-900">Request a replacement venue</p>
              <BookingRequestForm key={booking.id} event={event} replacing={booking} />
              <div className="flex justify-end">
                <Button type="button" size="sm" variant="secondary" onClick={() => setRequesting(false)}>
                  Close
                </Button>
              </div>
            </div>
          ) : (
            <div className="flex justify-end">
              <Button type="button" size="sm" onClick={() => setRequesting(true)}>
                Request a replacement venue
              </Button>
            </div>
          )
        ) : null}
      </CardContent>
    </Card>
  );
}

/**
 * US-52 — on the Coordinator's event page: each of the event's bookings whose
 * venue became unavailable (AC-1's details), with the replacement requests
 * already made, any alternatives Venue Staff suggested (AC-4), and a
 * replacement request pre-filled from the booking (AC-3). A booking drops out
 * once its replacement is confirmed (AC-5).
 *
 * Driven by GET /bookings/replacements-needed, which the server scopes to the
 * Coordinator responsible for the event — no one else ever sees it.
 */
export function VenueUnavailablePanel({
  event,
  canRequest,
}: {
  event: CoordinatorRequestView;
  canRequest: boolean;
}) {
  const { data } = useReplacementsNeeded();
  const affected = (data ?? []).filter((b) => b.eventId === event.id);

  if (affected.length === 0) return null;

  return (
    <div className="space-y-4">
      {affected.map((booking) => (
        <AffectedBooking key={booking.id} event={event} booking={booking} canRequest={canRequest} />
      ))}
    </div>
  );
}
