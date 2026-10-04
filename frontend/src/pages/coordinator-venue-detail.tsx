import { ArrowLeft } from 'lucide-react';
import { useParams, useSearchParams } from 'react-router-dom';

import { PageHeader } from '@/components/layout/app-shell';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Select } from '@/components/ui/form';
import { LinkButton } from '@/components/ui/link-button';
import { ErrorState, LoadingState } from '@/components/ui/states';
import { VenueAvailabilityCalendar } from '@/features/venues/components/venue-availability-calendar';
import { VenueImageCarousel } from '@/features/venues/components/venue-image-carousel';
import { VenueSuitabilityPanel } from '@/features/venues/components/venue-suitability-panel';
import { useVenue } from '@/features/venues/hooks/use-venues';
import { useAuth } from '@/features/auth/hooks/use-auth';
import { useAssignedRequests } from '@/features/events/hooks/use-events';
import { apiErrorMessage } from '@/lib/api-client';
import { formatDateRange, humanise } from '@/lib/utils';
import { ACCESSIBILITY_FEATURE_LABELS, FACILITY_LABELS, type EventStatus } from '@/types/api';

/** Mirrors the backend's US-20 rule: events with no use for a venue. */
const INACTIVE_FOR_BOOKING: EventStatus[] = ['DRAFT', 'REJECTED', 'CANCELLED', 'COMPLETED'];

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="text-xs font-medium uppercase tracking-wide text-ink-500">{label}</dt>
      <dd className="mt-1 text-sm text-ink-900">{children}</dd>
    </div>
  );
}

/** Vocabulary labels, then any free-text notes beyond the vocabulary (US-18). */
function listWithNotes<T extends string>(
  values: T[],
  labels: Record<T, string>,
  notes: string | null,
) {
  const listed = values.map((v) => labels[v]).join(', ');
  if (!listed && !notes) return '—';
  return (
    <>
      {listed}
      {notes ? <span className="mt-1 block text-ink-600">{notes}</span> : null}
    </>
  );
}

/** US-15 AC-2 (venue detail) + US-17 (its availability), for a Coordinator. */
export function CoordinatorVenueDetail() {
  const { id = '' } = useParams<{ id: string }>();
  const { data: venue, isPending, isError, error } = useVenue(id);
  const { session } = useAuth();
  const { data: assigned } = useAssignedRequests();
  // US-20: the selected event lives in the URL, so a link can open the page
  // with an event already chosen.
  const [searchParams, setSearchParams] = useSearchParams();
  const eventId = searchParams.get('eventId') ?? '';

  // Same rule the server enforces: my events, still in need of a venue.
  const myEvents = (assigned ?? []).filter(
    (event) =>
      event.coordinatorId === session?.userId && !INACTIVE_FOR_BOOKING.includes(event.status),
  );

  const selectEvent = (next: string) =>
    setSearchParams(next ? { eventId: next } : {}, { replace: true });

  return (
    <>
      <PageHeader
        title={venue?.name ?? 'Venue'}
        description="Check when this venue is free before you request it."
        action={
          <LinkButton to="/coordinator/venues" variant="secondary" size="sm">
            <ArrowLeft className="size-4" aria-hidden="true" />
            Back to venues
          </LinkButton>
        }
      />

      {isPending ? <LoadingState label="Loading venue…" /> : null}
      {isError ? <ErrorState message={apiErrorMessage(error, 'Could not load this venue.')} /> : null}

      {venue ? (
        <div className="space-y-5">
          <Card>
            <CardContent className="grid gap-6 lg:grid-cols-2">
              <VenueImageCarousel images={venue.imageUrls} />
              <dl className="grid content-start gap-4 sm:grid-cols-2">
                <Field label="Location">{venue.location ?? '—'}</Field>
                <Field label="Capacity">{venue.capacity ?? '—'}</Field>
                <Field label="Layouts">
                  {venue.supportedLayouts.length > 0
                    ? venue.supportedLayouts.map(humanise).join(', ')
                    : '—'}
                </Field>
                <Field label="Facilities">
                  {listWithNotes(venue.facilities, FACILITY_LABELS, venue.facilityNotes)}
                </Field>
                <Field label="Accessibility">
                  {listWithNotes(
                    venue.accessibilityFeatures,
                    ACCESSIBILITY_FEATURE_LABELS,
                    venue.accessibilityNotes,
                  )}
                </Field>
                <Field label="Operating hours">{venue.operatingInfo ?? '—'}</Field>
              </dl>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <div>
                <CardTitle>Suitability for an event</CardTitle>
                <CardDescription>
                  Check this venue against one of your events before you request it. The check
                  is advisory — it never stops you requesting the venue.
                </CardDescription>
              </div>
              {/* AC-5: never gated on suitability. Disabled only because the
                  request flow (US-21) is not on this branch yet. */}
              <Button size="sm" disabled title="The booking request flow (US-21) is not available yet">
                Request this venue
              </Button>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="max-w-md">
                <label htmlFor="suitability-event" className="mb-1 block text-sm font-medium text-ink-800">
                  Event
                </label>
                <Select
                  id="suitability-event"
                  value={eventId}
                  onChange={(e) => selectEvent(e.target.value)}
                >
                  <option value="">Choose one of your events…</option>
                  {myEvents.map((event) => (
                    <option key={event.id} value={event.id}>
                      {event.name ?? 'Untitled event'} —{' '}
                      {formatDateRange(event.proposedStart, event.proposedEnd)}
                    </option>
                  ))}
                </Select>
                {assigned && myEvents.length === 0 ? (
                  <p className="mt-1 text-sm text-ink-500">
                    You have no active events assigned to you to check against.
                  </p>
                ) : null}
              </div>

              {eventId ? <VenueSuitabilityPanel venueId={venue.id} eventId={eventId} /> : null}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <div>
                <CardTitle>Availability</CardTitle>
                <CardDescription>
                  Days are in Singapore time. A tentatively held day has a pending request that
                  may still be approved.
                </CardDescription>
              </div>
            </CardHeader>
            <CardContent>
              <VenueAvailabilityCalendar venueId={venue.id} />
            </CardContent>
          </Card>
        </div>
      ) : null}
    </>
  );
}
