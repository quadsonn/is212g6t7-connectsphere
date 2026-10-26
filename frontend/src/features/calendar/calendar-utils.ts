import type { CalendarEntry, CalendarEntryKind } from '@/types/api';

export type CalendarMode = 'day' | 'week' | 'month';

const DAY_MS = 24 * 60 * 60 * 1000;

export function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

export function addDays(d: Date, n: number): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
}

/** Weeks start on Monday. */
export function startOfWeek(d: Date): Date {
  const day = startOfDay(d);
  return addDays(day, -((day.getDay() + 6) % 7));
}

export function sameDay(a: Date, b: Date): boolean {
  return a.toDateString() === b.toDateString();
}

/**
 * The window each view shows, in local time. A month view is padded to whole
 * weeks so the grid has no gaps — at most six weeks, which is the server's cap.
 */
export function visibleRange(mode: CalendarMode, anchor: Date): { from: Date; to: Date } {
  if (mode === 'day') {
    const from = startOfDay(anchor);
    return { from, to: addDays(from, 1) };
  }
  if (mode === 'week') {
    const from = startOfWeek(anchor);
    return { from, to: addDays(from, 7) };
  }
  const first = new Date(anchor.getFullYear(), anchor.getMonth(), 1);
  const last = new Date(anchor.getFullYear(), anchor.getMonth() + 1, 0);
  return { from: startOfWeek(first), to: addDays(startOfWeek(last), 7) };
}

/** Moves the anchor one view-length forward or back. */
export function shiftAnchor(mode: CalendarMode, anchor: Date, direction: 1 | -1): Date {
  if (mode === 'day') return addDays(anchor, direction);
  if (mode === 'week') return addDays(anchor, 7 * direction);
  return new Date(anchor.getFullYear(), anchor.getMonth() + direction, 1);
}

export function daysIn(from: Date, to: Date): Date[] {
  const days: Date[] = [];
  for (let d = from; d < to; d = addDays(d, 1)) days.push(d);
  return days;
}

/** Entries that touch a given local day. */
export function entriesOn(entries: CalendarEntry[], day: Date): CalendarEntry[] {
  const start = startOfDay(day).getTime();
  const end = start + DAY_MS;
  return entries.filter(
    (e) => new Date(e.start).getTime() < end && new Date(e.end).getTime() > start,
  );
}

export function rangeTitle(mode: CalendarMode, anchor: Date): string {
  if (mode === 'day') {
    return anchor.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  }
  if (mode === 'month') {
    return anchor.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });
  }
  const from = startOfWeek(anchor);
  const to = addDays(from, 6);
  const fmt = (d: Date) => d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
  return `${fmt(from)} – ${fmt(to)} ${to.getFullYear()}`;
}

export function timeLabel(iso: string): string {
  return new Date(iso).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
}

/** "9", "11:15" — 24-hour, no leading zero, minutes only when not on the hour. */
function compactTime(iso: string): string {
  const d = new Date(iso);
  const minutes = d.getMinutes();
  return minutes === 0 ? String(d.getHours()) : `${d.getHours()}:${String(minutes).padStart(2, '0')}`;
}

/** The week grid's short range, short enough never to be cut off: "9–10", "11:15–12:30". */
export function compactTimeRange(start: string, end: string): string {
  return `${compactTime(start)}–${compactTime(end)}`;
}

/**
 * AC-1 — the status vocabulary, defined once. Colour never carries the meaning
 * alone: each kind also has its own border style and label, so the calendar
 * still reads in greyscale (matching lib/status.ts).
 */
export const ENTRY_STYLES: Record<CalendarEntryKind, { label: string; className: string; style?: React.CSSProperties }> = {
  // US-54: a pending request, which does not block the slot.
  PENDING: {
    label: 'Pending',
    className: 'border border-dashed border-amber-500 bg-amber-50 text-amber-900',
  },
  // US-54: a live hold, which does — until it expires.
  TENTATIVE: {
    label: 'Tentative',
    className: 'border-2 border-dotted border-sky-600 bg-sky-50 text-sky-900',
  },
  CONFIRMED: {
    label: 'Confirmed',
    className: 'border border-emerald-600 bg-emerald-100 text-emerald-900',
  },
  BLOCKED: {
    label: 'Blocked',
    className: 'border border-ink-400 text-ink-800',
    // Diagonal stripes set blocks apart from bookings at a glance (AC-6).
    style: {
      backgroundImage:
        'repeating-linear-gradient(135deg, rgb(229 231 235) 0 6px, rgb(249 250 251) 6px 12px)',
    },
  },
};

/**
 * US-51 — a booking flagged "Conflict - needs review". Drawn as a red ring on
 * top of its tentative/confirmed style, and always spelled out in text too,
 * so the flag never depends on colour alone.
 */
export { NEEDS_REVIEW_LABEL } from '@/features/bookings/needs-review';
export const NEEDS_REVIEW_CLASS = 'ring-2 ring-red-500 ring-offset-1';

/** "Available" — the absence of an entry: a neutral, very faint fill. */
export const AVAILABLE_CLASS = 'bg-ink-50 text-ink-500';

// ---------------------------------------------------------------------------
// Venue ordering and week filters
// ---------------------------------------------------------------------------

type Venue = { id: string; name: string | null };

/** True when a venue has a pending or confirmed booking among these entries. */
function isBooked(venueId: string, entries: CalendarEntry[]): boolean {
  return entries.some((e) => e.venueId === venueId && e.kind !== 'BLOCKED');
}

/**
 * Booked venues first, so what needs attention is at the top; each group keeps
 * alphabetical order. "Booked" means a pending or confirmed booking in the
 * entries given — callers pass only the entries for the period on screen.
 */
export function sortBookedFirst<V extends Venue>(venues: V[], entries: CalendarEntry[]): V[] {
  return [...venues].sort((a, b) => {
    const booked = Number(isBooked(b.id, entries)) - Number(isBooked(a.id, entries));
    return booked !== 0 ? booked : (a.name ?? '').localeCompare(b.name ?? '');
  });
}

/** The availability facet: the three entry kinds, plus free time. */
export type AvailabilityFacet = CalendarEntryKind | 'AVAILABLE';

export const AVAILABILITY_FACETS: { value: AvailabilityFacet; label: string }[] = [
  { value: 'AVAILABLE', label: 'Available' },
  { value: 'PENDING', label: 'Pending' },
  { value: 'TENTATIVE', label: 'Tentative' },
  { value: 'CONFIRMED', label: 'Confirmed' },
  { value: 'BLOCKED', label: 'Blocked' },
];

/**
 * The calendar's filter panel, shop-style. Within a group, ticked options are
 * OR-ed; across groups they are AND-ed; an empty group means "any".
 *
 * AC-3 ("a single venue or all venues") is the Venue group: tick one venue,
 * or none for all of them. The search box narrows the venues too.
 */
export interface CalendarFilters {
  availability: Set<AvailabilityFacet>;
  search: string;
  venues: Set<string>;
}

export const NO_FILTERS = (): CalendarFilters => ({
  availability: new Set(),
  search: '',
  venues: new Set(),
});

/** True when a venue's name contains the search text, ignoring case. */
export function venueMatchesSearch(venue: Venue, search: string): boolean {
  const needle = search.trim().toLowerCase();
  return needle === '' || (venue.name ?? '').toLowerCase().includes(needle);
}

/** Venues that pass the search box and the venue group. */
export function venuesMatching<V extends Venue>(venues: V[], filters: CalendarFilters): V[] {
  return venues.filter(
    (v) => venueMatchesSearch(v, filters.search) && (filters.venues.size === 0 || filters.venues.has(v.id)),
  );
}

/**
 * Applies every filter group. A venue stays on screen only if something about
 * it matches — an entry of a ticked kind, or (with Available ticked) at least
 * one free day in the period shown.
 */
export function applyFilters<V extends Venue>(
  venues: V[],
  entries: CalendarEntry[],
  days: Date[],
  filters: CalendarFilters,
): { venues: V[]; entries: CalendarEntry[]; showAvailable: boolean } {
  const matching = venuesMatching(venues, filters);

  if (filters.availability.size === 0) {
    const ids = new Set(matching.map((v) => v.id));
    return { venues: matching, entries: entries.filter((e) => ids.has(e.venueId)), showAvailable: true };
  }

  const showAvailable = filters.availability.has('AVAILABLE');
  const kept = entries.filter((e) => filters.availability.has(e.kind));

  const shown = matching.filter((v) => {
    if (kept.some((e) => e.venueId === v.id)) return true;
    if (!showAvailable) return false;
    return days.some((d) => !entriesOn(entries, d).some((e) => e.venueId === v.id));
  });
  const ids = new Set(shown.map((v) => v.id));

  return { venues: shown, entries: kept.filter((e) => ids.has(e.venueId)), showAvailable };
}

/**
 * Counts shown beside each checkbox, like a shop's filter panel. Available has
 * no count: free time isn't a number of things, so any count would mislead.
 */
export function facetCounts(entries: CalendarEntry[]): {
  availability: Record<CalendarEntryKind, number>;
  venues: Record<string, number>;
} {
  const availability: Record<CalendarEntryKind, number> = {
    PENDING: 0,
    TENTATIVE: 0,
    CONFIRMED: 0,
    BLOCKED: 0,
  };
  const perVenue: Record<string, number> = {};
  for (const e of entries) {
    availability[e.kind] += 1;
    perVenue[e.venueId] = (perVenue[e.venueId] ?? 0) + 1;
  }
  return { availability, venues: perVenue };
}

/**
 * A distinct colour per venue for the day view, stable for a given venue list:
 * hues are spread by the golden angle so neighbours never look alike.
 */
export function venueColour(index: number): { fill: string; border: string; text: string } {
  const hue = Math.round((index * 137.508) % 360);
  return {
    fill: `hsl(${hue} 75% 92%)`,
    border: `hsl(${hue} 55% 42%)`,
    text: `hsl(${hue} 60% 22%)`,
  };
}

/** US-54 AC-4 — "expires 18 Oct, 14:30" for a hold; null for anything else. */
export function holdExpiryLabel(entry: Pick<CalendarEntry, 'kind' | 'holdExpiresAt'>): string | null {
  if (entry.kind !== 'TENTATIVE' || !entry.holdExpiresAt) return null;
  const at = new Date(entry.holdExpiresAt);
  return `expires ${at.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}, ${timeLabel(entry.holdExpiresAt)}`;
}
