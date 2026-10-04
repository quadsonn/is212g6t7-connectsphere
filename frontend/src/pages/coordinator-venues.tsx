import { useState } from 'react';
import { ChevronRight, Search, SlidersHorizontal } from 'lucide-react';
import { Link } from 'react-router-dom';

import { PageHeader } from '@/components/layout/app-shell';
import { SidebarPortal } from '@/components/layout/sidebar-slot';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { EmptyState, ErrorState, TableSkeleton } from '@/components/ui/states';
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
import {
  ACCESSIBILITY_FEATURE_LABELS,
  FACILITY_LABELS,
  type Venue,
  type VenueSearchQuery,
} from '@/types/api';

/** Tags shown per result before collapsing the rest into "+N". */
const MAX_TAGS = 4;

/**
 * REAL data — GET /venues/search (US-18). Published venues only, decided by
 * the server. Each row leads to the venue's detail page (US-17/US-20).
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

        <Card>
          {isPending ? <TableSkeleton /> : null}

          {isError ? (
            <div className="p-5">
              <ErrorState
                message={apiErrorMessage(error, 'Could not search venues.')}
              />
            </div>
          ) : null}

          {/* AC-6: an explained empty state with a way out, never a blank list. */}
          {venues && venues.length === 0 ? (
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
          ) : null}

          {venues && venues.length > 0 ? (
            <ul
              className={cn(
                'divide-y divide-ink-100',
                isFetching && 'opacity-60',
              )}
            >
              {venues.map((venue) => (
                <VenueRow key={venue.id} venue={venue} applied={applied} />
              ))}
            </ul>
          ) : null}
        </Card>
      </section>
    </>
  );
}

/** One result. Tags the venue matched on come first and are emphasised. */
function VenueRow({
  venue,
  applied,
}: {
  venue: Venue;
  applied: VenueSearchFilters;
}) {
  const tags = [
    ...venue.accessibilityFeatures.map((f) => ({
      key: f,
      label: ACCESSIBILITY_FEATURE_LABELS[f],
      matched: applied.accessibility.includes(f),
    })),
    ...venue.facilities.map((f) => ({
      key: f,
      label: FACILITY_LABELS[f],
      matched: applied.facilities.includes(f),
    })),
  ].sort((a, b) => Number(b.matched) - Number(a.matched));
  const shown = tags.slice(0, MAX_TAGS);
  const hidden = tags.length - shown.length;

  return (
    <li>
      <Link
        to={`/coordinator/venues/${venue.id}`}
        className="flex items-center gap-4 px-4 py-3 hover:bg-ink-50"
      >
        {venue.imageUrls[0] ? (
          <img
            src={venue.imageUrls[0]}
            alt=""
            className="size-11 rounded-md object-cover"
          />
        ) : (
          <div className="size-11 rounded-md bg-ink-100" aria-hidden="true" />
        )}
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-baseline gap-x-2">
            <span className="font-medium text-ink-900">{venue.name}</span>
            <span className="text-sm text-ink-500">
              {venue.location} · {venue.capacity} seats
            </span>
          </div>
          {shown.length > 0 ? (
            <div className="mt-1 flex flex-wrap gap-1">
              {shown.map((tag) => (
                <span
                  key={tag.key}
                  className={cn(
                    'rounded-full px-2 py-0.5 text-xs',
                    tag.matched
                      ? 'bg-brand-50 font-medium text-brand-800'
                      : 'bg-ink-100 text-ink-600',
                  )}
                >
                  {tag.matched ? (
                    <span className="sr-only">Matches filter: </span>
                  ) : null}
                  {tag.label}
                </span>
              ))}
              {hidden > 0 ? (
                <span className="px-1 text-xs text-ink-400">
                  +{hidden}
                  <span className="sr-only"> more</span>
                </span>
              ) : null}
            </div>
          ) : null}
        </div>
        <ChevronRight
          className="size-4 shrink-0 text-ink-300"
          aria-hidden="true"
        />
      </Link>
    </li>
  );
}
