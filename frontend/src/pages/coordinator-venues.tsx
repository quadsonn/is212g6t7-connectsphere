import { useState } from 'react';
import { Search, SlidersHorizontal } from 'lucide-react';

import { PageHeader } from '@/components/layout/app-shell';
import { SidebarPortal } from '@/components/layout/sidebar-slot';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { EmptyState, ErrorState } from '@/components/ui/states';
import { VenueCard } from '@/features/venues/components/venue-card';
import { VenueFilterPanel } from '@/features/venues/components/venue-filter-panel';
import { useVenueSearch } from '@/features/venues/hooks/use-venues';
import {
  EMPTY_FILTERS,
  hasActiveFilters,
  toSearchQuery,
  type VenueSearchFilters,
} from '@/features/venues/search-filters';
import { apiErrorMessage } from '@/lib/api-client';
import { SIDEBAR_BREAKPOINT, useMediaQuery } from '@/lib/use-media-query';
import { cn } from '@/lib/utils';
import type { VenueSearchQuery } from '@/types/api';

/**
 * REAL data — GET /venues/search (US-18). Published venues only, decided by
 * the server. Each card leads to the venue's detail page (US-17/US-20).
 *
 * Filters are edited in a draft and applied with an explicit Search, so
 * picking chips or typing a capacity never fires a request by itself.
 */
export function CoordinatorVenues() {
  const [draft, setDraft] = useState<VenueSearchFilters>(EMPTY_FILTERS);
  const [applied, setApplied] = useState<VenueSearchFilters>(EMPTY_FILTERS);
  const [appliedQuery, setAppliedQuery] = useState<VenueSearchQuery>({});
  const [formError, setFormError] = useState<string | null>(null);
  const sidebarVisible = useMediaQuery(SIDEBAR_BREAKPOINT);
  const [filtersOpen, setFiltersOpen] = useState(false);

  const {
    data: venues,
    isPending,
    isFetching,
    isError,
    error,
  } = useVenueSearch(appliedQuery);

  const set = <K extends keyof VenueSearchFilters>(
    key: K,
    value: VenueSearchFilters[K],
  ) => setDraft((prev) => ({ ...prev, [key]: value }));

  const runSearch = (filters: VenueSearchFilters) => {
    const result = toSearchQuery(filters);
    if (result.error !== undefined) {
      setFormError(result.error);
      return;
    }
    setFormError(null);
    setApplied(filters);
    setAppliedQuery(result.query);
  };

  const clear = () => {
    setDraft(EMPTY_FILTERS);
    runSearch(EMPTY_FILTERS);
  };

  const filtering = hasActiveFilters(applied);

  const panel = (
    <VenueFilterPanel
      filters={draft}
      onChange={set}
      onSubmit={() => runSearch(draft)}
      onClear={clear}
      error={formError}
    />
  );

  return (
    <>
      <PageHeader
        title="Venues"
        description="Find a venue, then check its suitability and calendar."
      />

      {/* The name search belongs to the filter form (via the form attribute),
          so Enter or Search applies it together with every filter. */}
      <div className="mb-5 flex gap-2">
        <div className="relative flex-1">
          <Search
            className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-400"
            aria-hidden="true"
          />
          <Input
            id="search-name"
            form="venue-search-form"
            type="search"
            aria-label="Search venues by name"
            placeholder="Search venues by name"
            value={draft.name}
            onChange={(e) => set('name', e.target.value)}
            className="pl-9"
          />
        </div>
        <Button type="submit" form="venue-search-form">
          Search
        </Button>
      </div>

      {/* US-18 filters: in AppShell's sidebar where it is shown, otherwise
          behind a Filters button. Rendered in exactly one place at a time. */}
      {sidebarVisible ? (
        <SidebarPortal>{panel}</SidebarPortal>
      ) : (
        <div className="mb-4">
          <Button
            variant="secondary"
            size="sm"
            aria-expanded={filtersOpen}
            onClick={() => setFiltersOpen((open) => !open)}
          >
            <SlidersHorizontal className="size-4" aria-hidden="true" />
            Filters{filtering ? ' (active)' : ''}
          </Button>
          {/* Hidden, not unmounted: the name search submits this form even
              while the filters are collapsed. */}
          <div hidden={!filtersOpen}>{panel}</div>
        </div>
      )}

      <section
        aria-label="Results"
        aria-busy={isFetching}
        className="self-start"
      >
        {venues ? (
          <p className="mb-2 text-sm text-ink-500" aria-live="polite">
            {venues.length} venue{venues.length === 1 ? '' : 's'}
          </p>
        ) : null}

        {isPending ? <VenueGridSkeleton /> : null}

        {isError ? (
          <Card className="p-5">
            <ErrorState
              message={apiErrorMessage(error, 'Could not search venues.')}
            />
          </Card>
        ) : null}

        {/* AC-6: an explained empty state with a way out, never a blank list. */}
        {venues && venues.length === 0 ? (
          <Card>
            <EmptyState
              title={
                filtering
                  ? 'No venues match your filters'
                  : 'No venues published yet'
              }
              description={
                filtering
                  ? 'Try removing a filter.'
                  : 'Venues appear here once they are published.'
              }
              action={
                filtering ? (
                  <Button variant="secondary" onClick={clear}>
                    Clear filters
                  </Button>
                ) : undefined
              }
            />
          </Card>
        ) : null}

        {venues && venues.length > 0 ? (
          <ul
            className={cn(
              'grid gap-4 sm:grid-cols-2 xl:grid-cols-3',
              isFetching && 'opacity-60',
            )}
          >
            {venues.map((venue) => (
              <VenueCard key={venue.id} venue={venue} applied={applied} />
            ))}
          </ul>
        ) : null}
      </section>
    </>
  );
}

/** Card-shaped placeholders while the first search loads. */
function VenueGridSkeleton() {
  return (
    <div
      className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3"
      aria-hidden="true"
    >
      {Array.from({ length: 6 }).map((_, index) => (
        <div
          key={index}
          className="overflow-hidden rounded-card border border-ink-200 bg-white"
        >
          <div className="aspect-[16/10] animate-pulse bg-ink-100" />
          <div className="space-y-2 p-4">
            <div className="h-4 w-2/3 animate-pulse rounded bg-ink-100" />
            <div className="h-3 w-1/2 animate-pulse rounded bg-ink-100" />
          </div>
        </div>
      ))}
    </div>
  );
}
