import { EventStatus } from '@prisma/client';

/**
 * US-37 — the rules for an Organiser's change request.
 *
 * Pure functions over plain values, so they are unit-tested without Prisma or
 * Nest. The service does the loading and saving; what counts as a valid and
 * non-empty request is decided here.
 */

/**
 * AC "only available for submitted or confirmed events, not cancelled,
 * completed or rejected ones".
 *
 * AMBIGUOUS: the AC names two statuses and excludes three, leaving the stages
 * in between unsaid. Everything from SUBMITTED to CONFIRMED is allowed —
 * including RETURNED — on the team's reading that a request is changeable for
 * as long as it is live. DRAFT is out: it has not been submitted, and the
 * Organiser can simply edit it.
 */
export const CHANGEABLE_STATUSES: readonly EventStatus[] = [
  EventStatus.SUBMITTED,
  EventStatus.UNDER_REVIEW,
  EventStatus.APPROVED,
  EventStatus.RETURNED,
  EventStatus.AWAITING_CLARIFICATION,
  EventStatus.PLANNING,
  EventStatus.AWAITING_ARRANGEMENTS,
  // US-42: arrangements confirmed, waiting on the safety check.
  EventStatus.AWAITING_SAFETY_CHECK,
  EventStatus.SAFETY_REJECTED,
  EventStatus.CONFIRMED,
];

export function isChangeable(status: EventStatus): boolean {
  return CHANGEABLE_STATUSES.includes(status);
}

/** One line of an equipment list: a catalogue item and how many. */
export interface EquipmentLine {
  equipmentId: string;
  quantity: number;
}

/** The event values a proposal is compared against. */
export interface CurrentEventValues {
  proposedStart: Date | null;
  proposedEnd: Date | null;
  expectedAttendance: number | null;
  /** Only the catalogue-linked lines — see EquipmentRequirement.equipmentId. */
  equipment: readonly EquipmentLine[];
}

/** What the Organiser sent. A field left undefined is not being changed. */
export interface ProposedValues {
  proposedStart?: Date;
  proposedEnd?: Date;
  proposedAttendance?: number;
  equipment?: readonly EquipmentLine[];
}

export type ChangedField =
  | 'proposedStart'
  | 'proposedEnd'
  | 'proposedAttendance'
  | 'equipment';

export interface ChangeRequestEvaluation {
  /** Empty when the request is acceptable. One message per problem. */
  errors: string[];
  /**
   * The fields that genuinely differ from the event. These, and only these,
   * are stored on the request (everything else is saved as "unchanged").
   */
  changed: ChangedField[];
}

export const NO_DIFFERENCE_MESSAGE =
  'at least one field must differ from the event’s current value';

const sameInstant = (a: Date | null, b: Date) =>
  a !== null && a.getTime() === b.getTime();

/** Equipment lists are compared as sets of (item, quantity). */
export function sameEquipment(
  a: readonly EquipmentLine[],
  b: readonly EquipmentLine[],
): boolean {
  if (a.length !== b.length) return false;

  const quantities = new Map(a.map((line) => [line.equipmentId, line.quantity]));
  return b.every((line) => quantities.get(line.equipmentId) === line.quantity);
}

export function evaluateChangeRequest(
  current: CurrentEventValues,
  proposal: ProposedValues,
  now: Date,
): ChangeRequestEvaluation {
  const errors: string[] = [];
  const changed: ChangedField[] = [];

  const { proposedStart, proposedEnd, proposedAttendance, equipment } = proposal;

  if (proposedStart !== undefined) {
    if (proposedStart.getTime() <= now.getTime()) {
      errors.push('proposedStart must be in the future');
    }
    if (!sameInstant(current.proposedStart, proposedStart)) {
      changed.push('proposedStart');
    }
  }

  if (proposedEnd !== undefined) {
    if (proposedEnd.getTime() <= now.getTime()) {
      errors.push('proposedEnd must be in the future');
    }
    if (!sameInstant(current.proposedEnd, proposedEnd)) {
      changed.push('proposedEnd');
    }
  }

  // Judge the order on the dates the event would have if this were approved,
  // so moving only the start past the existing end is caught too.
  const effectiveStart = proposedStart ?? current.proposedStart;
  const effectiveEnd = proposedEnd ?? current.proposedEnd;
  if (
    (proposedStart !== undefined || proposedEnd !== undefined) &&
    effectiveStart &&
    effectiveEnd &&
    effectiveEnd.getTime() <= effectiveStart.getTime()
  ) {
    errors.push('proposedEnd must be later than proposedStart');
  }

  if (
    proposedAttendance !== undefined &&
    proposedAttendance !== current.expectedAttendance
  ) {
    changed.push('proposedAttendance');
  }

  if (equipment !== undefined) {
    const seen = new Set<string>();
    for (const line of equipment) {
      if (seen.has(line.equipmentId)) {
        errors.push(
          `equipment item ${line.equipmentId} is listed more than once; combine the quantities`,
        );
      }
      seen.add(line.equipmentId);
    }

    if (!sameEquipment(current.equipment, equipment)) {
      changed.push('equipment');
    }
  }

  if (errors.length === 0 && changed.length === 0) {
    errors.push(NO_DIFFERENCE_MESSAGE);
  }

  return { errors, changed };
}

/**
 * US-38 AC-4 — whether an approved request can still be applied.
 *
 * The request was valid when it was submitted; the event may have moved on
 * since (the date has passed, or a Coordinator edited the event's times). These
 * are checked again at approval so an approval can never leave the event with
 * a start in the past or an end before its start. The Coordinator's remedy is
 * to reject the request, with a reason.
 *
 * `current` is the event as it is now; `proposal` is what the request would set
 * (null = leave alone).
 */
export function applicabilityErrors(
  current: { proposedStart: Date | null; proposedEnd: Date | null },
  proposal: { proposedStart: Date | null; proposedEnd: Date | null },
  now: Date,
): string[] {
  const errors: string[] = [];

  if (proposal.proposedStart && proposal.proposedStart.getTime() <= now.getTime()) {
    errors.push('the proposed start is now in the past');
  }
  if (proposal.proposedEnd && proposal.proposedEnd.getTime() <= now.getTime()) {
    errors.push('the proposed end is now in the past');
  }

  const start = proposal.proposedStart ?? current.proposedStart;
  const end = proposal.proposedEnd ?? current.proposedEnd;
  if (
    (proposal.proposedStart || proposal.proposedEnd) &&
    start &&
    end &&
    end.getTime() <= start.getTime()
  ) {
    errors.push('the proposed end would not be after the start');
  }

  return errors;
}

/** US-38 AC-6 — a venue booking the proposed attendance would not fit in. */
export interface CapacityWarning {
  type: 'CAPACITY_EXCEEDED';
  bookingId: string;
  bookingStatus: string;
  venueId: string;
  venueName: string | null;
  capacity: number;
  proposedAttendance: number;
  message: string;
}

/**
 * US-38 AC-6 — warn for each live booking whose venue holds fewer people than
 * the request proposes. A venue with no recorded capacity cannot be compared,
 * so it produces no warning rather than a guess. Only the proposed attendance
 * is checked: a request that does not change attendance raises no capacity
 * question.
 */
export function capacityWarnings(
  proposedAttendance: number | null,
  bookings: readonly {
    id: string;
    status: string;
    venue: { id: string; name: string | null; capacity: number | null };
  }[],
): CapacityWarning[] {
  if (proposedAttendance === null) return [];

  return bookings.flatMap((booking) => {
    const { capacity } = booking.venue;
    if (capacity === null || proposedAttendance <= capacity) return [];

    const venue = booking.venue.name ?? 'the booked venue';
    return [
      {
        type: 'CAPACITY_EXCEEDED' as const,
        bookingId: booking.id,
        bookingStatus: booking.status,
        venueId: booking.venue.id,
        venueName: booking.venue.name,
        capacity,
        proposedAttendance,
        message: `The proposed attendance of ${proposedAttendance} exceeds the capacity of ${venue} (${capacity}).`,
      },
    ];
  });
}
