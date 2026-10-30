import { useState } from 'react';

import { Button } from '@/components/ui/button';
import { LinkButton } from '@/components/ui/link-button';
import { cn, formatDateRange, STRETCHED_LINK } from '@/lib/utils';
import type { VenueBooking } from '@/types/api';
import { BookingStatusBadge } from './booking-status-badge';

/**
 * The booking requests on one event, each with its current decision and
 * reason (US-23 AC-5). Used on both the Coordinator's and the Organiser's
 * view of an event.
 *
 * US-53 AC-4/AC-6: an event may hold several, each with its own status; given
 * `onRelease`, each active one can be cancelled or released on its own, after
 * a confirmation.
 */
export function EventBookingsList({
  bookings,
  detailPath,
  onRelease,
  releasingId,
}: {
  bookings: VenueBooking[];
  /** Where "View details" goes; omitted when the viewer has no detail page. */
  detailPath?: (id: string) => string;
  /** US-53 AC-6: release one booking. Omitted for viewers who cannot. */
  onRelease?: (id: string) => void;
  /** The booking whose release is in flight, if any. */
  releasingId?: string | null;
}) {
  const [confirming, setConfirming] = useState<string | null>(null);

  return (
    <ul className="divide-y divide-ink-100 rounded-lg border border-ink-200">
      {bookings.map((booking) => {
        const latest = booking.decisions.at(-1);
        return (
          <li
            key={booking.id}
            className={cn(
              'group flex flex-wrap items-start justify-between gap-3 px-4 py-3 text-sm',
              detailPath && 'relative transition-colors hover:bg-ink-50',
            )}
          >
            <div className="min-w-0 space-y-0.5">
              <p
                className={cn(
                  'font-medium text-ink-900',
                  detailPath && 'group-hover:text-brand-700 group-hover:underline',
                )}
              >
                {booking.venue.name}
              </p>
              {booking.venue.location ? (
                <p className="text-ink-700">{booking.venue.location}</p>
              ) : null}
              <p className="text-ink-500">{formatDateRange(booking.start, booking.end)}</p>
              {latest ? (
                <p className="text-ink-700">
                  {latest.kind === 'RELEASE'
                    ? 'Released'
                    : latest.kind === 'REVERSAL'
                      ? 'Decision reversed'
                      : 'Decided'}{' '}
                  by {latest.decidedBy?.name ?? 'the system'} on{' '}
                  {new Date(latest.createdAt).toLocaleDateString()}
                  {latest.reason ? ` — ${latest.reason}` : ''}
                </p>
              ) : null}
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <BookingStatusBadge status={booking.status} />
              {detailPath ? (
                <LinkButton
                  to={detailPath(booking.id)}
                  variant="secondary"
                  size="sm"
                  className={STRETCHED_LINK}
                >
                  View details
                </LinkButton>
              ) : null}
              {/* Above the stretched link, so these stay clickable. */}
              {onRelease && (booking.status === 'REQUESTED' || booking.status === 'APPROVED') ? (
                confirming === booking.id ? (
                  <div className="relative z-10 flex gap-2">
                    <Button
                      type="button"
                      size="sm"
                      variant="danger"
                      disabled={releasingId === booking.id}
                      onClick={() => {
                        onRelease(booking.id);
                        setConfirming(null);
                      }}
                    >
                      {booking.status === 'REQUESTED' ? 'Confirm cancel' : 'Confirm release'}
                    </Button>
                    <Button type="button" size="sm" variant="ghost" onClick={() => setConfirming(null)}>
                      Keep
                    </Button>
                  </div>
                ) : (
                  <Button
                    type="button"
                    size="sm"
                    variant="secondary"
                    className="relative z-10"
                    onClick={() => setConfirming(booking.id)}
                  >
                    {booking.status === 'REQUESTED' ? 'Cancel request' : 'Release'}
                  </Button>
                )
              ) : null}
            </div>
          </li>
        );
      })}
    </ul>
  );
}
