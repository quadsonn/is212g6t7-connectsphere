import { EventRequest, EventStatus } from '@prisma/client';

/**
 * US-11 — THE event state machine.
 *
 * Every rule derived from EventStatus lives here: which transitions are legal,
 * which statuses are visible to whom, which are editable, and how a status is
 * presented. Before this story those rules were spread across
 * event-status.transitions.ts, events.service.ts and access-control.service.ts,
 * and could drift apart.
 *
 * Rules for changing it:
 *  - A status change happens ONLY through EventsService.setStatus(), which is
 *    the sole writer of the status column. events-status-audit.spec.ts fails
 *    if any other code writes it.
 *  - Adding a status means adding a row to ALLOWED_TRANSITIONS; the table is
 *    exhaustive over EventStatus, so TypeScript flags the omission.
 */

// ---------------------------------------------------------------------------
// Transitions
// ---------------------------------------------------------------------------

/**
 * AMBIGUOUS: the brief names the statuses but never how they connect. Each
 * edge below traces to the story that introduced it; the debatable ones are
 * called out individually.
 */
export const ALLOWED_TRANSITIONS: Readonly<
  Record<EventStatus, readonly EventStatus[]>
> = Object.freeze({
  // US-03/US-04: an Organiser submits a draft, or abandons it.
  [EventStatus.DRAFT]: [EventStatus.SUBMITTED, EventStatus.CANCELLED],

  // US-07/US-08/US-09: the Coordinator picks it up, decides, asks, or returns.
  [EventStatus.SUBMITTED]: [
    EventStatus.UNDER_REVIEW,
    EventStatus.APPROVED,
    EventStatus.AWAITING_CLARIFICATION,
    EventStatus.RETURNED,
    EventStatus.REJECTED,
    EventStatus.CANCELLED,
  ],

  [EventStatus.UNDER_REVIEW]: [
    EventStatus.APPROVED,
    EventStatus.AWAITING_CLARIFICATION,
    EventStatus.RETURNED,
    EventStatus.REJECTED,
    EventStatus.CANCELLED,
  ],

  // US-09: answering puts it back on the Coordinator's desk.
  [EventStatus.AWAITING_CLARIFICATION]: [
    EventStatus.UNDER_REVIEW,
    EventStatus.RETURNED,
    EventStatus.REJECTED,
    EventStatus.CANCELLED,
  ],

  // US-08: the Organiser amends in place and resubmits.
  [EventStatus.RETURNED]: [EventStatus.SUBMITTED, EventStatus.CANCELLED],

  // Approved work moves into arrangement.
  [EventStatus.APPROVED]: [EventStatus.PLANNING, EventStatus.CANCELLED],

  // US-11: PLANNING may go straight to CONFIRMED when nothing needs booking,
  // or wait on venue/equipment decisions first.
  [EventStatus.PLANNING]: [
    EventStatus.AWAITING_ARRANGEMENTS,
    EventStatus.CONFIRMED,
    EventStatus.CANCELLED,
  ],

  // AMBIGUOUS: the edge back to PLANNING covers a booking being refused, which
  // sends the Coordinator back to find an alternative. E5/E6 will confirm.
  [EventStatus.AWAITING_ARRANGEMENTS]: [
    EventStatus.CONFIRMED,
    EventStatus.PLANNING,
    EventStatus.CANCELLED,
  ],

  [EventStatus.CONFIRMED]: [EventStatus.COMPLETED, EventStatus.CANCELLED],

  // AMBIGUOUS: a rejected request may be revised and resubmitted. If rejection
  // is meant to be final, remove this edge.
  [EventStatus.REJECTED]: [EventStatus.DRAFT],

  // Terminal.
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

// ---------------------------------------------------------------------------
// Status-derived rule sets
// ---------------------------------------------------------------------------

/**
 * US-04/US-08: statuses in which the Organiser may still edit the request.
 * Anything past submission is frozen until a Coordinator hands it back.
 */
export const EDITABLE_STATUSES: readonly EventStatus[] = [
  EventStatus.DRAFT,
  EventStatus.RETURNED,
];

/**
 * US-25 AC-1: "in planning" — approved, and still being arranged. The
 * Coordinator refines the event's information while in these statuses.
 *
 * AMBIGUOUS: CONFIRMED is excluded. Once everything is confirmed, altering the
 * event reads as a change request (E8), not a planning edit — see the US-25
 * summary.
 */
export const PLANNING_STATUSES: readonly EventStatus[] = [
  EventStatus.PLANNING,
  EventStatus.AWAITING_ARRANGEMENTS,
];

/**
 * Lead assignment story: a request is in the unassigned queue while it has no
 * Coordinator and has been submitted. Only the Lead can see it there; no
 * Coordinator can read, review or edit it (the ASSIGNED scope is
 * coordinatorId = the caller, so an unowned request matches nobody).
 */
export const UNASSIGNED_QUEUE_STATUSES: readonly EventStatus[] = [
  EventStatus.SUBMITTED,
];

/**
 * Lead supervision story: "active" means not completed, cancelled or rejected.
 * A draft is excluded as well — it is not yet a request and has no Coordinator.
 * Only active events show in the assignments view and can be reassigned.
 */
export const ACTIVE_ASSIGNMENT_STATUSES: readonly EventStatus[] = [
  EventStatus.SUBMITTED,
  EventStatus.UNDER_REVIEW,
  EventStatus.APPROVED,
  EventStatus.RETURNED,
  EventStatus.AWAITING_CLARIFICATION,
  EventStatus.PLANNING,
  EventStatus.AWAITING_ARRANGEMENTS,
  EventStatus.CONFIRMED,
];

/**
 * US-02 AC-7: statuses an Attendee may see at all. Everything earlier is
 * internal review traffic; rejected, returned and cancelled are not
 * registration-facing.
 */
export const ATTENDEE_VISIBLE_STATUSES: readonly EventStatus[] = [
  EventStatus.APPROVED,
  EventStatus.PLANNING,
  EventStatus.AWAITING_ARRANGEMENTS,
  EventStatus.CONFIRMED,
  EventStatus.COMPLETED,
];

/**
 * US-31 AC-4: statuses whose equipment requirements Technical Support may
 * view — every submitted request, i.e. everything except DRAFT.
 *
 * Derived from the enum rather than listed, so a status added later is
 * visible by default; only DRAFT is named as the exclusion.
 */
export const TECHNICAL_SUPPORT_VISIBLE_STATUSES: readonly EventStatus[] =
  Object.values(EventStatus).filter((status) => status !== EventStatus.DRAFT);

/**
 * US-32: statuses an event may have for equipment to be committed to it.
 *
 * AMBIGUOUS: the AC does not say. Excluded are a DRAFT (not submitted, and
 * invisible to Technical Support per US-31), a REJECTED request, and the two
 * terminal statuses — committing to a CANCELLED event would lock units US-33
 * exists to free, and a COMPLETED event is over.
 */
export const EQUIPMENT_COMMITTABLE_STATUSES: readonly EventStatus[] =
  TECHNICAL_SUPPORT_VISIBLE_STATUSES.filter(
    (status) =>
      status !== EventStatus.REJECTED &&
      status !== EventStatus.CANCELLED &&
      status !== EventStatus.COMPLETED,
  );

/**
 * US-11 AC-2: statuses that represent a Coordinator decision the Organiser is
 * owed an explanation for.
 */
export const DECIDED_STATUSES: readonly EventStatus[] = [
  EventStatus.REJECTED,
  EventStatus.RETURNED,
];

// ---------------------------------------------------------------------------
// The consolidated status view (US-11 AC-1, AC-2, AC-3)
// ---------------------------------------------------------------------------

export interface StatusDecision {
  outcome: EventStatus;
  reason: string | null;
}

export interface EventStatusView {
  /** AC-1: exactly one status, always. */
  status: EventStatus;
  isTerminal: boolean;
  /** AC-2: present only when the status represents a decision. */
  decision: StatusDecision | null;
  /** US-05/US-09: an outstanding question, if any. */
  clarificationRequested: boolean;
}

/**
 * The single place a status is turned into something displayable.
 *
 * AC-3 needs no machinery: the view is derived from the record on every read,
 * so whatever setStatus() last committed is what appears. Nothing is cached.
 *
 * AMBIGUOUS: a returned request's reason lives in clarificationRequest (US-08
 * stored it there so US-05 AC-3 could surface it as the thing to address),
 * while a rejection's lives in decisionReason. This function is what hides
 * that split from callers.
 */
export function buildStatusView(
  event: Pick<
    EventRequest,
    'status' | 'decisionReason' | 'clarificationRequest'
  >,
): EventStatusView {
  const decision = DECIDED_STATUSES.includes(event.status)
    ? {
        outcome: event.status,
        reason:
          event.status === EventStatus.RETURNED
            ? event.clarificationRequest
            : event.decisionReason,
      }
    : null;

  return {
    status: event.status,
    isTerminal: isTerminal(event.status),
    decision,
    clarificationRequested: event.clarificationRequest !== null,
  };
}
