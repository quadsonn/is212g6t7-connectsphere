import { useNavigate } from 'react-router-dom';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { LinkButton } from '@/components/ui/link-button';
import { apiErrorMessage } from '@/lib/api-client';
import type { VenueBooking } from '@/types/api';
import { useAcceptSuggestion } from '../hooks/use-bookings';
import { capacityShortfallMessage } from '../lib/capacity';

/**
 * US-41 — the alternatives Venue Staff suggested when they rejected this
 * request (AC-5), with their reason, each of which the Coordinator can accept
 * (AC-6). Accepting creates a new request for that venue with this request's
 * details; Venue Staff still decide on it.
 *
 * Shown for the latest decision only: once a request is rejected again, the
 * newest reason and alternatives are the ones that apply.
 *
 * Capacity AC-1/AC-2: a suggestion too small for this request's attendance
 * (its capacity cut since, or suggested before the rule) can't be requested;
 * it says why. The server refuses it regardless.
 */
export function SuggestedAlternatives({ booking }: { booking: VenueBooking }) {
  const accept = useAcceptSuggestion();
  const navigate = useNavigate();

  const latest = booking.decisions.at(-1);
  if (booking.status !== 'REJECTED' || !latest || latest.suggestions.length === 0) {
    return null;
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Alternative venues suggested</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {latest.reason ? (
          <p className="text-sm text-ink-800">
            <span className="font-medium text-ink-900">Reason:</span> {latest.reason}
          </p>
        ) : null}

        <ul className="divide-y divide-ink-100">
          {latest.suggestions.map((suggestion) => {
            const shortfall = suggestion.acceptedBookingId
              ? null
              : capacityShortfallMessage(suggestion.venue, booking.expectedAttendance);
            return (
            <li key={suggestion.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
              <div className="text-sm">
                <p className="font-medium text-ink-900">{suggestion.venue.name ?? 'Unnamed venue'}</p>
                <p className="text-ink-600">
                  {[
                    suggestion.venue.location,
                    suggestion.venue.capacity !== null ? `seats ${suggestion.venue.capacity}` : null,
                  ]
                    .filter(Boolean)
                    .join(' · ')}
                </p>
                {shortfall ? (
                  <p className="mt-1 text-red-700">{shortfall} It can't be requested.</p>
                ) : null}
              </div>
              {suggestion.acceptedBookingId ? (
                <LinkButton
                  to={`/coordinator/bookings/${suggestion.acceptedBookingId}`}
                  variant="secondary"
                  size="sm"
                >
                  Requested — view request
                </LinkButton>
              ) : (
                <Button
                  type="button"
                  size="sm"
                  disabled={accept.isPending || Boolean(shortfall)}
                  onClick={() =>
                    accept.mutate(
                      { bookingId: booking.id, suggestionId: suggestion.id },
                      { onSuccess: (created) => navigate(`/coordinator/bookings/${created.id}`) },
                    )
                  }
                >
                  Request this venue
                </Button>
              )}
            </li>
            );
          })}
        </ul>

        <p className="text-xs text-ink-500">
          Requesting a venue sends a new request with this request's date, time, attendance and
          requirements. Venue Staff still approve or reject it.
        </p>

        {accept.error ? (
          <p role="alert" className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-900">
            {apiErrorMessage(accept.error, 'Could not request this venue.')}
          </p>
        ) : null}
      </CardContent>
    </Card>
  );
}
