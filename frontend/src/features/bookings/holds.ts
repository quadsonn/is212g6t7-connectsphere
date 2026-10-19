import type { VenueBooking } from '@/types/api';

/** US-54 — is this hold still holding its slot? Mirrors the server's isLiveHold. */
export function isLiveHold(booking: Pick<VenueBooking, 'status' | 'holdExpiresAt'>, now: Date = new Date()): boolean {
  return booking.status === 'HELD' && booking.holdExpiresAt !== null && new Date(booking.holdExpiresAt) > now;
}

export const END_BEFORE_START = 'The end must be after the start. Pick a later date or time.';

/**
 * US-54 AC-2 — what is wrong with the picked times, as messages. The server
 * applies the same rules; this only saves a round trip.
 */
export function holdProblems(
  {
    start,
    end,
    expiresAt,
    eventStart,
  }: { start: string; end: string; expiresAt: string; eventStart: string | null },
  now: Date = new Date(),
): string[] {
  const problems: string[] = [];
  if (start && end && new Date(end) <= new Date(start)) problems.push(END_BEFORE_START);
  if (!expiresAt) return problems;

  const expiry = new Date(expiresAt);
  if (expiry <= now) problems.push('The expiry must be in the future.');
  if (eventStart && expiry >= new Date(eventStart)) problems.push('The expiry must be before the event starts.');
  if (start && expiry >= new Date(start)) problems.push('The expiry must be before the held time starts.');
  return problems;
}
