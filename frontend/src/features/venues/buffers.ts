import type { Venue } from '@/types/api';

/** Mirrors UpdateVenueBuffersDto on the server, which remains the real gate. */
export const MAX_BUFFER_MINUTES = 480;

/** US-49 AC-3 — the same rules as the server: required, whole, 0-480. */
export function bufferError(raw: string): string | null {
  const value = raw.trim();
  if (value === '') return 'A value is required.';
  if (!/^-?\d+(\.\d+)?$/.test(value)) return 'Enter a whole number of minutes.';
  const minutes = Number(value);
  if (!Number.isInteger(minutes)) return 'Enter a whole number of minutes.';
  if (minutes < 0 || minutes > MAX_BUFFER_MINUTES) {
    return `Must be between 0 and ${MAX_BUFFER_MINUTES} minutes.`;
  }
  return null;
}

/** "Setup: X min / Turnaround: Y min" — the read-only line (AC-5). */
export function bufferSummary(venue: Pick<Venue, 'setupMinutes' | 'turnaroundMinutes'>) {
  return `Setup: ${venue.setupMinutes} min / Turnaround: ${venue.turnaroundMinutes} min`;
}
