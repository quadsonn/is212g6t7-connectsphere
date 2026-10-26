import { Link } from 'react-router-dom';

import { PageHeader } from '@/components/layout/app-shell';
import { Card } from '@/components/ui/card';
import { LinkButton } from '@/components/ui/link-button';
import { EmptyState, ErrorState, TableSkeleton } from '@/components/ui/states';
import { BookingStatusBadge } from '@/features/bookings/components/booking-status-badge';
import { useMyBookingRequests } from '@/features/bookings/hooks/use-bookings';
import { attendanceBandLabel } from '@/lib/attendance-bands';
import { apiErrorMessage } from '@/lib/api-client';
import { formatDate, formatDateRange } from '@/lib/utils';

/** US-21 AC-6 — every venue booking request this Coordinator has raised. */
export function CoordinatorBookings() {
  const { data: bookings, isPending, isError, error } = useMyBookingRequests();

  return (
    <>
      <PageHeader
        title="My venue requests"
        description="Venue booking requests you've submitted, and where each one stands."
      />

      <Card aria-busy={isPending}>
        {isPending ? <TableSkeleton /> : null}

        {isError ? (
          <div className="p-5">
            <ErrorState message={apiErrorMessage(error, 'Could not load your venue requests.')} />
          </div>
        ) : null}

        {bookings && bookings.length === 0 ? (
          <EmptyState
            title="No venue requests yet"
            description="Open an approved event from My events to request a venue for it."
          />
        ) : null}

        {bookings && bookings.length > 0 ? (
          <ul className="divide-y divide-ink-100">
            {bookings.map((booking) => (
              <li
                key={booking.id}
                className="flex flex-wrap items-start justify-between gap-3 px-5 py-4"
              >
                <div className="min-w-0 space-y-0.5">
                  <Link
                    to={`/coordinator/events/${booking.eventId}`}
                    className="font-medium text-ink-900 hover:text-brand-700 hover:underline"
                  >
                    {booking.event.name ?? 'Untitled event'}
                  </Link>
                  <p className="text-sm text-ink-700">
                    {booking.venue.name} · {formatDateRange(booking.start, booking.end)}
                  </p>
                  <p className="text-xs text-ink-500">
                    {attendanceBandLabel(booking.expectedAttendance)} expected · requested{' '}
                    {formatDate(booking.createdAt)}
                  </p>
                  {booking.decisionReason ? (
                    <p className="text-sm text-ink-700">Reason: {booking.decisionReason}</p>
                  ) : null}
                </div>
                <div className="flex items-center gap-3">
                  <BookingStatusBadge status={booking.status} />
                  <LinkButton
                    to={`/coordinator/bookings/${booking.id}`}
                    variant="secondary"
                    size="sm"
                  >
                    View details
                  </LinkButton>
                </div>
              </li>
            ))}
          </ul>
        ) : null}
      </Card>
    </>
  );
}
