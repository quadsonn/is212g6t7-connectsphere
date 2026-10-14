import { ArrowLeft } from 'lucide-react';
import { useParams } from 'react-router-dom';

import { PageHeader } from '@/components/layout/app-shell';
import { LinkButton } from '@/components/ui/link-button';
import { ErrorState, LoadingState } from '@/components/ui/states';
import { BookingDecisionPanel } from '@/features/bookings/components/booking-decision-panel';
import { BookingDetails } from '@/features/bookings/components/booking-details';
import { ReviewFlagPanel } from '@/features/bookings/components/review-flag-panel';
import { useBookingRequest } from '@/features/bookings/hooks/use-bookings';
import { apiErrorMessage } from '@/lib/api-client';

/**
 * US-22 AC-6 — the full request, including its special requirements, opened
 * from the queue, with the US-23 approve/reject actions above it.
 */
export function VenueBookingDetail() {
  const { id } = useParams<{ id: string }>();
  const { data: booking, isPending, isError, error } = useBookingRequest(id ?? '');

  return (
    <>
      <PageHeader
        title={booking?.event.name ?? 'Booking request'}
        description="Everything submitted with this booking request."
        action={
          <LinkButton to="/venues/bookings" variant="secondary" size="sm">
            <ArrowLeft className="size-4" aria-hidden="true" />
            Back to queue
          </LinkButton>
        }
      />

      {isPending ? <LoadingState label="Loading request…" /> : null}
      {isError ? (
        <ErrorState message={apiErrorMessage(error, 'Could not load this request.')} />
      ) : null}
      {booking ? (
        <div className="space-y-4">
          <ReviewFlagPanel booking={booking} />
          <BookingDecisionPanel booking={booking} />
          <BookingDetails booking={booking} />
        </div>
      ) : null}
    </>
  );
}
