import { useEffect, useRef, useState } from 'react';

import { cn, formatDateRange } from '@/lib/utils';
import type { CalendarEntry, CalendarView } from '@/types/api';
import {
  AVAILABILITY_FACETS,
  AVAILABLE_CLASS,
  type CalendarFilters,
  ENTRY_STYLES,
  NO_FILTERS,
  daysIn,
  entriesOn,
  facetCounts,
  sameDay,
  sortBookedFirst,
  timeLabel,
  venueColour,
  venueLetter,
} from '../calendar-utils';

type Venue = CalendarView['venues'][number];
type Select = (entry: CalendarEntry) => void;

function entryTitle(entry: CalendarEntry): string {
  return (entry.kind === 'BLOCKED' ? entry.reason : entry.eventName) ?? 'Untitled';
}

/** One-line description for a native tooltip and screen readers. */
function entrySummary(entry: CalendarEntry, venueName?: string | null): string {
  return [
    ENTRY_STYLES[entry.kind].label,
    entryTitle(entry),
    venueName,
    `${timeLabel(entry.start)}–${timeLabel(entry.end)}`,
  ]
    .filter(Boolean)
    .join(' · ');
}

/** One clickable entry (AC-4). A real button, so it works by keyboard and tap. */
export function EntryChip({
  entry,
  onSelect,
  venueName,
  className,
  style,
}: {
  entry: CalendarEntry;
  onSelect: Select;
  venueName?: string | null;
  className?: string;
  style?: React.CSSProperties;
}) {
  const kind = ENTRY_STYLES[entry.kind];

  return (
    <button
      type="button"
      onClick={() => onSelect(entry)}
      title={entrySummary(entry, venueName)}
      style={{ ...kind.style, ...style }}
      className={cn(
        'block w-full truncate rounded-md px-2 py-1 text-left text-xs',
        'focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-brand-600',
        kind.className,
        className,
      )}
    >
      <span className="sr-only">{kind.label}: </span>
      <span className="font-medium">
        {timeLabel(entry.start)}–{timeLabel(entry.end)}
      </span>{' '}
      {entryTitle(entry)}
      {venueName ? <span className="opacity-75"> · {venueName}</span> : null}
    </button>
  );
}

function Available({ label = 'Available' }: { label?: string }) {
  return <p className={cn('rounded-md px-2 py-1 text-xs', AVAILABLE_CLASS)}>{label}</p>;
}

/**
 * Narrow screens (AC-7): the week and month views collapse to a day-by-day
 * list, which reads better than a grid squeezed to phone width.
 */
export function AgendaList({
  days,
  venues,
  entries,
  onSelect,
  showAvailable = true,
}: {
  days: Date[];
  venues: Venue[];
  entries: CalendarEntry[];
  onSelect: Select;
  showAvailable?: boolean;
}) {
  const venueName = (id: string) => venues.find((v) => v.id === id)?.name ?? null;

  return (
    <ol className="divide-y divide-ink-100">
      {days.map((day) => {
        const dayEntries = entriesOn(entries, day);
        return (
          <li key={day.toISOString()} className="space-y-1.5 px-4 py-3">
            <p className={cn('text-sm font-medium', sameDay(day, new Date()) ? 'text-brand-700' : 'text-ink-900')}>
              {day.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })}
            </p>
            {dayEntries.length === 0 ? (
              showAvailable ? (
                <Available label={venues.length > 1 ? 'All venues available' : 'Available'} />
              ) : (
                <p className="px-2 text-xs text-ink-400">Nothing matching the filters</p>
              )
            ) : (
              dayEntries.map((e) => (
                <EntryChip key={e.id} entry={e} onSelect={onSelect} venueName={venueName(e.venueId)} />
              ))
            )}
          </li>
        );
      })}
    </ol>
  );
}

// ---------------------------------------------------------------------------
// Day — an Apple Calendar-style timeline
// ---------------------------------------------------------------------------

const HOUR_PX = 48;
const MIN_ENTRY_PX = 22;
/** Where the timeline opens scrolled to, unless it is today (then: now). */
const FIRST_VISIBLE_HOUR = 7;

/**
 * Side-by-side lanes for overlapping entries in one column, as a calendar app
 * draws clashing events — two pending requests for the same slot both show.
 */
function layoutLanes(entries: CalendarEntry[]): { entry: CalendarEntry; lane: number; lanes: number }[] {
  const sorted = [...entries].sort((a, b) => +new Date(a.start) - +new Date(b.start));
  const laneEnds: number[] = [];
  const placed = sorted.map((entry) => {
    const start = +new Date(entry.start);
    let lane = laneEnds.findIndex((end) => end <= start);
    if (lane === -1) lane = laneEnds.length;
    laneEnds[lane] = +new Date(entry.end);
    return { entry, lane };
  });
  const lanes = Math.max(1, laneEnds.length);
  return placed.map((p) => ({ ...p, lanes }));
}

/** How each status reads in the day view, where fill colour means venue. */
const STATUS_BORDER: Record<CalendarEntry['kind'], string> = {
  TENTATIVE: 'border-dashed',
  CONFIRMED: 'border-solid',
  BLOCKED: 'border-solid',
};
const STATUS_WORD: Record<CalendarEntry['kind'], string> = {
  TENTATIVE: 'Pending',
  CONFIRMED: 'Confirmed',
  BLOCKED: 'Blocked',
};

/**
 * Day view, like Apple Calendar's: one timeline with hours down the left, and
 * every booking or block drawn in its time slot. Colour tells venues apart; the
 * border tells status apart (dashed = pending, solid = confirmed, striped =
 * blocked), so AC-1 still holds. Clashing entries sit side by side. A red line
 * marks the current time when viewing today.
 */
export function DayTimeline({
  day,
  venues,
  entries,
  onSelect,
}: {
  day: Date;
  venues: Venue[];
  entries: CalendarEntry[];
  onSelect: Select;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  // The red "now" line moves once a minute, like a calendar app's.
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(timer);
  }, []);

  const dayStart = new Date(day.getFullYear(), day.getMonth(), day.getDate()).getTime();
  const dayEnd = dayStart + 24 * 60 * 60 * 1000;
  const dayEntries = entries.filter((e) => +new Date(e.start) < dayEnd && +new Date(e.end) > dayStart);
  const isToday = sameDay(day, new Date());
  const nowOffset = ((now - dayStart) / 3_600_000) * HOUR_PX;

  // Colours follow the venue's place in the full list, so a venue keeps its
  // colour as filters change.
  const colourOf = (venueId: string) => venueColour(Math.max(0, venues.findIndex((v) => v.id === venueId)));
  const venueName = (venueId: string) => venues.find((v) => v.id === venueId)?.name ?? null;
  // Booked venues first in the key, matching the ordering elsewhere.
  const venuesToday = sortBookedFirst(
    venues.filter((v) => dayEntries.some((e) => e.venueId === v.id)),
    dayEntries,
  );

  // Open at the working day (or at "now" for today), as a calendar app does.
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTop = isToday ? Math.max(0, nowOffset - 2 * HOUR_PX) : FIRST_VISIBLE_HOUR * HOUR_PX;
    // Only on a change of day — not on every refresh, which would yank the
    // timeline back while someone is scrolling it.
  }, [dayStart]); // oxlint-disable-line react-hooks/exhaustive-deps

  const toPx = (ms: number) => ((ms - dayStart) / 3_600_000) * HOUR_PX;

  return (
    <div>
      {/* Which colour is which venue — only venues with something on today. */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 border-b border-ink-100 px-4 py-2 text-xs text-ink-700">
        {venuesToday.length === 0 ? (
          <span className="text-emerald-700">All venues available all day</span>
        ) : (
          venuesToday.map((v) => {
            const c = colourOf(v.id);
            return (
              <span key={v.id} className="flex items-center gap-1.5">
                <span className="inline-block size-3 rounded-sm border" style={{ background: c.fill, borderColor: c.border }} />
                {v.name}
              </span>
            );
          })
        )}
        <span className="ml-auto text-ink-500">Dashed = pending · Solid = confirmed · Striped = blocked</span>
      </div>

      <div ref={scrollRef} className="max-h-[36rem] overflow-y-auto">
        <div className="flex">
          <div className="relative w-14 shrink-0" style={{ height: 24 * HOUR_PX }}>
            {Array.from({ length: 24 }, (_, h) => (
              <span
                key={h}
                className="absolute right-2 -translate-y-1/2 text-[11px] text-ink-500"
                style={{ top: h * HOUR_PX }}
              >
                {h === 0 ? '' : `${String(h).padStart(2, '0')}:00`}
              </span>
            ))}
          </div>

          <div className="relative min-w-0 flex-1 border-l border-ink-200" style={{ height: 24 * HOUR_PX }}>
            {Array.from({ length: 24 }, (_, h) => (
              <div key={h} className="absolute inset-x-0 border-t border-ink-100" style={{ top: h * HOUR_PX }} />
            ))}

            {layoutLanes(dayEntries).map(({ entry, lane, lanes }) => {
              const top = toPx(Math.max(+new Date(entry.start), dayStart));
              const bottom = toPx(Math.min(+new Date(entry.end), dayEnd));
              const c = colourOf(entry.venueId);
              const name = venueName(entry.venueId);
              return (
                <button
                  key={entry.id}
                  type="button"
                  onClick={() => onSelect(entry)}
                  title={entrySummary(entry, name)}
                  className={cn(
                    'absolute overflow-hidden rounded-md border-2 border-l-[5px] px-2 py-1 text-left text-xs shadow-sm',
                    'focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-brand-600',
                    STATUS_BORDER[entry.kind],
                  )}
                  style={{
                    top,
                    height: Math.max(bottom - top, MIN_ENTRY_PX),
                    left: `calc(${(lane / lanes) * 100}% + 4px)`,
                    width: `calc(${100 / lanes}% - 8px)`,
                    background:
                      entry.kind === 'BLOCKED'
                        ? `repeating-linear-gradient(135deg, ${c.fill} 0 6px, white 6px 12px)`
                        : c.fill,
                    borderColor: c.border,
                    color: c.text,
                    opacity: entry.kind === 'TENTATIVE' ? 0.85 : 1,
                  }}
                >
                  <span className="block truncate font-semibold">{entryTitle(entry)}</span>
                  <span className="block truncate">
                    {name} · {timeLabel(entry.start)}–{timeLabel(entry.end)}
                  </span>
                  <span className="block truncate opacity-80">{STATUS_WORD[entry.kind]}</span>
                </button>
              );
            })}

            {isToday ? (
              <div className="pointer-events-none absolute inset-x-0 z-10" style={{ top: nowOffset }}>
                <div className="relative h-0.5 bg-red-500">
                  <span className="absolute -left-1.5 -top-1 size-2.5 rounded-full bg-red-500" />
                </div>
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Week
// ---------------------------------------------------------------------------

/** Week view: venues down the side (booked first), days across the top. */
export function WeekGrid({
  days,
  venues,
  entries,
  onSelect,
  showAvailable = true,
}: {
  days: Date[];
  venues: Venue[];
  entries: CalendarEntry[];
  onSelect: Select;
  showAvailable?: boolean;
}) {
  const ordered = sortBookedFirst(venues, entries);

  if (ordered.length === 0) {
    return <p className="px-4 py-10 text-center text-sm text-ink-500">No venues match these filters.</p>;
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[52rem] table-fixed border-collapse text-sm">
        <thead>
          <tr className="border-b border-ink-200 text-xs text-ink-500">
            <th scope="col" className="w-40 px-3 py-2 text-left font-medium">Venue</th>
            {days.map((d) => (
              <th
                key={d.toISOString()}
                scope="col"
                className={cn('px-2 py-2 text-left font-medium', sameDay(d, new Date()) && 'text-brand-700')}
              >
                {d.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric' })}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {ordered.map((venue) => (
            <tr key={venue.id} className="border-b border-ink-100 align-top">
              <th scope="row" className="truncate px-3 py-2 text-left font-medium text-ink-900">
                {venue.name}
              </th>
              {days.map((d) => {
                const cell = entriesOn(entries, d).filter((e) => e.venueId === venue.id);
                return (
                  <td key={d.toISOString()} className="space-y-1 border-l border-ink-100 p-1.5">
                    {cell.length === 0
                      ? showAvailable ? <Available /> : null
                      : cell.map((e) => <EntryChip key={e.id} entry={e} onSelect={onSelect} />)}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function FacetGroup<T extends string>({
  legend,
  options,
  selected,
  counts,
  onToggle,
  columns = 1,
}: {
  legend: string;
  options: { value: T; label: string }[];
  selected: Set<T>;
  counts: Record<string, number>;
  onToggle: (value: T) => void;
  columns?: number;
}) {
  return (
    <fieldset>
      <legend className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-500">{legend}</legend>
      <div className={cn('grid gap-0.5', columns > 1 && 'grid-cols-3 lg:grid-cols-2')}>
        {options.map((o) => {
          const id = `facet-${legend}-${o.value}`.replace(/\s+/g, '-');
          const count = counts[o.value] ?? 0;
          return (
            <label
              key={o.value}
              htmlFor={id}
              className={cn(
                'flex cursor-pointer items-center gap-2 rounded-md px-1.5 py-1 text-sm hover:bg-ink-50',
                count === 0 && !selected.has(o.value) && 'text-ink-400',
              )}
            >
              <input
                id={id}
                type="checkbox"
                checked={selected.has(o.value)}
                onChange={() => onToggle(o.value)}
                className="size-4 rounded border-ink-300 text-brand-600 focus:outline-2 focus:outline-offset-2 focus:outline-brand-600"
              />
              <span className="flex-1 truncate">{o.label}</span>
              <span className="text-xs text-ink-400">{count}</span>
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}

/**
 * The calendar's filter panel, in the style of a shop's: tick any number of
 * options in each group, with a count beside each one. Nothing ticked in a
 * group means "any". The Venue group is AC-3's single-venue filter.
 */
export function FilterPanel({
  filters,
  counts,
  letters,
  venues,
  onChange,
}: {
  filters: CalendarFilters;
  counts: ReturnType<typeof facetCounts>;
  letters: string[];
  venues: Venue[];
  onChange: (next: CalendarFilters) => void;
}) {
  const toggle = <T,>(set: Set<T>, value: T): Set<T> => {
    const next = new Set(set);
    if (next.has(value)) next.delete(value);
    else next.add(value);
    return next;
  };
  const active = filters.availability.size + filters.letters.size + filters.venues.size;
  // Ticking letters narrows the venue list, as picking a brand narrows sizes.
  const venueOptions = venues
    .filter((v) => filters.letters.size === 0 || filters.letters.has(venueLetter(v)))
    .map((v) => ({ value: v.id, label: v.name ?? 'Untitled venue' }));

  return (
    <aside aria-label="Filters" className="space-y-5 border-b border-ink-200 p-4 lg:border-r lg:border-b-0">
      <div className="flex items-center justify-between">
        <p className="text-sm font-semibold text-ink-900">Filters{active ? ` (${active})` : ''}</p>
        {active ? (
          <button
            type="button"
            className="text-xs font-medium text-brand-700 hover:underline"
            onClick={() => onChange(NO_FILTERS())}
          >
            Clear all
          </button>
        ) : null}
      </div>
      <div className="grid grid-cols-1 gap-5 sm:grid-cols-3 lg:grid-cols-1">
        <FacetGroup
          legend="Availability"
          options={AVAILABILITY_FACETS}
          selected={filters.availability}
          counts={counts.availability}
          onToggle={(v) => onChange({ ...filters, availability: toggle(filters.availability, v) })}
        />
        <FacetGroup
          legend="Venue starts with"
          options={letters.map((l) => ({ value: l, label: l }))}
          selected={filters.letters}
          counts={counts.letters}
          onToggle={(v) => onChange({ ...filters, letters: toggle(filters.letters, v) })}
          columns={2}
        />
        <div className="max-h-64 overflow-y-auto pr-1">
          <FacetGroup
            legend="Venue"
            options={venueOptions}
            selected={filters.venues}
            counts={counts.venues}
            onToggle={(v) => onChange({ ...filters, venues: toggle(filters.venues, v) })}
          />
        </div>
      </div>
    </aside>
  );
}

// ---------------------------------------------------------------------------
// Month
// ---------------------------------------------------------------------------

/**
 * A month-view entry: clickable for full details, and on hover (or keyboard
 * focus) shows a card with the venue, time and event without leaving the grid.
 */
function MonthEntry({
  entry,
  venueName,
  alignRight,
  onSelect,
}: {
  entry: CalendarEntry;
  venueName: string | null;
  alignRight: boolean;
  onSelect: Select;
}) {
  const kind = ENTRY_STYLES[entry.kind];
  return (
    <div className="group relative">
      <EntryChip entry={entry} onSelect={onSelect} venueName={venueName} className="cursor-pointer" />
      <div
        role="tooltip"
        className={cn(
          'pointer-events-none absolute top-full z-30 mt-1 hidden w-64 rounded-lg border border-ink-200 bg-white p-3 text-left text-xs shadow-lg',
          'group-hover:block group-focus-within:block',
          alignRight ? 'right-0' : 'left-0',
        )}
      >
        <div className="mb-1.5 flex items-center gap-1.5">
          <span className={cn('inline-block size-2.5 rounded-sm', kind.className)} style={kind.style} />
          <span className="font-medium text-ink-500">{kind.label}</span>
        </div>
        <p className="text-sm font-semibold text-ink-900">{entryTitle(entry)}</p>
        <dl className="mt-1.5 space-y-0.5 text-ink-700">
          <div><dt className="inline text-ink-500">Venue: </dt><dd className="inline">{venueName ?? '—'}</dd></div>
          <div><dt className="inline text-ink-500">Time: </dt><dd className="inline">{formatDateRange(entry.start, entry.end)}</dd></div>
          {entry.kind === 'BLOCKED' ? (
            <div><dt className="inline text-ink-500">Blocked by: </dt><dd className="inline">{entry.createdByName ?? '—'}</dd></div>
          ) : (
            <>
              <div><dt className="inline text-ink-500">Organiser: </dt><dd className="inline">{entry.organiserName ?? '—'}</dd></div>
              <div><dt className="inline text-ink-500">Attendance: </dt><dd className="inline">{entry.expectedAttendance ?? '—'}</dd></div>
            </>
          )}
        </dl>
        <p className="mt-2 text-[11px] text-ink-400">Click for full details</p>
      </div>
    </div>
  );
}

/** Month view: a classic grid; a quiet day is tinted available. */
export function MonthGrid({
  from,
  to,
  month,
  venues,
  entries,
  onSelect,
}: {
  from: Date;
  to: Date;
  month: number;
  venues: Venue[];
  entries: CalendarEntry[];
  onSelect: Select;
}) {
  const MAX_CHIPS = 3;
  const venueName = (id: string) => venues.find((v) => v.id === id)?.name ?? null;

  return (
    <div>
      <div className="grid grid-cols-7 border-b border-ink-200 text-xs font-medium text-ink-500">
        {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((d) => (
          <div key={d} className="px-2 py-2">{d}</div>
        ))}
      </div>
      <div className="grid grid-cols-7">
        {daysIn(from, to).map((d, index) => {
          // Booked entries first within a day, matching the venue ordering elsewhere.
          const dayEntries = entriesOn(entries, d).sort(
            (a, b) => Number(a.kind === 'BLOCKED') - Number(b.kind === 'BLOCKED') || +new Date(a.start) - +new Date(b.start),
          );
          const outside = d.getMonth() !== month;
          return (
            <div
              key={d.toISOString()}
              className={cn(
                'min-h-28 space-y-1 border-b border-r border-ink-100 p-1.5',
                dayEntries.length === 0 && !outside && AVAILABLE_CLASS,
                outside && 'bg-ink-50 text-ink-400',
              )}
            >
              <p className={cn('text-xs font-medium', sameDay(d, new Date()) && 'text-brand-700')}>
                {d.getDate()}
              </p>
              {dayEntries.slice(0, MAX_CHIPS).map((e) => (
                <MonthEntry
                  key={e.id}
                  entry={e}
                  venueName={venueName(e.venueId)}
                  alignRight={index % 7 >= 4}
                  onSelect={onSelect}
                />
              ))}
              {dayEntries.length > MAX_CHIPS ? (
                <p className="px-1 text-xs text-ink-500">+{dayEntries.length - MAX_CHIPS} more</p>
              ) : null}
            </div>
          );
        })}
      </div>
    </div>
  );
}

/** AC-1: the key to the colours, shown above every view. */
export function CalendarLegend() {
  return (
    <ul className="flex flex-wrap gap-3 text-xs text-ink-700">
      <li className="flex items-center gap-1.5">
        <span className={cn('inline-block size-3 rounded-sm border border-emerald-300', AVAILABLE_CLASS)} />
        Available
      </li>
      {(['TENTATIVE', 'CONFIRMED', 'BLOCKED'] as const).map((kind) => (
        <li key={kind} className="flex items-center gap-1.5">
          <span
            className={cn('inline-block size-3 rounded-sm', ENTRY_STYLES[kind].className)}
            style={ENTRY_STYLES[kind].style}
          />
          {ENTRY_STYLES[kind].label}
        </li>
      ))}
    </ul>
  );
}

/**
 * Page controls for the week grid: "Showing 21–40 of 64 venues", with
 * previous/next and numbered pages.
 */
export function Pagination({
  page,
  pageCount,
  pageSize,
  total,
  onPage,
}: {
  page: number;
  pageCount: number;
  pageSize: number;
  total: number;
  onPage: (page: number) => void;
}) {
  if (pageCount <= 1) return null;
  const first = (page - 1) * pageSize + 1;
  const last = Math.min(page * pageSize, total);

  return (
    <nav
      aria-label="Venue pages"
      className="flex flex-wrap items-center justify-between gap-3 border-t border-ink-200 px-4 py-3 text-sm"
    >
      <p className="text-ink-600">
        Showing {first}–{last} of {total} venues
      </p>
      <div className="flex flex-wrap items-center gap-1">
        <button
          type="button"
          disabled={page === 1}
          onClick={() => onPage(page - 1)}
          className="rounded-md px-2.5 py-1 text-ink-700 hover:bg-ink-100 disabled:opacity-40"
        >
          Previous
        </button>
        {Array.from({ length: pageCount }, (_, i) => i + 1).map((n) => (
          <button
            key={n}
            type="button"
            aria-current={n === page ? 'page' : undefined}
            onClick={() => onPage(n)}
            className={cn(
              'min-w-8 rounded-md px-2 py-1',
              n === page ? 'bg-brand-600 font-medium text-white' : 'text-ink-700 hover:bg-ink-100',
            )}
          >
            {n}
          </button>
        ))}
        <button
          type="button"
          disabled={page === pageCount}
          onClick={() => onPage(page + 1)}
          className="rounded-md px-2.5 py-1 text-ink-700 hover:bg-ink-100 disabled:opacity-40"
        >
          Next
        </button>
      </div>
    </nav>
  );
}
