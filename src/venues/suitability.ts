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
   * AC-3 part 1 — one flag per facility the event requires
   * (EventRequest.requiredFacilities) against the venue's facilities. Both
   * use the Facility enum (US-18), so it is an exact comparison, exactly like
   * `accessibility`.
   */
  facilities: {
    status: CheckStatus;
    items: RequirementFlag<Facility>[];
  };

  /**
   * AC-3 part 2 — whether each equipment line the event asks for (US-28) has
   * enough free units over its dates (US-30's rules, read-only: nothing is
   * reserved). A free-text line not linked to the catalogue cannot be checked:
   * `available` is null and `notChecked` says so.
   *
   * AMBIGUOUS: not part of `overall`. Equipment comes from the shared
   * catalogue, not the venue, so it is the same answer at every venue and
   * cannot make one venue less suitable than another. It is reported beside
   * the verdict instead.
   */
  equipment: {
    status: CheckStatus;
    items: EquipmentFlag[];
  };

  /** Checks that did not run, so the UI can say so instead of implying a pass. */
  notChecked: UncheckedRequirement[];
}

export interface EquipmentFlag {
  item: string;
  requestedQuantity: number;
  /** Free units over the event's dates; null when the line could not be checked. */
  availableQuantity: number | null;
  /** Null when the line could not be checked. */
  available: boolean | null;
}

/** One equipment line with its free units already counted; null if uncountable. */
export interface EquipmentLine {
  item: string;
  requestedQuantity: number;
  availableQuantity: number | null;
}

export interface SuitabilityVenue {
  capacity: number | null;
  accessibilityFeatures: AccessibilityFeature[];
  supportedLayouts: RoomLayout[];
  facilities: Facility[];
}

export interface SuitabilityEvent {
  expectedAttendance: number | null;
  accessibilityRequirements: AccessibilityFeature[];
  preferredLayout: RoomLayout | null;
  requiredFacilities: Facility[];
}

/**
 * AC-1. Equal attendance and capacity fits. A venue with no capacity is
 * UNMET, not a pass — a data gap must not read as "suitable".
 */
export function checkCapacity(
  venue: Pick<SuitabilityVenue, 'capacity'>,
  event: Pick<SuitabilityEvent, 'expectedAttendance'>,
) {
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
export function checkAccessibility(
  venue: Pick<SuitabilityVenue, 'accessibilityFeatures'>,
  event: Pick<SuitabilityEvent, 'accessibilityRequirements'>,
) {
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

export function checkLayout(
  venue: Pick<SuitabilityVenue, 'supportedLayouts'>,
  event: Pick<SuitabilityEvent, 'preferredLayout'>,
) {
  const requirement = event.preferredLayout;

  const status =
    requirement === null
      ? CheckStatus.NOT_REQUIRED
      : venue.supportedLayouts.includes(requirement)
        ? CheckStatus.MET
        : CheckStatus.UNMET;

  return { status, requirement };
}

/** AC-3 part 1. One flag per required facility, in the event's order. */
export function checkFacilities(
  venue: Pick<SuitabilityVenue, 'facilities'>,
  event: Pick<SuitabilityEvent, 'requiredFacilities'>,
) {
  const items = event.requiredFacilities.map((requirement) => ({
    requirement,
    met: venue.facilities.includes(requirement),
  }));

  const status =
    items.length === 0
      ? CheckStatus.NOT_REQUIRED
      : items.every((item) => item.met)
        ? CheckStatus.MET
        : CheckStatus.UNMET;

  return { status, items };
}

/**
 * AC-3 part 2. Judged on the lines that could be counted: any short is
 * UNMET; if none could be counted, NOT_RECORDED rather than a pass.
 */
export function checkEquipment(lines: EquipmentLine[]) {
  const items: EquipmentFlag[] = lines.map((line) => ({
    ...line,
    available:
      line.availableQuantity === null ? null : line.availableQuantity >= line.requestedQuantity,
  }));
  const checked = items.filter((item) => item.available !== null);

  const status =
    items.length === 0
      ? CheckStatus.NOT_REQUIRED
      : checked.some((item) => !item.available)
        ? CheckStatus.UNMET
        : checked.length > 0
          ? CheckStatus.MET
          : CheckStatus.NOT_RECORDED;

  return { status, items };
}

/** Lines that could not be checked are named, never counted as a pass. */
function uncheckedEquipment(items: EquipmentFlag[]): UncheckedRequirement[] {
  const count = items.filter((item) => item.available === null).length;
  if (count === 0) return [];
  return [
    {
      check: 'equipment',
      reason:
        count === 1
          ? '1 equipment line is not linked to the catalogue, so its availability was not checked.'
          : `${count} equipment lines are not linked to the catalogue, so their availability was not checked.`,
    },
  ];
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
  equipmentLines: EquipmentLine[] = [],
): VenueSuitability {
  const capacity = checkCapacity(venue, event);
  const accessibility = checkAccessibility(venue, event);
  const layout = checkLayout(venue, event);
  const facilities = checkFacilities(venue, event);
  const equipment = checkEquipment(equipmentLines);
  // Equipment is left out on purpose; see VenueSuitability.equipment.
  const overall = overallOf([
    capacity.status,
    accessibility.status,
    layout.status,
    facilities.status,
  ]);

  return {
    overall,
    overallSuitable: overall === OverallSuitability.SUITABLE,
    capacity,
    accessibility,
    layout,
    facilities,
    equipment,
    notChecked: uncheckedEquipment(equipment.items),
  };
}
