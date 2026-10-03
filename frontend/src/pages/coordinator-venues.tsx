import { useState } from 'react';
import { ChevronRight, Search } from 'lucide-react';
import { Link } from 'react-router-dom';

import { PageHeader } from '@/components/layout/app-shell';
import { Card, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { EmptyState, ErrorState, TableSkeleton } from '@/components/ui/states';
import { useVenues } from '@/features/venues/hooks/use-venues';
import { apiErrorMessage } from '@/lib/api-client';

/**
 * REAL data — GET /venues (US-15), as a Coordinator sees it: published venues
 * only, decided by the server. Each row leads to the venue's availability
 * calendar (US-17).
 */
export function CoordinatorVenues() {
  const [search, setSearch] = useState('');
  const { data: venues, isPending, isError, error } = useVenues({
    search: search.trim() || undefined,
    sortBy: 'name',
    sortOrder: 'asc',
  });

  return (
    <>
      <PageHeader
        title="Venues"
        description="Published venues, and when each one is free, before you request it."
      />

      <Card>
        <CardHeader>
          <CardTitle>Catalogue</CardTitle>
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
        </CardHeader>

        {isPending ? <TableSkeleton /> : null}

        {isError ? (
          <div className="p-5">
            <ErrorState message={apiErrorMessage(error, 'Could not load venues.')} />
          </div>
        ) : null}

        {venues && venues.length === 0 ? (
          <EmptyState
            title={search ? 'No venues match that search' : 'No venues published yet'}
            description={
              search
                ? 'Try a different name, or clear the search.'
                : 'Venues appear here once Venue Staff publish them.'
            }
          />
        ) : null}

        {venues && venues.length > 0 ? (
          <ul className="divide-y divide-ink-100">
            {venues.map((venue) => (
              <li key={venue.id}>
                <Link
                  to={`/coordinator/venues/${venue.id}`}
                  className="flex items-center gap-4 px-5 py-3.5 hover:bg-ink-50"
                >
                  {venue.imageUrls.length > 0 ? (
                    <img src={venue.imageUrls[0]} alt="" className="size-12 rounded-lg object-cover" />
                  ) : (
                    <div className="flex size-12 items-center justify-center rounded-lg bg-ink-100 text-xs text-ink-400">
                      —
                    </div>
                  )}
                  <div className="min-w-0 flex-1">
                    <span className="block font-medium text-ink-900">{venue.name}</span>
                    <span className="block text-sm text-ink-500">
                      {venue.location} · capacity {venue.capacity}
                    </span>
                  </div>
                  <ChevronRight className="size-4 text-ink-400" aria-hidden="true" />
                </Link>
              </li>
            ))}
          </ul>
        ) : null}
      </Card>
    </>
  );
}
