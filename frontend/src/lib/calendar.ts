/**
 * Month and day helpers for the availability calendar (US-17).
 *
 * Everything is a plain "YYYY-MM" or "YYYY-MM-DD" string in Singapore time,
 * matching the API. Arithmetic is done in UTC on those strings, so the
 * browser's own timezone never shifts a day.
 */

import { APP_TIME_ZONE } from './date-time';

/** Today in Singapore, as "YYYY-MM-DD". en-CA formats dates in ISO order. */
export function todayInVenueTime(now = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: APP_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);
}

export function addMonths(month: string, delta: number): string {
  const [year, monthIndex] = month.split('-').map(Number);
  return new Date(Date.UTC(year, monthIndex - 1 + delta, 1)).toISOString().slice(0, 7);
}

export function daysInMonth(month: string): number {
  const [year, monthIndex] = month.split('-').map(Number);
  return new Date(Date.UTC(year, monthIndex, 0)).getUTCDate();
}

/** 0 for Monday … 6 for Sunday: weeks start on Monday, as in Singapore. */
export function weekdayOfFirst(month: string): number {
  const [year, monthIndex] = month.split('-').map(Number);
  return (new Date(Date.UTC(year, monthIndex - 1, 1)).getUTCDay() + 6) % 7;
}

const monthFormatter = new Intl.DateTimeFormat('en-GB', {
  month: 'long',
  year: 'numeric',
  timeZone: 'UTC',
});

const dayFormatter = new Intl.DateTimeFormat('en-GB', {
  weekday: 'long',
  day: 'numeric',
  month: 'long',
  timeZone: 'UTC',
});

export function formatMonth(month: string): string {
  return monthFormatter.format(new Date(`${month}-01T00:00:00Z`));
}

export function formatDay(day: string): string {
  return dayFormatter.format(new Date(`${day}T00:00:00Z`));
}

/** "YYYY-MM-DD" shifted by whole days, in UTC so no timezone can move it. */
export function addDays(day: string, delta: number): string {
  const date = new Date(`${day}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + delta);
  return date.toISOString().slice(0, 10);
}

/** 0 for Monday … 6 for Sunday, for any "YYYY-MM-DD". */
export function weekdayOf(day: string): number {
  return (new Date(`${day}T00:00:00Z`).getUTCDay() + 6) % 7;
}

const shortDayFormatter = new Intl.DateTimeFormat('en-GB', {
  weekday: 'short',
  day: 'numeric',
  month: 'short',
  year: 'numeric',
  timeZone: 'UTC',
});

/** "Mon 5 Oct 2026" — compact enough for a form field. */
export function formatShortDay(day: string): string {
  return shortDayFormatter.format(new Date(`${day}T00:00:00Z`));
}
