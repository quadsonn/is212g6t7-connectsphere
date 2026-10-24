/**
 * Pure rules for the registration-window notices (US — notify attendees when
 * registration opens, closes or nears capacity). Kept apart from the service
 * so the capacity maths is unit-tested without a database.
 */

/** The seat margin at which an event counts as nearing capacity (the AC's 10). */
export const NEAR_CAPACITY_SEATS_REMAINING = 10;

/**
 * An event's capacity is its venue capacity: the total capacity of the venues
 * on its approved bookings. Venues whose capacity is unknown are left out;
 * null is returned when none is known, and then no near-capacity notice is
 * sent (the AC's "venue capacity is not known").
 */
export function venueCapacityOf(
  approvedVenueCapacities: readonly (number | null)[],
): number | null {
  const known = approvedVenueCapacities.filter(
    (capacity): capacity is number => capacity !== null,
  );
  if (known.length === 0) return null;
  return known.reduce((sum, capacity) => sum + capacity, 0);
}

/**
 * Whether an event is nearing capacity: it has a known venue capacity and 10
 * or fewer seats remain against it. A capacity reached exactly, or exceeded
 * (a venue shrank below the headcount), counts too.
 */
export function isNearCapacity(
  capacity: number | null,
  registeredCount: number,
): boolean {
  if (capacity === null) return false;
  return capacity - registeredCount <= NEAR_CAPACITY_SEATS_REMAINING;
}
