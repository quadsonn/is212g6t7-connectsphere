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
      EventStatus.AWAITING_CLARIFICATION,
      EventStatus.RETURNED,
      EventStatus.REJECTED,
      EventStatus.CANCELLED,
    ],

    // US-08 answered the question the old comment here raised: clarification
    // IS a status of its own. UNDER_REVIEW -> DRAFT has therefore been
    // removed — returning a request now produces RETURNED, which keeps a
    // handed-back request distinguishable from one never submitted.
    [EventStatus.UNDER_REVIEW]: [
      EventStatus.APPROVED,
      EventStatus.AWAITING_CLARIFICATION,
      EventStatus.RETURNED,
      EventStatus.REJECTED,
      EventStatus.CANCELLED,
    ],

    // US-09: answering returns the request to the Coordinator's desk. It does
    // not go straight to APPROVED — the answer is what the Coordinator now has
    // to review. The Coordinator may still return or reject without an answer,
    // e.g. if the Organiser never replies.
    [EventStatus.AWAITING_CLARIFICATION]: [
      EventStatus.UNDER_REVIEW,
      EventStatus.RETURNED,
      EventStatus.REJECTED,
      EventStatus.CANCELLED,
    ],

    // US-08: the Organiser amends in place and resubmits. No edge back to
    // DRAFT — a returned request is complete (it passed submission validation
    // once), so demoting it to DRAFT would lose that distinction for nothing.
    [EventStatus.RETURNED]: [EventStatus.SUBMITTED, EventStatus.CANCELLED],

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
