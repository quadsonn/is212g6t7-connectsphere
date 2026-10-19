/**
 * The capacity rule, mirrored from the server (src/venues/capacity.ts) for the
 * page only: to explain a shortfall before submitting and to flag existing
 * requests. The server's check is the one that decides — it refuses anything
 * this lets through.
 *
 * Over capacity = both numbers known and attendance > capacity. Equal fits.
 */
export function exceedsCapacity(
  capacity: number | null | undefined,
  attendance: number | null | undefined,
): boolean {
  return capacity != null && attendance != null && attendance > capacity;
}

/** e.g. "Alumni Lounge holds 90, but expected attendance is 499."; null when it fits. */
export function capacityShortfallMessage(
  venue: { name: string | null; capacity: number | null },
  attendance: number | null | undefined,
): string | null {
  if (!exceedsCapacity(venue.capacity, attendance)) return null;
  return `${venue.name ?? 'This venue'} holds ${venue.capacity}, but expected attendance is ${attendance}.`;
}

/** Capacity AC-5 — e.g. "Over capacity: 499 attendees, venue holds 90"; null when it fits. */
export function overCapacityWarning(booking: {
  expectedAttendance: number | null;
  venue: { capacity: number | null };
}): string | null {
  if (!exceedsCapacity(booking.venue.capacity, booking.expectedAttendance)) return null;
  return `Over capacity: ${booking.expectedAttendance} attendees, venue holds ${booking.venue.capacity}`;
}

/** e.g. "Fits capacity: 80 attendees, venue holds 90"; null unless both are known and it fits. */
export function fitsCapacityMessage(booking: {
  expectedAttendance: number | null;
  venue: { capacity: number | null };
}): string | null {
  const { expectedAttendance } = booking;
  const { capacity } = booking.venue;
  if (capacity == null || expectedAttendance == null || expectedAttendance > capacity) return null;
  return `Fits capacity: ${expectedAttendance} attendees, venue holds ${capacity}`;
}

/** Capacity AC-4 — when no venue is free and big enough. */
export function noSuitableVenueMessage(attendance: number | null): string {
  return attendance != null
    ? `No available venue fits ${attendance} attendees for this date and time.`
    : 'No available venue for this date and time.';
}
