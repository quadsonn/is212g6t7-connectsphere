import { AccessibilityFeature, RoomLayout } from '@prisma/client';

import {
  CheckStatus,
  checkAccessibility,
  checkCapacity,
  checkLayout,
} from '../venues/suitability';

/**
 * US-41 — which venues may be proposed in place of a rejected request's, and
 * in what order. Pure, so the rules are unit-tested without a database; the
 * "free for the slot" filter is a query (BookingSuggestionsService), since it
 * is the same overlap rule every other booking check uses.
 *
 * The capacity, accessibility and layout comparisons are US-20's suitability
 * checks, reused rather than restated.
 */

export interface AlternativeVenue {
  id: string;
  name: string | null;
  location: string | null;
  capacity: number | null;
  accessibilityFeatures: AccessibilityFeature[];
  supportedLayouts: RoomLayout[];
}

/** What the rejected request asked for (its US-21 snapshot). */
export interface AlternativeRequirements {
  expectedAttendance: number | null;
  accessibilityRequirements: AccessibilityFeature[];
  preferredLayout: RoomLayout | null;
}

export interface RankedAlternative {
  venueId: string;
  name: string | null;
  location: string | null;
  capacity: number | null;
  /** Seats left over once the expected attendance is seated; null if unknown. */
  spareCapacity: number | null;
  /** Whether the venue supports the requested layout (NOT_REQUIRED if none). */
  layout: CheckStatus;
}

/**
 * AC-2 — a candidate must meet the capacity and accessibility requirements.
 *
 * A request with no recorded attendance (pre-US-21 rows) has nothing to
 * compare capacity against, so capacity does not rule a venue out — the same
 * NOT_RECORDED reading US-20 gives it. A venue with no capacity recorded is
 * UNMET there, and so excluded here.
 */
export function meetsRequirements(
  venue: AlternativeVenue,
  requirements: AlternativeRequirements,
): boolean {
  const accessibility = checkAccessibility(venue, requirements).status;

  return fitsCapacity(venue, requirements) && accessibility !== CheckStatus.UNMET;
}

/**
 * Big enough to be offered at all — US-20's capacity check. Stricter than the
 * hard block (venues/capacity.ts) only for a venue with no capacity recorded:
 * it cannot be shown to hold the attendance, so it is not offered, though it
 * is not refused if chosen by id.
 */
export function fitsCapacity(
  venue: AlternativeVenue,
  requirements: AlternativeRequirements,
): boolean {
  return checkCapacity(venue, requirements).status !== CheckStatus.UNMET;
}

/** One venue Venue Staff may pick by hand (AC-3): free and big enough. */
export interface ManualAlternative {
  venueId: string;
  name: string | null;
  location: string | null;
  capacity: number | null;
}

/**
 * AC-3 — the venues Venue Staff may choose by hand, beyond the candidates:
 * free (the caller passes only free venues) and big enough, but missing some
 * other requirement such as accessibility. By name, for a dropdown.
 */
export function manualAlternatives(
  venues: readonly AlternativeVenue[],
  requirements: AlternativeRequirements,
  candidates: readonly RankedAlternative[],
): ManualAlternative[] {
  const proposed = new Set(candidates.map((c) => c.venueId));
  return venues
    .filter((venue) => !proposed.has(venue.id) && fitsCapacity(venue, requirements))
    .map((venue) => ({
      venueId: venue.id,
      name: venue.name,
      location: venue.location,
      capacity: venue.capacity,
    }))
    .sort(
      (a, b) => (a.name ?? '').localeCompare(b.name ?? '') || a.venueId.localeCompare(b.venueId),
    );
}

/**
 * AC-2 — the candidates, best match first.
 *
 * AMBIGUOUS: the AC asks for "ranked by how well they match" without a
 * formula. Every candidate already meets capacity and accessibility, so the
 * ranking uses what is left to compare:
 *   1. supports the requested layout (or none was requested) before not;
 *   2. the least spare capacity — the closest fit, leaving bigger rooms free;
 *   3. name, so the order is stable.
 */
export function rankAlternatives(
  venues: readonly AlternativeVenue[],
  requirements: AlternativeRequirements,
): RankedAlternative[] {
  return venues
    .filter((venue) => meetsRequirements(venue, requirements))
    .map((venue) => ({
      venueId: venue.id,
      name: venue.name,
      location: venue.location,
      capacity: venue.capacity,
      spareCapacity:
        venue.capacity !== null && requirements.expectedAttendance !== null
          ? venue.capacity - requirements.expectedAttendance
          : null,
      layout: checkLayout(venue, requirements).status,
    }))
    .sort(
      (a, b) =>
        layoutRank(a.layout) - layoutRank(b.layout) ||
        (a.spareCapacity ?? Number.MAX_SAFE_INTEGER) -
          (b.spareCapacity ?? Number.MAX_SAFE_INTEGER) ||
        (a.name ?? '').localeCompare(b.name ?? '') ||
        a.venueId.localeCompare(b.venueId),
    );
}

function layoutRank(status: CheckStatus): number {
  return status === CheckStatus.UNMET ? 1 : 0;
}
