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
      ],
      [Resource.VENUE]: [g(Action.READ, Scope.ANY)],
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
        // US-10. Deliberately ANY, not ASSIGNED: AC-2 requires reassigning an
        // event away from the Coordinator who currently holds it, and an
        // ASSIGNED scope would hide a peer's event entirely.
        //
        // This means any Coordinator can take an event from any other. CLAUDE.md
        // §1 gives the role "assigns/coordinates events" and the brief defines
        // no manager or admin role, so this is the reading that invents least —
        // but see the US-10 summary: a Coordinator Manager is the likelier real
        // answer and needs a customer decision.
        g(Action.ASSIGN, Scope.ANY),
      ],
      [Resource.VENUE]: [g(Action.READ, Scope.ANY)],
      [Resource.BOOKING]: [
        g(Action.CREATE, Scope.ASSIGNED),
        g(Action.READ, Scope.ASSIGNED),
      ],
      [Resource.EQUIPMENT]: [g(Action.READ, Scope.ANY)],
      [Resource.RESERVATION]: [
        g(Action.CREATE, Scope.ASSIGNED),
        g(Action.READ, Scope.ASSIGNED),
      ],
      [Resource.NOTIFICATION]: [g(Action.READ, Scope.OWN)],
    },

    // "reviews and approves/rejects venue booking requests"
    [Role.VENUE_STAFF]: {
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
