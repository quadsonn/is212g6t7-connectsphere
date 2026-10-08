import { ArrowLeft } from 'lucide-react';
import { useParams } from 'react-router-dom';

import { PageHeader } from '@/components/layout/app-shell';
import { LinkButton } from '@/components/ui/link-button';
import { ErrorState, LoadingState } from '@/components/ui/states';
import { BookingDetails } from '@/features/bookings/components/booking-details';
import { useBookingRequest } from '@/features/bookings/hooks/use-bookings';
import { apiErrorMessage } from '@/lib/api-client';

/** US-21 — one of the Coordinator's venue booking requests, in full. */
export function CoordinatorBookingDetail() {
  const { id } = useParams<{ id: string }>();
  const { data: booking, isPending, isError, error } = useBookingRequest(id ?? '');

  return (
    <>
      <PageHeader
        title={booking?.event.name ?? 'Venue request'}
        description={
          booking?.status === 'REQUESTED'
            ? 'Pending — waiting on Venue Staff to approve or reject this request.'
            : 'Your venue booking request and its outcome.'
        }
        action={
          <div className="flex flex-wrap gap-2">
            {booking ? (
              <LinkButton
                to={`/coordinator/events/${booking.eventId}`}
                variant="secondary"
                size="sm"
              >
                Open event
              </LinkButton>
            ) : null}
            <LinkButton to="/coordinator/bookings" variant="secondary" size="sm">
              <ArrowLeft className="size-4" aria-hidden="true" />
              Back to my requests
            </LinkButton>
          </div>
        }
      />

      {isPending ? <LoadingState label="Loading request…" /> : null}
      {isError ? (
        <ErrorState message={apiErrorMessage(error, 'Could not load this request.')} />
      ) : null}
      {booking ? <BookingDetails booking={booking} /> : null}
    </>
  );
}
