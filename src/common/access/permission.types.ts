/**
 * US-02 — vocabulary for the permission matrix.
 *
 * Resources and actions are enumerated here so a typo becomes a compile error
 * rather than a silent grant. Later stories extend these enums and add rows to
 * PERMISSIONS; nothing else in the codebase should hard-code a role check.
 */

export enum Resource {
  EVENT = 'EVENT',
  VENUE = 'VENUE',
  BOOKING = 'BOOKING',
  EQUIPMENT = 'EQUIPMENT',
  RESERVATION = 'RESERVATION',
  REGISTRATION = 'REGISTRATION',
  NOTIFICATION = 'NOTIFICATION',
}

export enum Action {
  CREATE = 'CREATE',
  READ = 'READ',
  UPDATE = 'UPDATE',
  DELETE = 'DELETE',
  SUBMIT = 'SUBMIT',
  REVIEW = 'REVIEW',
  /** US-10: link a Coordinator to an event as its main point of contact. */
  ASSIGN = 'ASSIGN',
  /** US-09: take part in an event's clarification thread. */
  CLARIFY = 'CLARIFY',
  /** US-13: make a draft catalogue entry visible to everyone else. */
  PUBLISH = 'PUBLISH',
  /**
   * US-17: see whether a venue is free, tentatively held or booked on each
   * day. Separate from READ because it exposes booking state, and READ is
   * held by roles (Organiser) the story does not cover.
   */
  CHECK_AVAILABILITY = 'CHECK_AVAILABILITY',
  DECIDE = 'DECIDE',
  /** US-37: propose a change to an event that has already been submitted. */
  REQUEST_CHANGE = 'REQUEST_CHANGE',
  REGISTER = 'REGISTER',
  WITHDRAW = 'WITHDRAW',
}

/**
 * How far a grant reaches. This is the part role-only RBAC misses: CLAUDE.md
 * §6 requires the user's *relationship* to the record, not just their role.
 *
 * - ANY       — every record of that resource.
 * - OWN       — records the user created or belongs to (Organiser, Attendee).
 * - ASSIGNED  — records the user has been assigned to (Coordinator).
 * - PUBLIC    — every record, but projected down to non-internal fields.
 * - RELATED   — records the user's own work depends on (US-25 AC-3): for
 *               Venue Staff, events with a venue booking; for Technical
 *               Support, events with an equipment reservation or recorded
 *               equipment/technical requirements (US-28).
 */
export enum Scope {
  ANY = 'ANY',
  OWN = 'OWN',
  ASSIGNED = 'ASSIGNED',
  PUBLIC = 'PUBLIC',
  RELATED = 'RELATED',
}

export interface Grant {
  action: Action;
  scope: Scope;
}

/** One row of the matrix: what a single role may do to each resource. */
export type ResourceGrants = Partial<Record<Resource, readonly Grant[]>>;

export interface PermittedAction {
  resource: Resource;
  action: Action;
  scope: Scope;
}
