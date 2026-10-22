/**
 * The capacity rule: a venue is over capacity when it holds fewer people than
 * are expected. Equal attendance and capacity fits. A venue with no recorded
 * capacity, or a request with no recorded attendance, cannot be compared, so
 * it is never reported as over capacity rather than guessed at.
 *
 * This is the one place the comparison lives. US-48's change request re-check
 * (capacityWarnings, as a warning), a booking request (BookingsService
 * .createRequest, as a hard block), a suggested alternative (attachSuggestions,
 * as a hard block) and the request detail page's warning all use it, so the
 * rule cannot drift between them.
 */
export function exceedsCapacity(
  capacity: number | null | undefined,
  attendance: number | null | undefined,
): boolean {
  return capacity != null && attendance != null && attendance > capacity;
}

export interface CapacityShortfall {
  venueName: string;
  capacity: number;
  attendance: number;
  /** e.g. "Alumni Lounge holds 90, but expected attendance is 499." */
  message: string;
}

/** The shortfall, explained, when `venue` cannot hold `attendance`; null when it fits. */
export function capacityShortfall(
  venue: { name: string | null; capacity: number | null | undefined },
  attendance: number | null | undefined,
): CapacityShortfall | null {
  if (!exceedsCapacity(venue.capacity, attendance)) return null;

  const venueName = venue.name ?? 'This venue';
  const capacity = venue.capacity as number;
  const expected = attendance as number;
  return {
    venueName,
    capacity,
    attendance: expected,
    message: `${venueName} holds ${capacity}, but expected attendance is ${expected}.`,
  };
}
