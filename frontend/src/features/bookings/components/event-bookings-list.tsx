import { LinkButton } from '@/components/ui/link-button';
import { formatDateRange } from '@/lib/utils';
import type { VenueBooking } from '@/types/api';
import { BookingStatusBadge } from './booking-status-badge';

/**
 * The booking requests on one event, each with its current decision and
 * reason (US-23 AC-5). Used on both the Coordinator's and the Organiser's
 * view of an event.
 */
export function EventBookingsList({
  bookings,
  detailPath,
}: {
  bookings: VenueBooking[];
  /** Where "View details" goes; omitted when the viewer has no detail page. */
  detailPath?: (id: string) => string;
}) {
  return (
    <ul className="divide-y divide-ink-100 rounded-lg border border-ink-200">
      {bookings.map((booking) => {
        const latest = booking.decisions.at(-1);
        return (
          <li
            key={booking.id}
            className="flex flex-wrap items-start justify-between gap-3 px-4 py-3 text-sm"
          >
            <div className="min-w-0 space-y-0.5">
              <p className="font-medium text-ink-900">{booking.venue.name}</p>
              {booking.venue.location ? (
                <p className="text-ink-700">{booking.venue.location}</p>
              ) : null}
              <p className="text-ink-500">{formatDateRange(booking.start, booking.end)}</p>
              {latest ? (
                <p className="text-ink-700">
                  {latest.kind === 'REVERSAL' ? 'Decision reversed' : 'Decided'} by{' '}
                  {latest.decidedBy.name} on {new Date(latest.createdAt).toLocaleDateString()}
                  {latest.reason ? ` — ${latest.reason}` : ''}
                </p>
              ) : null}
            </div>
            <div className="flex items-center gap-2">
              <BookingStatusBadge status={booking.status} />
              {detailPath ? (
                <LinkButton to={detailPath(booking.id)} variant="secondary" size="sm">
                  View details
                </LinkButton>
              ) : null}
            </div>
          </li>
        );
      })}
    </ul>
  );
}
