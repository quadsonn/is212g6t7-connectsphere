import { useState } from 'react';
import { ChevronRight, RotateCcw, Search } from 'lucide-react';
import { Link } from 'react-router-dom';

import { PageHeader } from '@/components/layout/app-shell';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { CheckboxGroup, Field } from '@/components/ui/form';
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
  ACCESSIBILITY_FEATURES,
  ACCESSIBILITY_FEATURE_LABELS,
  FACILITIES,
  FACILITY_LABELS,
  type Venue,
  type VenueSearchQuery,
} from '@/types/api';

/**
 * REAL data — GET /venues/search (US-18). Published venues only, decided by
 * the server. Each row leads to the venue's availability calendar (US-17).
 *
 * Filters are edited in a draft and applied with an explicit Search, so
 * ticking boxes or typing a capacity never fires a request by itself.
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
      <PageHeader
        title="Venues"
        description="Find a published venue that fits, then check its calendar before you request it."
      />

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
            placeholder="Search venues by name, e.g. auditorium"
            value={draft.name}
            onChange={(e) => set('name', e.target.value)}
            className="pl-9"
          />
        </div>
        <Button type="submit" form="venue-search-form">
          Search
        </Button>
      </div>

      <div className="grid gap-5 lg:grid-cols-[20rem_1fr]">
        <Card className="self-start">
          <CardHeader>
            <CardTitle>Filters</CardTitle>
          </CardHeader>
          <CardContent>
            <form
              id="venue-search-form"
              className="space-y-5"
              onSubmit={(e) => {
                e.preventDefault();
                runSearch(draft);
              }}
            >
              <fieldset className="space-y-3">
                <legend className="mb-1 text-sm font-medium text-ink-900">Available on</legend>
                <Field label="Date" htmlFor="search-date">
                  <Input
                    id="search-date"
                    type="date"
                    value={draft.date}
                    onChange={(e) => set('date', e.target.value)}
                  />
                </Field>
                <div className="grid grid-cols-2 gap-2">
                  <Field label="From" htmlFor="search-start">
                    <Input
                      id="search-start"
                      type="time"
                      value={draft.startTime}
                      onChange={(e) => set('startTime', e.target.value)}
                    />
                  </Field>
                  <Field label="To" htmlFor="search-end">
                    <Input
                      id="search-end"
                      type="time"
                      value={draft.endTime}
                      onChange={(e) => set('endTime', e.target.value)}
                    />
                  </Field>
                </div>
                <p className="text-xs text-ink-500">
                  Singapore time. Leave the times blank to search the whole day. Venues with a
                  pending request still appear.
                </p>
              </fieldset>

              <Field label="Minimum capacity" htmlFor="search-capacity">
                <Input
                  id="search-capacity"
                  type="number"
                  min={1}
                  inputMode="numeric"
                  value={draft.minCapacity}
                  onChange={(e) => set('minCapacity', e.target.value)}
                />
              </Field>

              <fieldset>
                <legend className="mb-1 text-sm font-medium text-ink-900">
                  Accessibility <span className="font-normal text-ink-500">(all of)</span>
                </legend>
                <CheckboxGroup
                  idPrefix="search-accessibility"
                  options={ACCESSIBILITY_FEATURES}
                  labels={ACCESSIBILITY_FEATURE_LABELS}
                  values={draft.accessibility}
                  onChange={(next) => set('accessibility', next)}
                />
              </fieldset>

              <fieldset>
                <legend className="mb-1 text-sm font-medium text-ink-900">
                  Facilities <span className="font-normal text-ink-500">(all of)</span>
                </legend>
                <CheckboxGroup
                  idPrefix="search-facility"
                  options={FACILITIES}
                  labels={FACILITY_LABELS}
                  values={draft.facilities}
                  onChange={(next) => set('facilities', next)}
                />
              </fieldset>

              {formError ? <ErrorState message={formError} /> : null}

              <div className="flex gap-2">
                <Button type="submit" className="flex-1">
                  <Search className="size-4" aria-hidden="true" />
                  Search
                </Button>
                <Button type="button" variant="secondary" onClick={clear}>
                  <RotateCcw className="size-4" aria-hidden="true" />
                  Clear
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>

        <Card className="self-start" aria-busy={isFetching}>
          <CardHeader>
            <CardTitle>
              {venues ? `${venues.length} venue${venues.length === 1 ? '' : 's'}` : 'Results'}
            </CardTitle>
          </CardHeader>

          {isPending ? <TableSkeleton /> : null}

          {isError ? (
            <CardContent>
              <ErrorState message={apiErrorMessage(error, 'Could not search venues.')} />
            </CardContent>
          ) : null}

          {/* AC-6: an explained empty state with a way out, never a blank list. */}
          {venues && venues.length === 0 ? (
            <EmptyState
              title={filtering ? 'No venues match your filters' : 'No venues published yet'}
              description={
                filtering
                  ? 'Try a different name, date or time, a lower capacity, or fewer accessibility and facility requirements.'
                  : 'Venues appear here once Venue Staff publish them.'
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
      </div>
    </>
  );
}

/** One result. Tags the venue matched on are emphasised, the rest muted. */
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

  return (
    <li>
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
          {tags.length > 0 ? (
            <span className="mt-1.5 flex flex-wrap gap-1">
              {tags.map((tag) => (
                <Badge
                  key={tag.key}
                  className={
                    tag.matched
                      ? 'bg-brand-50 text-brand-800 ring-brand-300'
                      : 'bg-ink-50 text-ink-600 ring-ink-200'
                  }
                  srPrefix={tag.matched ? 'Matches filter' : undefined}
                >
                  {tag.label}
                </Badge>
              ))}
            </span>
          ) : null}
        </div>
        <ChevronRight className="size-4 shrink-0 text-ink-400" aria-hidden="true" />
      </Link>
    </li>
  );
}
