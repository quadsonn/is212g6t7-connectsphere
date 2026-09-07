import { PageHeader } from '@/components/layout/app-shell';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { EmptyState, ErrorState, MockDataNotice, TableSkeleton } from '@/components/ui/states';
import { useVenues } from '@/features/venues/hooks/use-venues';
import { VENUES_ENDPOINT_READY } from '@/features/venues/api/venues.api';
import { apiErrorMessage } from '@/lib/api-client';
import { VENUE_STATUS_STYLES } from '@/lib/status';

/** MOCKED — GET /venues is not built yet (E4). Data comes from venuesApi. */
export function VenueDashboard() {
  const { data: venues, isPending, isError, error } = useVenues();

  return (
    <>
      <PageHeader
        title="Venue catalogue"
        description="Spaces you maintain, and whether each is published for booking."
      />

      <Card>
        {!VENUES_ENDPOINT_READY ? <MockDataNotice endpoint="GET /venues" /> : null}

        <CardHeader>
          <CardTitle>Venues</CardTitle>
          {venues ? <span className="text-sm text-ink-500">{venues.length} total</span> : null}
        </CardHeader>

        {isPending ? <TableSkeleton /> : null}

        {isError ? (
          <CardContent>
            <ErrorState message={apiErrorMessage(error, 'Could not load the catalogue.')} />
          </CardContent>
        ) : null}

        {venues && venues.length === 0 ? (
          <EmptyState title="No venues" description="Venues you add will be listed here." />
        ) : null}

        {venues && venues.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <caption className="sr-only">Venue catalogue with capacity and publication state</caption>
              <thead className="border-b border-ink-200 text-xs uppercase tracking-wide text-ink-500">
                <tr>
                  <th scope="col" className="px-5 py-3 font-medium">Venue</th>
                  <th scope="col" className="px-5 py-3 font-medium">Location</th>
                  <th scope="col" className="px-5 py-3 font-medium">Capacity</th>
                  <th scope="col" className="px-5 py-3 font-medium">State</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-ink-100">
                {venues.map((venue) => {
                  const style = VENUE_STATUS_STYLES[venue.status];
                  return (
                    <tr key={venue.id} className="hover:bg-ink-50">
                      <td className="px-5 py-3.5">
                        <span className="font-medium text-ink-900">{venue.name}</span>
                        <span className="mt-0.5 block text-xs text-ink-500">
                          {venue.supportedLayouts.join(' · ')}
                        </span>
                      </td>
                      <td className="px-5 py-3.5 text-ink-600">{venue.location}</td>
                      <td className="px-5 py-3.5 text-ink-600">{venue.capacity}</td>
                      <td className="px-5 py-3.5">
                        <Badge className={style.className} srPrefix="State">
                          {style.label}
                        </Badge>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : null}
      </Card>
    </>
  );
}
