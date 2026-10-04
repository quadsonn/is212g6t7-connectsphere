import { useState } from 'react';
import { ChevronRight, Search } from 'lucide-react';
import { Link } from 'react-router-dom';

import { PageHeader } from '@/components/layout/app-shell';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { ChipGroup } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { EmptyState, ErrorState, TableSkeleton } from '@/components/ui/states';
import { useVenueSearch } from '@/features/venues/hooks/use-venues';
import {
  EMPTY_FILTERS,
  hasActiveFilters,
  toSearchQuery,
  type VenueSearchFilters,
} from '@/features/venues/search-filters';
import { apiErrorMessage } from '@/lib/api-client';
import { cn } from '@/lib/utils';
import {
  ACCESSIBILITY_FEATURE_LABELS,
  ACCESSIBILITY_FEATURES,
  FACILITIES,
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

  const { data: venues, isPending, isFetching, isError, error } = useVenueSearch(appliedQuery);

  const set = <K extends keyof VenueSearchFilters>(key: K, value: VenueSearchFilters[K]) =>
    setDraft((prev) => ({ ...prev, [key]: value }));

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

  return (
    <>
      <PageHeader title="Venues" description="Find a venue, then check its suitability and calendar." />

      {/* Name search spans both columns. It belongs to the filter form (via the
          form attribute), so Enter or Search applies it with every filter. */}
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

      <div className="grid gap-6 lg:grid-cols-[18rem_1fr]">
        <form
          id="venue-search-form"
          className="space-y-5 self-start"
          onSubmit={(e) => {
            e.preventDefault();
            runSearch(draft);
          }}
        >
          <fieldset className="space-y-2">
            <legend className="mb-2 text-xs font-medium text-ink-500">
              Available on <span className="font-normal text-ink-400">· Singapore time</span>
            </legend>
            <Input
              type="date"
              aria-label="Date"
              value={draft.date}
              onChange={(e) => set('date', e.target.value)}
            />
            <div className="flex items-center gap-2">
              <Input
                type="time"
                aria-label="From (leave blank for the whole day)"
                value={draft.startTime}
                onChange={(e) => set('startTime', e.target.value)}
              />
              <span className="text-ink-400" aria-hidden="true">
                –
              </span>
              <Input
                type="time"
                aria-label="To (leave blank for the whole day)"
                value={draft.endTime}
                onChange={(e) => set('endTime', e.target.value)}
              />
            </div>
          </fieldset>

          <div>
            <label htmlFor="search-capacity" className="mb-2 block text-xs font-medium text-ink-500">
              Minimum capacity
            </label>
            <Input
              id="search-capacity"
              type="number"
              min={1}
              inputMode="numeric"
              value={draft.minCapacity}
              onChange={(e) => set('minCapacity', e.target.value)}
            />
          </div>

          <div>
            <p className="mb-2 text-xs font-medium text-ink-500">Accessibility</p>
            <ChipGroup
              label="Accessibility — venue must have all selected"
              options={ACCESSIBILITY_FEATURES}
              labels={ACCESSIBILITY_FEATURE_LABELS}
              values={draft.accessibility}
              onChange={(next) => set('accessibility', next)}
            />
          </div>

          <div>
            <p className="mb-2 text-xs font-medium text-ink-500">Facilities</p>
            <ChipGroup
              label="Facilities — venue must have all selected"
              options={FACILITIES}
              labels={FACILITY_LABELS}
              values={draft.facilities}
              onChange={(next) => set('facilities', next)}
            />
          </div>

          {formError ? <ErrorState message={formError} /> : null}

          <div className="flex items-center gap-3">
            <Button type="submit">Apply filters</Button>
            <button
              type="button"
              onClick={clear}
              className="text-sm text-ink-500 underline-offset-2 hover:text-ink-800 hover:underline"
            >
              Clear all
            </button>
          </div>
        </form>

        <section aria-label="Results" aria-busy={isFetching} className="self-start">
          {venues ? (
            <p className="mb-2 text-sm text-ink-500" aria-live="polite">
              {venues.length} venue{venues.length === 1 ? '' : 's'}
            </p>
          ) : null}

          <Card>
            {isPending ? <TableSkeleton /> : null}

            {isError ? (
              <div className="p-5">
                <ErrorState message={apiErrorMessage(error, 'Could not search venues.')} />
              </div>
            ) : null}

            {/* AC-6: an explained empty state with a way out, never a blank list. */}
            {venues && venues.length === 0 ? (
              <EmptyState
                title={filtering ? 'No venues match your filters' : 'No venues published yet'}
                description={
                  filtering ? 'Try removing a filter.' : 'Venues appear here once they are published.'
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
              <ul className={cn('divide-y divide-ink-100', isFetching && 'opacity-60')}>
                {venues.map((venue) => (
                  <VenueRow key={venue.id} venue={venue} applied={applied} />
                ))}
              </ul>
            ) : null}
          </Card>
        </section>
      </div>
    </>
  );
}

/** One result. Tags the venue matched on come first and are emphasised. */
function VenueRow({ venue, applied }: { venue: Venue; applied: VenueSearchFilters }) {
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
          <img src={venue.imageUrls[0]} alt="" className="size-11 rounded-md object-cover" />
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
                    tag.matched ? 'bg-brand-50 font-medium text-brand-800' : 'bg-ink-100 text-ink-600',
                  )}
                >
                  {tag.matched ? <span className="sr-only">Matches filter: </span> : null}
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
        <ChevronRight className="size-4 shrink-0 text-ink-300" aria-hidden="true" />
      </Link>
    </li>
  );
}
