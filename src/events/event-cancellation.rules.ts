import { EventStatus } from '@prisma/client';

/**
 * US-43 — when an Organiser may cancel an event.
 *
 * Pure functions over plain values, so the rule is unit-tested without Prisma
 * or Nest. The service does the loading and writing.
 */

/**
 * AC-1: "from submitted up to before the event starts". Drafts have not been
 * submitted; completed, cancelled and rejected events are over. Every status in
 * between is live, so it is derived from the enum as "everything except those
 * four" — a status added later is cancellable by default.
 *
 * AMBIGUOUS: this includes RETURNED, AWAITING_CLARIFICATION and SAFETY_REJECTED.
 * They are live requests the Organiser still owns, and the card excludes only
 * the four it names.
 */
const NOT_CANCELLABLE: readonly EventStatus[] = [
  EventStatus.DRAFT,
  EventStatus.REJECTED,
  EventStatus.COMPLETED,
  EventStatus.CANCELLED,
];

export const CANCELLABLE_STATUSES: readonly EventStatus[] = Object.values(
  EventStatus,
).filter((status) => !NOT_CANCELLABLE.includes(status));

export interface CancellationCheck {
  canCancel: boolean;
  /** Why not, for the client to show beside the disabled action. */
  reason: string | null;
}

/**
 * AC-1. An event with no start date cannot have started, so it stays
 * cancellable; one whose start has been reached (start <= now) cannot.
 */
export function evaluateCancellation(
  event: { status: EventStatus; proposedStart: Date | null },
  now: Date,
): CancellationCheck {
  if (!CANCELLABLE_STATUSES.includes(event.status)) {
    return {
      canCancel: false,
      reason: `a ${event.status.toLowerCase().replace(/_/g, ' ')} event cannot be cancelled`,
    };
  }

  if (event.proposedStart && event.proposedStart.getTime() <= now.getTime()) {
    return {
      canCancel: false,
      reason: 'an event that has already started cannot be cancelled',
    };
  }

  return { canCancel: true, reason: null };
}
