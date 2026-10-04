import { ArrowLeft } from 'lucide-react';
import { Link, useParams, useSearchParams } from 'react-router-dom';

import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Select } from '@/components/ui/form';
import { ErrorState, LoadingState } from '@/components/ui/states';
import { TabPanel, Tabs } from '@/components/ui/tabs';
import { VenueAvailabilityCalendar } from '@/features/venues/components/venue-availability-calendar';
import { VenueImageCarousel } from '@/features/venues/components/venue-image-carousel';
import { VenueSuitabilityPanel } from '@/features/venues/components/venue-suitability-panel';
import { useVenue } from '@/features/venues/hooks/use-venues';
import { useAuth } from '@/features/auth/hooks/use-auth';
import { useAssignedRequests } from '@/features/events/hooks/use-events';
import { apiErrorMessage } from '@/lib/api-client';
import { formatDateRange, humanise } from '@/lib/utils';
import {
  ACCESSIBILITY_FEATURE_LABELS,
  FACILITY_LABELS,
  type EventStatus,
  type Venue,
} from '@/types/api';

/** Mirrors the backend's US-20 rule: events with no use for a venue. */
const INACTIVE_FOR_BOOKING: EventStatus[] = ['DRAFT', 'REJECTED', 'CANCELLED', 'COMPLETED'];

const TABS = [
  { id: 'overview', label: 'Overview' },
  { id: 'suitability', label: 'Suitability' },
  { id: 'availability', label: 'Availability' },
] as const;
type TabId = (typeof TABS)[number]['id'];

/**
 * US-15 AC-2 (detail), US-17 (availability) and US-20 (suitability), for a
 * Coordinator. The tab and the selected event live in the URL, so a link can
 * open the page on a given tab with an event already chosen.
 */
export function CoordinatorVenueDetail() {
  const { id = '' } = useParams<{ id: string }>();
  const { data: venue, isPending, isError, error } = useVenue(id);
  const [searchParams, setSearchParams] = useSearchParams();

  const tabParam = searchParams.get('tab');
  const tab: TabId = TABS.some((t) => t.id === tabParam) ? (tabParam as TabId) : 'overview';
  const eventId = searchParams.get('eventId') ?? '';

  const setParam = (key: string, value: string) => {
    const next = new URLSearchParams(searchParams);
    if (value) next.set(key, value);
    else next.delete(key);
    setSearchParams(next, { replace: true });
  };

  return (
    <>
      <Link
        to="/coordinator/venues"
        className="mb-4 inline-flex items-center gap-1.5 text-sm text-ink-500 hover:text-ink-800"
      >
        <ArrowLeft className="size-4" aria-hidden="true" />
        Venues
      </Link>

      {isPending ? <LoadingState label="Loading venue…" /> : null}
      {isError ? <ErrorState message={apiErrorMessage(error, 'Could not load this venue.')} /> : null}

      {venue ? (
        <>
          <header className="mb-5 flex flex-wrap items-center gap-4">
            {venue.imageUrls[0] ? (
              <img src={venue.imageUrls[0]} alt="" className="size-14 rounded-lg object-cover" />
            ) : null}
            <div className="min-w-0 flex-1">
              <h1 className="text-xl font-semibold tracking-tight text-ink-900">{venue.name}</h1>
              <p className="text-sm text-ink-500">
                {venue.location} · {venue.capacity} seats
              </p>
            </div>
            {/* AC-5 (US-20): never gated on suitability. Disabled only because
                the request flow (US-21) is not on this branch yet. */}
            <Button disabled title="The booking request flow (US-21) is not available yet">
              Request this venue
            </Button>
          </header>

          <Card className="px-5 pt-4 pb-5">
            <Tabs
              idPrefix="venue"
              label="Venue sections"
              tabs={TABS}
              active={tab}
              onChange={(next) => setParam('tab', next === 'overview' ? '' : next)}
            />

            {tab === 'overview' ? (
              <TabPanel idPrefix="venue" id="overview">
                <Overview venue={venue} />
              </TabPanel>
            ) : null}

            {tab === 'suitability' ? (
              <TabPanel idPrefix="venue" id="suitability">
                <Suitability
                  venueId={venue.id}
                  eventId={eventId}
                  onSelect={(next) => setParam('eventId', next)}
                />
              </TabPanel>
            ) : null}

            {tab === 'availability' ? (
              <TabPanel idPrefix="venue" id="availability">
                <VenueAvailabilityCalendar venueId={venue.id} />
              </TabPanel>
            ) : null}
          </Card>
        </>
      ) : null}
    </>
  );
}

function Overview({ venue }: { venue: Venue }) {
  const facilities = venue.facilities.map((f) => FACILITY_LABELS[f]);
  const accessibility = venue.accessibilityFeatures.map((f) => ACCESSIBILITY_FEATURE_LABELS[f]);

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
      <VenueImageCarousel images={venue.imageUrls} />
      <dl className="space-y-4 text-sm">
        <Detail label="Layouts">
          {venue.supportedLayouts.map(humanise).join(', ') || '—'}
        </Detail>
        <Detail label="Facilities">
          <Tags values={facilities} notes={venue.facilityNotes} />
        </Detail>
        <Detail label="Accessibility">
          <Tags values={accessibility} notes={venue.accessibilityNotes} />
        </Detail>
        <Detail label="Hours">{venue.operatingInfo ?? '—'}</Detail>
      </dl>
    </div>
  );
}

function Detail({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="mb-1 text-xs font-medium text-ink-500">{label}</dt>
      <dd className="text-ink-800">{children}</dd>
    </div>
  );
}

/** Vocabulary values as quiet tags, then any free-text notes (US-18). */
function Tags({ values, notes }: { values: string[]; notes: string | null }) {
  if (values.length === 0 && !notes) return <>—</>;
  return (
    <>
      {values.length > 0 ? (
        <span className="flex flex-wrap gap-1.5">
          {values.map((value) => (
            <span key={value} className="rounded-full bg-ink-100 px-2.5 py-0.5 text-xs text-ink-700">
              {value}
            </span>
          ))}
        </span>
      ) : null}
      {notes ? <span className="mt-1.5 block text-ink-600">{notes}</span> : null}
    </>
  );
}

function Suitability({
  venueId,
  eventId,
  onSelect,
}: {
  venueId: string;
  eventId: string;
  onSelect: (eventId: string) => void;
}) {
  const { session } = useAuth();
  const { data: assigned } = useAssignedRequests();

  // Same rule the server enforces: my events, still in need of a venue.
  const myEvents = (assigned ?? []).filter(
    (event) =>
      event.coordinatorId === session?.userId && !INACTIVE_FOR_BOOKING.includes(event.status),
  );

  return (
    <div className="max-w-2xl space-y-5">
      <div className="flex flex-wrap items-center gap-3">
        <label htmlFor="suitability-event" className="text-sm font-medium text-ink-800">
          Check against
        </label>
        <Select
          id="suitability-event"
          className="max-w-sm flex-1"
          value={eventId}
          onChange={(e) => onSelect(e.target.value)}
        >
          <option value="">Choose one of your events…</option>
          {myEvents.map((event) => (
            <option key={event.id} value={event.id}>
              {event.name ?? 'Untitled event'} · {formatDateRange(event.proposedStart, event.proposedEnd)}
            </option>
          ))}
        </Select>
      </div>

      {assigned && myEvents.length === 0 ? (
        <p className="text-sm text-ink-500">You have no active events to check against.</p>
      ) : null}

      {eventId ? (
        <VenueSuitabilityPanel venueId={venueId} eventId={eventId} />
      ) : (
        <p className="text-sm text-ink-500">Advisory only — it never stops you requesting the venue.</p>
      )}
    </div>
  );
}
