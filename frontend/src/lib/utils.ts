import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** "EVENT_ORGANISER" -> "Event Organiser" */
export function humanise(value: string): string {
  return value
    .toLowerCase()
    .split('_')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

const dateFormatter = new Intl.DateTimeFormat('en-GB', {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
});

const timeFormatter = new Intl.DateTimeFormat('en-GB', {
  hour: '2-digit',
  minute: '2-digit',
});

export function formatDate(iso: string): string {
  return dateFormatter.format(new Date(iso));
}

/** A single moment, e.g. "3 Nov 2030, 14:05". */
export function formatDateTime(iso: string): string {
  const date = new Date(iso);
  return `${dateFormatter.format(date)}, ${timeFormatter.format(date)}`;
}

export function formatDateRange(
  startIso: string | null,
  endIso: string | null,
): string {
  // A draft may not have dates yet (US-04).
  if (!startIso || !endIso) return 'Dates not set';

  const start = new Date(startIso);
  const end = new Date(endIso);
  const sameDay = start.toDateString() === end.toDateString();

  return sameDay
    ? `${dateFormatter.format(start)}, ${timeFormatter.format(start)}–${timeFormatter.format(end)}`
    : `${dateFormatter.format(start)} – ${dateFormatter.format(end)}`;
}

export function initialsFrom(value: string): string {
  const parts = value.replace(/@.*$/, '').split(/[.\s_-]+/).filter(Boolean);
  return (parts[0]?.[0] ?? '?').concat(parts[1]?.[0] ?? '').toUpperCase();
}
