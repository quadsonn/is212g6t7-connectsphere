import { Role } from '@prisma/client';

import {
  PERMISSIONS,
  isPermitted,
  permissionScope,
  permittedActionsFor,
  rolesWithPermission,
} from './permission-matrix';
import { Action, Resource, Scope } from './permission.types';

/** US-02 — the matrix itself. */
describe('Permission matrix (US-02)', () => {
  const ALL_ROLES = Object.values(Role);

  describe('AC-1: default-deny', () => {
    it('denies an action with no grant', () => {
      expect(permissionScope(Role.ATTENDEE, Resource.EVENT, Action.CREATE)).toBeNull();
      expect(isPermitted(Role.ATTENDEE, Resource.EVENT, Action.CREATE)).toBe(false);
    });

    it('denies a resource the role has no row for', () => {
      expect(permissionScope(Role.ATTENDEE, Resource.BOOKING, Action.READ)).toBeNull();
      expect(permissionScope(Role.VENUE_STAFF, Resource.EVENT, Action.READ)).toBeNull();
    });

    it('denies every action on a resource no role was granted', () => {
      for (const role of ALL_ROLES) {
        expect(isPermitted(role, Resource.EVENT, Action.DELETE)).toBe(false);
      }
    });

    it('denies rather than throwing for unknown combinations', () => {
      expect(() =>
        permissionScope(Role.VENUE_STAFF, Resource.REGISTRATION, Action.WITHDRAW),
      ).not.toThrow();
      expect(
        permissionScope(Role.VENUE_STAFF, Resource.REGISTRATION, Action.WITHDRAW),
      ).toBeNull();
    });

    it('grants nothing by default: every role has a bounded set', () => {
      for (const role of ALL_ROLES) {
        const granted = permittedActionsFor(role);
        const everyCombination =
          Object.values(Resource).length * Object.values(Action).length;
        expect(granted.length).toBeLessThan(everyCombination);
        expect(granted.length).toBeGreaterThan(0);
      }
    });
  });

  describe('AC-2: granted actions are permitted', () => {
    it('lets an Organiser create and submit their own events', () => {
      expect(permissionScope(Role.EVENT_ORGANISER, Resource.EVENT, Action.CREATE)).toBe(Scope.OWN);
      expect(permissionScope(Role.EVENT_ORGANISER, Resource.EVENT, Action.SUBMIT)).toBe(Scope.OWN);
    });

    it('lets a Coordinator review events assigned to them', () => {
      expect(permissionScope(Role.EVENT_COORDINATOR, Resource.EVENT, Action.REVIEW)).toBe(Scope.ASSIGNED);
    });

    it('lets Venue Staff decide bookings', () => {
      expect(permissionScope(Role.VENUE_STAFF, Resource.BOOKING, Action.DECIDE)).toBe(Scope.ANY);
    });

    it('lets Technical Support decide equipment reservations', () => {
      expect(permissionScope(Role.TECHNICAL_SUPPORT_STAFF, Resource.RESERVATION, Action.DECIDE)).toBe(Scope.ANY);
    });

    it('lets an Attendee register and withdraw', () => {
      expect(permissionScope(Role.ATTENDEE, Resource.REGISTRATION, Action.REGISTER)).toBe(Scope.OWN);
      expect(permissionScope(Role.ATTENDEE, Resource.REGISTRATION, Action.WITHDRAW)).toBe(Scope.OWN);
    });
  });

  describe('scopes encode the relationship, not just the role', () => {
    it('scopes an Organiser to their own events', () => {
      expect(permissionScope(Role.EVENT_ORGANISER, Resource.EVENT, Action.READ)).toBe(Scope.OWN);
    });

    it('scopes a Coordinator to assigned events', () => {
      expect(permissionScope(Role.EVENT_COORDINATOR, Resource.EVENT, Action.READ)).toBe(Scope.ASSIGNED);
    });

    it('scopes an Attendee to the public projection', () => {
      expect(permissionScope(Role.ATTENDEE, Resource.EVENT, Action.READ)).toBe(Scope.PUBLIC);
    });

    it('never grants an Organiser sight of another organiser via ANY', () => {
      const grants = PERMISSIONS[Role.EVENT_ORGANISER][Resource.EVENT] ?? [];
      expect(grants.every((grant) => grant.scope === Scope.OWN)).toBe(true);
    });
  });

  describe('AC-4: permittedActionsFor drives the UI from the same table', () => {
    it('lists an Attendee’s capabilities', () => {
      const actions = permittedActionsFor(Role.ATTENDEE);

      expect(actions).toContainEqual({
        resource: Resource.EVENT,
        action: Action.READ,
        scope: Scope.PUBLIC,
      });
      expect(actions).toContainEqual({
        resource: Resource.REGISTRATION,
        action: Action.REGISTER,
        scope: Scope.OWN,
      });
    });

    it('never reports an action the enforcement path would deny', () => {
      for (const role of ALL_ROLES) {
        for (const entry of permittedActionsFor(role)) {
          expect(isPermitted(role, entry.resource, entry.action)).toBe(true);
        }
      }
    });

    it('omits everything not granted', () => {
      const actions = permittedActionsFor(Role.ATTENDEE);
      expect(actions).not.toContainEqual(
        expect.objectContaining({ resource: Resource.BOOKING }),
      );
    });
  });

  describe('rolesWithPermission keeps @Roles() derived from the matrix', () => {
    it('finds the roles that may read events', () => {
      const roles = rolesWithPermission(Resource.EVENT, Action.READ);
      expect(roles).toEqual(
        expect.arrayContaining([
          Role.EVENT_ORGANISER,
          Role.EVENT_COORDINATOR,
          Role.ATTENDEE,
        ]),
      );
      expect(roles).not.toContain(Role.VENUE_STAFF);
    });

    it('returns an empty list rather than every role when nobody is granted', () => {
      expect(rolesWithPermission(Resource.EVENT, Action.DELETE)).toEqual([]);
    });
  });

  it('is frozen, so grants cannot be added at runtime', () => {
    expect(Object.isFrozen(PERMISSIONS)).toBe(true);
  });
});
