import { Role } from '@prisma/client';

import {
  Action,
  Grant,
  PermittedAction,
  Resource,
  ResourceGrants,
  Scope,
} from './permission.types';

/**
 * THE permission matrix — role × resource × action, and the single source of
 * truth for authorisation (CLAUDE.md §3.3).
 *
 * Rules for maintaining it:
 *  - DEFAULT-DENY. Anything absent is denied. Never add an "else allow".
 *  - Grants are derived from the role descriptions in CLAUDE.md §1 only.
 *    A capability the brief does not state is a gap to raise, not a row to add.
 *  - Extend this table when a story needs a new capability; do not write role
 *    checks anywhere else.
 */
const g = (action: Action, scope: Scope): Grant => ({ action, scope });

export const PERMISSIONS: Readonly<Record<Role, ResourceGrants>> = Object.freeze(
  {
    // "creates/submits event requests, requests changes, views their own events"
    [Role.EVENT_ORGANISER]: {
      [Resource.EVENT]: [
        g(Action.CREATE, Scope.OWN),
        g(Action.READ, Scope.OWN),
        g(Action.UPDATE, Scope.OWN),
        g(Action.SUBMIT, Scope.OWN),
        // US-09: answering a clarification on their own request.
        g(Action.CLARIFY, Scope.OWN),
        // US-37: "requests changes" — to their own events only.
        g(Action.REQUEST_CHANGE, Scope.OWN),
        // US-43: cancel their own event. Whether Coordinators may too is an
        // open question on the card, so only the Organiser holds it for now.
        g(Action.CANCEL, Scope.OWN),
      ],
      [Resource.VENUE]: [g(Action.READ, Scope.ANY)],
      // US-23 AC-5: "the decision and reason are visible to the relevant
      // Event Coordinator/Organiser" — bookings on the Organiser's own events.
      [Resource.BOOKING]: [g(Action.READ, Scope.OWN)],
      [Resource.NOTIFICATION]: [g(Action.READ, Scope.OWN)],
    },

    // "reviews requests, assigns/coordinates events, manages venues/equipment/
    //  bookings for events they own"
    [Role.EVENT_COORDINATOR]: {
      [Resource.EVENT]: [
        g(Action.READ, Scope.ASSIGNED),
        g(Action.UPDATE, Scope.ASSIGNED),
        g(Action.REVIEW, Scope.ASSIGNED),
        // US-09: asking a clarification on an assigned request.
        g(Action.CLARIFY, Scope.ASSIGNED),
      ],
      [Resource.VENUE]: [
        g(Action.READ, Scope.ANY),
        // US-17 (calendar) and US-18 (search by date). PUBLIC, not ANY: every
        // published venue, but only whether it is free — never which event
        // holds a slot. Both reveal booking state, so Organisers do not get it.
        g(Action.CHECK_AVAILABILITY, Scope.PUBLIC),
      ],
      [Resource.BOOKING]: [
        g(Action.CREATE, Scope.ASSIGNED),
        g(Action.READ, Scope.ASSIGNED),
      ],
      [Resource.EQUIPMENT]: [g(Action.READ, Scope.ANY)],
      [Resource.RESERVATION]: [
        g(Action.CREATE, Scope.ASSIGNED),
        g(Action.READ, Scope.ASSIGNED),
      ],
      // Requirement change 6: the outcome and reasons of a safety check on an
      // event they coordinate, and the means to answer it by sending the event
      // back for a new check (SUBMIT). Only the Safety Officer decides.
      [Resource.SAFETY_REVIEW]: [
        g(Action.READ, Scope.ASSIGNED),
        g(Action.SUBMIT, Scope.ASSIGNED),
      ],
      [Resource.NOTIFICATION]: [g(Action.READ, Scope.OWN)],
    },

    // "reviews and approves/rejects venue booking requests"
    [Role.VENUE_STAFF]: {
      // US-25 AC-3: Venue Staff see the latest information of events they
      // hold a booking for — the attendance, dates and layout their decision
      // rests on. RELATED, not ANY: an event with no booking is none of their
      // business, and US-02's default-deny still holds for it.
      [Resource.EVENT]: [g(Action.READ, Scope.RELATED)],
      [Resource.BOOKING]: [
        g(Action.READ, Scope.ANY),
        g(Action.DECIDE, Scope.ANY),
      ],
      [Resource.VENUE]: [
        // US-13. READ is ANY because a Venue Staff member browses the whole
        // published catalogue; the draft-visibility rule is a record-level
        // concern and lives in VenuesService, exactly as event ownership does.
        g(Action.READ, Scope.ANY),
        g(Action.CREATE, Scope.OWN),
        g(Action.UPDATE, Scope.OWN),
        // Separate from UPDATE: publishing exposes an entry to every other
        // role, so it is worth being able to grant it independently later.
        g(Action.PUBLISH, Scope.OWN),
      ],
      [Resource.NOTIFICATION]: [g(Action.READ, Scope.OWN)],
    },

    // "reviews equipment requests, checks availability, reserves equipment"
    [Role.TECHNICAL_SUPPORT_STAFF]: {
      // US-25 AC-3: as Venue Staff, for events with an equipment reservation.
      [Resource.EVENT]: [g(Action.READ, Scope.RELATED)],
      [Resource.EQUIPMENT]: [
        g(Action.READ, Scope.ANY),
        g(Action.UPDATE, Scope.ANY),
      ],
      [Resource.RESERVATION]: [
        // US-32: "reserves equipment" — committing a quantity to an event.
        g(Action.CREATE, Scope.ANY),
        g(Action.READ, Scope.ANY),
        g(Action.DECIDE, Scope.ANY),
      ],
      [Resource.NOTIFICATION]: [g(Action.READ, Scope.OWN)],
    },

    // "views permitted event info, registers/withdraws, sees their
    //  registration status"
    [Role.ATTENDEE]: {
      [Resource.EVENT]: [g(Action.READ, Scope.PUBLIC)],
      [Resource.REGISTRATION]: [
        g(Action.REGISTER, Scope.OWN),
        g(Action.READ, Scope.OWN),
        g(Action.WITHDRAW, Scope.OWN),
      ],
      [Resource.NOTIFICATION]: [g(Action.READ, Scope.OWN)],
    },

    // Requirement change 5 — "overseeing incoming event requests and
    // assigning them to individual Event Coordinators".
    //
    // Assigns queued requests and reassigns events (ASSIGN, ANY). Deliberately
    // no EVENT/READ: the queue and assignment views are projections built for
    // this role, so it does not get the generic event reads, which return the
    // full record.
    [Role.EVENT_COORDINATOR_LEAD]: {
      [Resource.EVENT]: [g(Action.ASSIGN, Scope.ANY)],
      [Resource.NOTIFICATION]: [g(Action.READ, Scope.OWN)],
    },

    // Requirement change 6 — "reviewing the operational safety of planned
    // events". Reads the queue and each review packet, and alone records a
    // decision. Deliberately no EVENT/READ: the queue and the packet are
    // projections built for this role, as for the Coordinator Lead, so it does
    // not get the generic event reads, which return the full record.
    [Role.SAFETY_OFFICER]: {
      [Resource.SAFETY_REVIEW]: [
        g(Action.READ, Scope.ANY),
        g(Action.DECIDE, Scope.ANY),
      ],
      [Resource.NOTIFICATION]: [g(Action.READ, Scope.OWN)],
    },
  },
);

/**
 * The only authorisation question the codebase should ask.
 *
 * Returns the scope of the grant, or null when there is none — callers must
 * treat null as denial (default-deny). A null return is not an error state; it
 * is the expected answer for most role/resource/action triples.
 */
export function permissionScope(
  role: Role,
  resource: Resource,
  action: Action,
): Scope | null {
  const grants = PERMISSIONS[role]?.[resource];
  if (!grants) {
    return null;
  }
  return grants.find((grant) => grant.action === action)?.scope ?? null;
}

/** Convenience boolean for call sites that do not care about the scope. */
export function isPermitted(
  role: Role,
  resource: Resource,
  action: Action,
): boolean {
  return permissionScope(role, resource, action) !== null;
}

/**
 * AC-4: everything a role may do, for a client to build menus and controls
 * from. Derived from the same table the server enforces, so the UI cannot
 * drift from the rules.
 */
export function permittedActionsFor(role: Role): PermittedAction[] {
  const grants = PERMISSIONS[role] ?? {};

  return Object.entries(grants).flatMap(([resource, resourceGrants]) =>
    (resourceGrants ?? []).map((grant) => ({
      resource: resource as Resource,
      action: grant.action,
      scope: grant.scope,
    })),
  );
}

/**
 * Which roles hold a given permission. Lets @Roles() be derived from the
 * matrix instead of hand-maintained alongside it.
 */
export function rolesWithPermission(
  resource: Resource,
  action: Action,
): Role[] {
  return (Object.keys(PERMISSIONS) as Role[]).filter((role) =>
    isPermitted(role, resource, action),
  );
}
