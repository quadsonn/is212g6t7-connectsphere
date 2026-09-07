import { EventStatus } from '@prisma/client';

/**
 * The event lifecycle, as a map of status -> statuses reachable from it.
 *
 * This is the single definition of which status changes are legal. Later
 * stories (review, planning, cancellation) extend this table rather than
 * writing their own rules, and no code anywhere may set `status` without
 * going through EventsService.setStatus().
 *
 * AMBIGUOUS: the brief names the nine statuses (CLAUDE.md §5) but never says
 * how they connect. This map is inferred from the workflow in §1 and the
 * review actions in §7 (approve / reject / clarify). Every edge below is a
 * question for the customer; the debatable ones are called out individually.
 */
export const ALLOWED_TRANSITIONS: Readonly<Record<EventStatus, readonly EventStatus[]>> =
  Object.freeze({
    // An Organiser submits a draft, or abandons it.
    [EventStatus.DRAFT]: [EventStatus.SUBMITTED, EventStatus.CANCELLED],

    // A Coordinator picks the request up, or decides on it directly.
    [EventStatus.SUBMITTED]: [
      EventStatus.UNDER_REVIEW,
      EventStatus.APPROVED,
      EventStatus.REJECTED,
      EventStatus.CANCELLED,
    ],

    // AMBIGUOUS: UNDER_REVIEW -> DRAFT models "request clarification" — the
    // Coordinator hands the request back for the Organiser to amend and
    // resubmit. If clarification should instead be a status of its own, this
    // edge is the thing to change.
    [EventStatus.UNDER_REVIEW]: [
      EventStatus.APPROVED,
      EventStatus.REJECTED,
      EventStatus.DRAFT,
      EventStatus.CANCELLED,
    ],

    // Approved requests move into planning (venue and equipment booking).
    [EventStatus.APPROVED]: [EventStatus.PLANNING, EventStatus.CANCELLED],

    [EventStatus.PLANNING]: [EventStatus.CONFIRMED, EventStatus.CANCELLED],

    [EventStatus.CONFIRMED]: [EventStatus.COMPLETED, EventStatus.CANCELLED],

    // AMBIGUOUS: REJECTED -> DRAFT lets an Organiser revise and resubmit a
    // rejected request rather than re-keying it. If a rejection is meant to be
    // final, remove this edge and REJECTED becomes terminal.
    [EventStatus.REJECTED]: [EventStatus.DRAFT],

    // Terminal states.
    [EventStatus.COMPLETED]: [],
    [EventStatus.CANCELLED]: [],
  });

export function canTransition(from: EventStatus, to: EventStatus): boolean {
  return ALLOWED_TRANSITIONS[from].includes(to);
}

/** Statuses with no outgoing edges — nothing may change once here. */
export function isTerminal(status: EventStatus): boolean {
  return ALLOWED_TRANSITIONS[status].length === 0;
}
