import type { AccessibilityFeature, Facility, VenueSearchQuery } from '@/types/api';

/** What the Coordinator has entered in the search form (US-18). */
export interface VenueSearchFilters {
  /** US-15 AC-3, restored after US-18: part of the venue name. */
  name: string;
  /** "YYYY-MM-DD", Singapore date. */
  date: string;
  /** "HH:MM", Singapore time. Both blank means the whole day. */
  startTime: string;
  endTime: string;
  minCapacity: string;
  accessibility: AccessibilityFeature[];
  facilities: Facility[];
}

export const EMPTY_FILTERS: VenueSearchFilters = {
  name: '',
  date: '',
  startTime: '',
  endTime: '',
  minCapacity: '',
  accessibility: [],
  facilities: [],
};

/** A Singapore wall-clock time as a UTC instant. Singapore has no DST. */
const sgtInstant = (date: string, time: string) => new Date(`${date}T${time}:00+08:00`);

/**
 * Turns the form into GET /venues/search parameters, or explains why it can't.
 *
 * A blank field adds no filter. A date with no times means the whole day; a
 * time without a date, or only one of the two times, is incomplete and
 * returned as an error rather than guessed at.
 */
export function toSearchQuery(
  filters: VenueSearchFilters,
): { query: VenueSearchQuery; error?: undefined } | { query?: undefined; error: string } {
  const query: VenueSearchQuery = {};
  const { date, startTime, endTime } = filters;

  if ((startTime || endTime) && !date) {
    return { error: 'Choose a date for the times you entered.' };
  }
  if (Boolean(startTime) !== Boolean(endTime)) {
    return { error: 'Enter both a start and an end time, or neither for the whole day.' };
  }

  if (date) {
    const from = sgtInstant(date, startTime || '00:00');
    const to = endTime
      ? sgtInstant(date, endTime)
      : new Date(sgtInstant(date, '00:00').getTime() + 24 * 60 * 60 * 1000);
    if (to <= from) {
      return { error: 'The end time must be after the start time.' };
    }
    query.from = from.toISOString();
    query.to = to.toISOString();
  }

  if (filters.name.trim()) query.name = filters.name.trim();

  if (filters.minCapacity.trim()) {
    const value = Number(filters.minCapacity);
    if (!Number.isInteger(value) || value < 1) {
      return { error: 'Minimum capacity must be a whole number above zero.' };
    }
    query.minCapacity = value;
  }

  // Comma-separated: axios would otherwise send "accessibility[]=…".
  if (filters.accessibility.length) query.accessibility = filters.accessibility.join(',');
  if (filters.facilities.length) query.facilities = filters.facilities.join(',');

  return { query };
}

export function hasActiveFilters(filters: VenueSearchFilters): boolean {
  return (
    Boolean(filters.name.trim() || filters.date || filters.startTime || filters.endTime || filters.minCapacity.trim()) ||
    filters.accessibility.length > 0 ||
    filters.facilities.length > 0
  );
}
