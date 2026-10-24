import { EventStatus } from '@prisma/client';

/**
 * US-61 — the rules for assigning a Technical Support member to an event,
 * kept free of Nest and of database access so they are unit-tested directly
 * (CLAUDE.md §8).
 */

/** AC-4: shown on the assignment screen when nobody can be assigned. */
export const NO_TECH_SUPPORT_AVAILABLE_MESSAGE =
  'No Technical Support staff member is available for this date and time.';

/**
 * Statuses an event may be given a Technical Support member in, and the
 * statuses whose assignments count as commitments for the overlap check.
 *
 * Technical support needs are recorded during planning (US-27), so an event
 * reaches here from PLANNING onwards, and stays assignable until it ends. A
 * cancelled, rejected or completed event holds nobody, so its assignee is free
 * for that time again.
 */
export const TECH_SUPPORT_ASSIGNABLE_STATUSES: readonly EventStatus[] = [
  EventStatus.PLANNING,
  EventStatus.AWAITING_ARRANGEMENTS,
  EventStatus.AWAITING_SAFETY_CHECK,
  EventStatus.SAFETY_REJECTED,
  EventStatus.CONFIRMED,
];

/**
 * AC-1 "marked as requiring technical support": the Coordinator recorded
 * technical support needs (US-27 AC-2's on-site assistance, hybrid setup).
 * Blank text is no requirement at all.
 */
export function requiresTechnicalSupport(event: {
  technicalSupportNeeds: string | null;
}): boolean {
  return (event.technicalSupportNeeds?.trim() ?? '') !== '';
}

export interface TimeWindow {
  start: Date;
  end: Date;
}

/**
 * Half-open [start, end): an event ending at 12:00 does not clash with one
 * starting at 12:00, as for venue bookings (US-23).
 */
export function windowsOverlap(a: TimeWindow, b: TimeWindow): boolean {
  return a.start < b.end && b.start < a.end;
}

/** Another event a Technical Support member is already assigned to. */
export interface StaffAssignment {
  eventId: string;
  name: string | null;
  start: Date;
  end: Date;
}

/**
 * AC-2 — the member's other assignments that overlap the window. The event
 * being assigned is never its own conflict, so reassigning keeps working.
 * Callers pass only assignments in TECH_SUPPORT_ASSIGNABLE_STATUSES.
 */
export function conflictingAssignments(
  eventId: string,
  window: TimeWindow,
  assignments: readonly StaffAssignment[],
): StaffAssignment[] {
  return assignments.filter(
    (other) => other.eventId !== eventId && windowsOverlap(window, other),
  );
}
