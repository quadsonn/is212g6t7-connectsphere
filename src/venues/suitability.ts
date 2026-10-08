import { AccessibilityFeature, Facility, RoomLayout } from '@prisma/client';

/**
 * US-20 — does a venue appear suitable for an event?
 *
 * Pure functions only, so every rule is unit-testable. Advisory by design
 * (AC-5): nothing here, or anything calling it, may block a booking request.
 */

/** The outcome of one check. */
export enum CheckStatus {
  /** The venue meets what the event recorded. */
  MET = 'MET',
  /** The venue falls short — flag it. */
  UNMET = 'UNMET',
  /** The event recorded nothing to check against (e.g. no accessibility needs). */
  NOT_REQUIRED = 'NOT_REQUIRED',
  /** The event has not recorded something it must (e.g. expected attendance). */
  NOT_RECORDED = 'NOT_RECORDED',
}

/**
 * AC-4 — three outcomes, not two, so "all good" never looks like "nothing
 * was checked": INCOMPLETE means a check could not run on the event's data.
 */
export enum OverallSuitability {
  SUITABLE = 'SUITABLE',
  NOT_SUITABLE = 'NOT_SUITABLE',
  INCOMPLETE = 'INCOMPLETE',
}

export interface RequirementFlag<T> {
  requirement: T;
  met: boolean;
}

/** A check this story cannot perform yet, and why — shown, never faked. */
export interface UncheckedRequirement {
  check: 'facilities' | 'equipment';
  reason: string;
}

export interface VenueSuitability {
  overall: OverallSuitability;
  /** True only when overall is SUITABLE. */
  overallSuitable: boolean;

  /** AC-1. */
  capacity: {
    status: CheckStatus;
    venueCapacity: number | null;
    expectedAttendance: number | null;
  };

  /** AC-2 — one flag per requirement the event recorded. */
  accessibility: {
    status: CheckStatus;
    items: RequirementFlag<AccessibilityFeature>[];
  };

  /**
   * Beyond the listed ACs: the event's preferred layout against the venue's
   * supported ones. Both use the shared RoomLayout enum, which US-13 shared
   * for exactly this comparison. AMBIGUOUS: confirm with the customer that
   * layout belongs in suitability.
   */
  layout: {
    status: CheckStatus;
    requirement: RoomLayout | null;
  };

  /**
   * AC-3 part 1 — NOT YET CHECKED. Always null; see `notChecked`.
   *
   * TODO(US-20 AC-3, after US-28 merges): EventRequest has no structured
   * facility requirements. US-28 (origin/sprint2-RAYE) records equipment as
   * EquipmentRequirement.equipmentType, which is free text, and US-18 removed
   * free-text matching on purpose. Once the event side has a controlled
   * vocabulary, compare it with venue.facilities here, one RequirementFlag per
   * requirement, exactly like `accessibility`.
   */
  facilities: RequirementFlag<Facility>[] | null;

  /**
   * AC-3 part 2 — NOT YET CHECKED. Always null; see `notChecked`.
   *
   * TODO(US-20 AC-3, after E6 lands): src/equipment/ is an empty module —
   * no service, no availability query. When it exists, read (never reserve)
   * the catalogue: for each EquipmentRequirement on the event, sum APPROVED
   * EquipmentReservations overlapping [proposedStart, proposedEnd] and compare
   * with Equipment.totalQuantity. Plug the result in here.
   */
  equipment: { item: string; available: boolean }[] | null;

  /** Checks that did not run, so the UI can say so instead of implying a pass. */
  notChecked: UncheckedRequirement[];
}

export interface SuitabilityVenue {
  capacity: number | null;
  accessibilityFeatures: AccessibilityFeature[];
  supportedLayouts: RoomLayout[];
}

export interface SuitabilityEvent {
  expectedAttendance: number | null;
  accessibilityRequirements: AccessibilityFeature[];
  preferredLayout: RoomLayout | null;
}

export const NOT_CHECKED: UncheckedRequirement[] = [
  {
    check: 'facilities',
    reason:
      'The event does not yet record facility requirements in a form that can be compared with the venue.',
  },
  {
    check: 'equipment',
    reason: 'Equipment availability checking is not available yet.',
  },
];

/**
 * AC-1. Equal attendance and capacity fits. A venue with no capacity is
 * UNMET, not a pass — a data gap must not read as "suitable".
 */
export function checkCapacity(venue: SuitabilityVenue, event: SuitabilityEvent) {
  const { capacity: venueCapacity } = venue;
  const { expectedAttendance } = event;

  let status: CheckStatus;
  if (venueCapacity === null) {
    status = CheckStatus.UNMET;
  } else if (expectedAttendance === null) {
    status = CheckStatus.NOT_RECORDED;
  } else {
    status = expectedAttendance <= venueCapacity ? CheckStatus.MET : CheckStatus.UNMET;
  }

  return { status, venueCapacity, expectedAttendance };
}

/** AC-2. One flag per recorded requirement, in the event's order. */
export function checkAccessibility(venue: SuitabilityVenue, event: SuitabilityEvent) {
  const items = event.accessibilityRequirements.map((requirement) => ({
    requirement,
    met: venue.accessibilityFeatures.includes(requirement),
  }));

  const status =
    items.length === 0
      ? CheckStatus.NOT_REQUIRED
      : items.every((item) => item.met)
        ? CheckStatus.MET
        : CheckStatus.UNMET;

  return { status, items };
}

export function checkLayout(venue: SuitabilityVenue, event: SuitabilityEvent) {
  const requirement = event.preferredLayout;

  const status =
    requirement === null
      ? CheckStatus.NOT_REQUIRED
      : venue.supportedLayouts.includes(requirement)
        ? CheckStatus.MET
        : CheckStatus.UNMET;

  return { status, requirement };
}

/** Any UNMET → not suitable; otherwise any NOT_RECORDED → incomplete. */
export function overallOf(statuses: CheckStatus[]): OverallSuitability {
  if (statuses.includes(CheckStatus.UNMET)) return OverallSuitability.NOT_SUITABLE;
  if (statuses.includes(CheckStatus.NOT_RECORDED)) return OverallSuitability.INCOMPLETE;
  return OverallSuitability.SUITABLE;
}

export function assessSuitability(
  venue: SuitabilityVenue,
  event: SuitabilityEvent,
): VenueSuitability {
  const capacity = checkCapacity(venue, event);
  const accessibility = checkAccessibility(venue, event);
  const layout = checkLayout(venue, event);
  const overall = overallOf([capacity.status, accessibility.status, layout.status]);

  return {
    overall,
    overallSuitable: overall === OverallSuitability.SUITABLE,
    capacity,
    accessibility,
    layout,
    facilities: null,
    equipment: null,
    notChecked: NOT_CHECKED,
  };
}
