import { ArrowLeft } from 'lucide-react';
import { useParams } from 'react-router-dom';

import { PageHeader } from '@/components/layout/app-shell';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { LinkButton } from '@/components/ui/link-button';
import { ErrorState, LoadingState } from '@/components/ui/states';
import { VenueAvailabilityCalendar } from '@/features/venues/components/venue-availability-calendar';
import { VenueImageCarousel } from '@/features/venues/components/venue-image-carousel';
import { useVenue } from '@/features/venues/hooks/use-venues';
import { apiErrorMessage } from '@/lib/api-client';
import { humanise } from '@/lib/utils';

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="text-xs font-medium uppercase tracking-wide text-ink-500">{label}</dt>
      <dd className="mt-1 text-sm text-ink-900">{children}</dd>
    </div>
  );
}

const listOrDash = (values: string[]) => (values.length > 0 ? values.join(', ') : '—');

/** US-15 AC-2 (venue detail) + US-17 (its availability), for a Coordinator. */
export function CoordinatorVenueDetail() {
  const { id = '' } = useParams<{ id: string }>();
  const { data: venue, isPending, isError, error } = useVenue(id);

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
                <Field label="Facilities">{listOrDash(venue.facilities)}</Field>
                <Field label="Accessibility">{listOrDash(venue.accessibilityFeatures)}</Field>
                <Field label="Operating hours">{venue.operatingInfo ?? '—'}</Field>
              </dl>
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
              {/* US-20 builds the request flow; shown now so the calendar's purpose is clear. */}
              <Button size="sm" disabled title="Coming in a later sprint">
                Request this venue
              </Button>
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
