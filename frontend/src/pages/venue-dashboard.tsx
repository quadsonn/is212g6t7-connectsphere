import { useState } from 'react';
import { ArrowDown, ArrowUp, Search } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

import { PageHeader } from '@/components/layout/app-shell';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { EmptyState, ErrorState, TableSkeleton } from '@/components/ui/states';
import { useDeleteVenue, useVenues } from '@/features/venues/hooks/use-venues';
import { apiErrorMessage } from '@/lib/api-client';
import { VENUE_STATUS_STYLES } from '@/lib/status';
import type { BrowseVenuesQuery } from '@/types/api';

/** REAL data — GET /venues (US-13, US-15). */
export function VenueDashboard() {
  const [search, setSearch] = useState('');
  const [sortBy, setSortBy] = useState<BrowseVenuesQuery['sortBy']>('name');
  const [sortOrder, setSortOrder] = useState<BrowseVenuesQuery['sortOrder']>('asc');
  const navigate = useNavigate();

  const { data: venues, isPending, isError, error } = useVenues({
    // Sent to the server, which does the filtering — not a client-side filter
    // over a partial list.
    search: search.trim() || undefined,
    sortBy,
    sortOrder,
  });

  const deleteVenue = useDeleteVenue();
  const [deleteError, setDeleteError] = useState<string | null>(null);

  // Hard delete — the database itself refuses (Restrict constraint) if the
  // venue still has bookings against it, so no soft-delete/archive state is
  // needed here. The confirm() is deliberate: this is a rare, high-stakes,
  // irreversible action, not something to speed-run past.
  const handleDelete = (venueId: string, venueName: string | null) => {
    const confirmed = window.confirm(
      `Delete "${venueName ?? 'this venue'}" permanently? This cannot be undone.`,
    );
    if (!confirmed) return;

    setDeleteError(null);
    deleteVenue.mutate(venueId, {
      onError: (err) =>
        setDeleteError(apiErrorMessage(err, 'Could not delete this venue.')),
    });
  };

  return (
    <>
      <div className="flex items-start justify-between gap-4">
        <PageHeader
          title="Venue catalogue"
          description="Spaces you maintain, and whether each is published for booking."
        />
        <Button onClick={() => navigate('/venues/new')}>+ Add venue</Button>
      </div>

      {deleteError ? (
        <ErrorState message={deleteError} />
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>Venues</CardTitle>
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative">
              <Search
                className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-ink-400"
                aria-hidden="true"
              />
              <Input
                type="search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search by name"
                aria-label="Search venues by name"
                className="w-56 pl-8"
              />
            </div>

            <label className="sr-only" htmlFor="venue-sort">
              Sort venues by
            </label>
            <select
              id="venue-sort"
              value={sortBy}
              onChange={(e) =>
                setSortBy(e.target.value as BrowseVenuesQuery['sortBy'])
              }
              className="h-10 rounded-lg border border-ink-300 bg-white px-3 text-sm text-ink-900"
            >
              <option value="name">Name</option>
              <option value="capacity">Capacity</option>
              <option value="location">Location</option>
            </select>

            {/* US-15 AC-3: "via sorting" — direction, not just field.
                The backend already supports sortOrder; this was the only
                piece missing from the UI. */}
            <button
              type="button"
              onClick={() => setSortOrder((prev) => (prev === 'asc' ? 'desc' : 'asc'))}
              aria-label={
                sortOrder === 'asc'
                  ? 'Sorted ascending — click to sort descending'
                  : 'Sorted descending — click to sort ascending'
              }
              className="flex h-10 items-center gap-1.5 rounded-lg border border-ink-300 bg-white px-3 text-sm text-ink-600 hover:bg-ink-50"
            >
              {sortOrder === 'asc' ? (
                <ArrowUp className="size-4" aria-hidden="true" />
              ) : (
                <ArrowDown className="size-4" aria-hidden="true" />
              )}
              {sortOrder === 'asc' ? 'Ascending' : 'Descending'}
            </button>
          </div>
        </CardHeader>

        {isPending ? <TableSkeleton /> : null}

        {isError ? (
          <CardContent>
            <ErrorState message={apiErrorMessage(error, 'Could not load the catalogue.')} />
          </CardContent>
        ) : null}

        {venues && venues.length === 0 ? (
          <EmptyState
            title={search ? 'No venues match that search' : 'No venues yet'}
            description={
              search
                ? 'Try a different name, or clear the search to see the whole catalogue.'
                : 'Venues you add will be listed here. Drafts are visible only to you.'
            }
          />
        ) : null}

        {venues && venues.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <caption className="sr-only">
                Venue catalogue with capacity and publication state
              </caption>
              <thead className="border-b border-ink-200 text-xs uppercase tracking-wide text-ink-500">
                <tr>
                  <th scope="col" className="px-5 py-3 font-medium">
                    <span className="sr-only">Photo</span>
                  </th>
                  <th scope="col" className="px-5 py-3 font-medium">Venue</th>
                  <th scope="col" className="px-5 py-3 font-medium">Location</th>
                  <th scope="col" className="px-5 py-3 font-medium">Capacity</th>
                  <th scope="col" className="px-5 py-3 font-medium">State</th>
                  <th scope="col" className="px-5 py-3 font-medium text-right">
                    <span className="sr-only">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-ink-100">
                {venues.map((venue) => {
                  const style = VENUE_STATUS_STYLES[venue.status];
                  return (
                    <tr key={venue.id} className="hover:bg-ink-50">
                      <td className="px-5 py-3.5">
                        {venue.imageUrls.length > 0 ? (
                          <img
                            src={venue.imageUrls[0]}
                            alt=""
                            className="size-12 rounded-lg object-cover"
                          />
                        ) : (
                          <div className="flex size-12 items-center justify-center rounded-lg bg-ink-100 text-xs text-ink-400">
                            —
                          </div>
                        )}
                      </td>
                      <td className="px-5 py-3.5">
                        {/* A draft may have these fields still empty (US-13). */}
                        <span className="font-medium text-ink-900">
                          {venue.name ?? (
                            <span className="italic text-ink-400">Untitled venue</span>
                          )}
                        </span>
                        {venue.supportedLayouts.length > 0 ? (
                          <span className="mt-0.5 block text-xs text-ink-500">
                            {venue.supportedLayouts.join(' · ')}
                          </span>
                        ) : null}
                      </td>
                      <td className="px-5 py-3.5 text-ink-600">
                        {venue.location ?? '—'}
                      </td>
                      <td className="px-5 py-3.5 text-ink-600">
                        {venue.capacity ?? '—'}
                      </td>
                      <td className="px-5 py-3.5">
                        <Badge className={style.className} srPrefix="State">
                          {style.label}
                        </Badge>
                      </td>
                      <td className="px-5 py-3.5 text-right">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => navigate(`/venues/${venue.id}/edit`)}
                        >
                          Edit
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-red-600 hover:bg-red-50 hover:text-red-700"
                          onClick={() => handleDelete(venue.id, venue.name)}
                          disabled={deleteVenue.isPending}
                        >
                          Delete
                        </Button>
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