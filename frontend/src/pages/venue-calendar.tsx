import { ChevronLeft, ChevronRight, RefreshCw } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';

import { PageHeader } from '@/components/layout/app-shell';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { EmptyState, ErrorState, TableSkeleton } from '@/components/ui/states';
import {
  type CalendarFilters,
  type CalendarMode,
  NO_FILTERS,
  applyFilters,
  daysIn,
  facetCounts,
  rangeTitle,
  shiftAnchor,
  sortBookedFirst,
  visibleRange,
} from '@/features/calendar/calendar-utils';
import { HoldForm } from '@/features/bookings/components/hold-form';
import { BlockForm, EntryDetail } from '@/features/calendar/components/calendar-panels';
import {
  AgendaList,
  CalendarLegend,
  DayTimeline,
  FilterPanel,
  MonthGrid,
  Pagination,
  WeekGrid,
} from '@/features/calendar/components/calendar-views';
import { useCalendar } from '@/features/calendar/hooks/use-calendar';
import { apiErrorMessage } from '@/lib/api-client';
import { cn } from '@/lib/utils';
import type { CalendarEntry } from '@/types/api';

/** Venues per page in the week grid. */
const WEEK_PAGE_SIZE = 20;

const MODES: { value: CalendarMode; label: string }[] = [
  { value: 'day', label: 'Day' },
  { value: 'week', label: 'Week' },
  { value: 'month', label: 'Month' },
];

/** US-16 — the Venue Staff member's availability calendar. */
export function VenueCalendar() {
  const [mode, setMode] = useState<CalendarMode>('week');
  const [anchor, setAnchor] = useState(() => new Date());
  const [selected, setSelected] = useState<CalendarEntry | null>(null);
  const [blocking, setBlocking] = useState(false);
  // US-54: placing a tentative hold, from the same page as blocking time.
  const [holding, setHolding] = useState(false);
  const [filters, setFilters] = useState<CalendarFilters>(NO_FILTERS);
  const [filtersOpen, setFiltersOpen] = useState(true);
  const [weekPage, setWeekPage] = useState(1);
  const detailRef = useRef<HTMLDivElement>(null);

  const { from, to } = useMemo(() => visibleRange(mode, anchor), [mode, anchor]);
  // Always every venue the caller manages; the filter panel narrows on screen,
  // so its counts and the venue list stay complete.
  const query = useMemo(() => ({ from: from.toISOString(), to: to.toISOString() }), [from, to]);
  const { data, isPending, isError, error, refetch, isFetching, dataUpdatedAt } = useCalendar(query);

  const allVenues = data?.venues ?? [];
  const allEntries = data?.entries ?? [];
  const days = daysIn(from, to);
  const venueName = (id: string) => allVenues.find((v) => v.id === id)?.name ?? null;

  // AC-3 and the shop-style filters, applied to every view.
  const counts = facetCounts(allEntries);
  const { venues, entries, showAvailable } = applyFilters(allVenues, allEntries, days, filters);

  // Week grid pages. Sorted before slicing, so booked venues lead page 1.
  const weekVenues = sortBookedFirst(venues, entries);
  const pageCount = Math.max(1, Math.ceil(weekVenues.length / WEEK_PAGE_SIZE));
  const page = Math.min(weekPage, pageCount);
  const pageVenues = weekVenues.slice((page - 1) * WEEK_PAGE_SIZE, page * WEEK_PAGE_SIZE);

  // A selected entry that disappears on refresh (cancelled, rejected) is dropped.
  const selectedLive = selected ? (allEntries.find((e) => e.id === selected.id) ?? null) : null;

  // Clicking an entry anywhere — even low in a month grid — brings its
  // details into view rather than opening them off-screen.
  useEffect(() => {
    if (selected) detailRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }, [selected]);

  return (
    <>
      <PageHeader
        title="Availability calendar"
        description="Bookings and blocked-out time across the venues you manage."
        action={
          !blocking && !holding && allVenues.length > 0 ? (
            <div className="flex flex-wrap gap-2">
              <Button type="button" size="sm" variant="secondary" onClick={() => setHolding(true)}>
                Place hold
              </Button>
              <Button type="button" size="sm" onClick={() => setBlocking(true)}>
                Block out time
              </Button>
            </div>
          ) : undefined
        }
      />

      <div className="space-y-4">
        {blocking ? (
          <Card>
            <CardHeader>
              <CardTitle>Block out time</CardTitle>
            </CardHeader>
            <CardContent>
              <BlockForm venues={allVenues} onDone={() => setBlocking(false)} />
            </CardContent>
          </Card>
        ) : null}
        {holding ? (
          <Card>
            <CardHeader>
              <CardTitle>Place a tentative hold</CardTitle>
            </CardHeader>
            <CardContent>
              <HoldForm venues={allVenues} onDone={() => setHolding(false)} />
            </CardContent>
          </Card>
        ) : null}

        <div ref={detailRef} className="scroll-mt-24">
          {selectedLive ? (
            <EntryDetail
              entry={selectedLive}
              venueName={venueName(selectedLive.venueId)}
              onClose={() => setSelected(null)}
            />
          ) : null}
        </div>

        <Card aria-busy={isPending}>
          {/* AC-2 view switch, AC-3 venue filter, navigation, AC-5 refresh */}
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-ink-200 px-4 py-3">
            <div className="flex flex-wrap items-center gap-2">
              <div role="tablist" aria-label="Calendar view" className="flex gap-1 rounded-lg bg-ink-100 p-1">
                {MODES.map((m) => (
                  <button
                    key={m.value}
                    type="button"
                    role="tab"
                    aria-selected={mode === m.value}
                    onClick={() => setMode(m.value)}
                    className={cn(
                      'rounded-md px-3 py-1.5 text-sm font-medium transition-colors',
                      mode === m.value ? 'bg-white text-ink-900 shadow-sm' : 'text-ink-600 hover:text-ink-900',
                    )}
                  >
                    {m.label}
                  </button>
                ))}
              </div>
              <div className="flex items-center gap-1">
                <Button type="button" variant="ghost" size="sm" aria-label="Previous" onClick={() => {
                    setAnchor(shiftAnchor(mode, anchor, -1));
                    setWeekPage(1);
                  }}>
                  <ChevronLeft className="size-4" aria-hidden="true" />
                </Button>
                <Button type="button" variant="secondary" size="sm" onClick={() => {
                    setAnchor(new Date());
                    setWeekPage(1);
                  }}>
                  Today
                </Button>
                <Button type="button" variant="ghost" size="sm" aria-label="Next" onClick={() => {
                    setAnchor(shiftAnchor(mode, anchor, 1));
                    setWeekPage(1);
                  }}>
                  <ChevronRight className="size-4" aria-hidden="true" />
                </Button>
              </div>
              <h2 className="text-sm font-semibold text-ink-900" aria-live="polite">
                {rangeTitle(mode, anchor)}
              </h2>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <Button type="button" variant="ghost" size="sm" onClick={() => void refetch()} disabled={isFetching}>
                <RefreshCw className={cn('size-4', isFetching && 'animate-spin')} aria-hidden="true" />
                <span className="sr-only sm:not-sr-only">Refresh</span>
              </Button>
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-ink-100 px-4 py-2">
            <CalendarLegend />
            {dataUpdatedAt ? (
              <p className="text-xs text-ink-500">
                Updated {new Date(dataUpdatedAt).toLocaleTimeString('en-GB')} · refreshes automatically
              </p>
            ) : null}
          </div>

          {isPending ? <TableSkeleton /> : null}
          {isError ? (
            <div className="p-4">
              <ErrorState message={apiErrorMessage(error, 'Could not load the calendar.')} />
            </div>
          ) : null}

          {data && allVenues.length === 0 ? (
            <EmptyState
              title="No published venues"
              description="Venues you manage appear here once they are published in the venue catalogue."
            />
          ) : null}

          {data && allVenues.length > 0 ? (
            // Closed, the filter panel becomes a bar above the calendar, which takes the full width.
            <div className={cn(filtersOpen && 'lg:grid lg:grid-cols-[14rem_minmax(0,1fr)]')}>
              <FilterPanel
                filters={filters}
                counts={counts}
                venues={allVenues}
                open={filtersOpen}
                onOpenChange={setFiltersOpen}
                onChange={(next) => {
                  setFilters(next);
                  setWeekPage(1);
                }}
              />
              <div className="min-w-0">
                {mode === 'day' ? (
                  // An Apple-style timeline works at every width, so no list fallback.
                  // Colours are keyed to the full venue list so they don't shift as filters change.
                  <DayTimeline
                    day={from}
                    venues={allVenues}
                    entries={entries}
                    onSelect={setSelected}
                  />
                ) : (
                  <>
                    {/* AC-7: a list on phones, the grid from tablet width up. */}
                    <div className="md:hidden">
                      <AgendaList
                        days={days}
                        venues={venues}
                        entries={entries}
                        onSelect={setSelected}
                        showAvailable={showAvailable}
                      />
                    </div>
                    <div className="hidden md:block">
                      {mode === 'week' ? (
                        <>
                          <WeekGrid
                            days={days}
                            venues={pageVenues}
                            entries={entries}
                            onSelect={setSelected}
                            showAvailable={showAvailable}
                          />
                          <Pagination
                            page={page}
                            pageCount={pageCount}
                            pageSize={WEEK_PAGE_SIZE}
                            total={weekVenues.length}
                            onPage={setWeekPage}
                          />
                        </>
                      ) : (
                        <MonthGrid
                          from={from}
                          to={to}
                          month={anchor.getMonth()}
                          venues={venues}
                          entries={entries}
                          onSelect={setSelected}
                        />
                      )}
                    </div>
                  </>
                )}
              </div>
            </div>
          ) : null}
        </Card>
      </div>
    </>
  );
}
