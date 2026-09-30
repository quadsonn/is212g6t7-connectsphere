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
      expect(permissionScope(Role.VENUE_STAFF, Resource.REGISTRATION, Action.READ)).toBeNull();
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
          // US-25 AC-3, at RELATED scope only.
          Role.VENUE_STAFF,
          Role.TECHNICAL_SUPPORT_STAFF,
        ]),
      );
    });

    it('returns an empty list rather than every role when nobody is granted', () => {
      expect(rolesWithPermission(Resource.EVENT, Action.DELETE)).toEqual([]);
    });
  });

  describe('US-03 rows', () => {
    it('grants the Organiser CREATE and SUBMIT on their own events', () => {
      // US-02 already added these rows; US-03 needs no new ones. Asserted
      // explicitly so removing them breaks this story's tests, not just US-02's.
      expect(permissionScope(Role.EVENT_ORGANISER, Resource.EVENT, Action.CREATE)).toBe(Scope.OWN);
      expect(permissionScope(Role.EVENT_ORGANISER, Resource.EVENT, Action.SUBMIT)).toBe(Scope.OWN);
    });

    it('agrees with the hardcoded @Roles list on POST /events', () => {
      // The controller declares @Roles(EVENT_ORGANISER). If the matrix ever
      // grants EVENT/CREATE to another role, that literal becomes wrong — this
      // test is what catches the drift.
      expect(rolesWithPermission(Resource.EVENT, Action.CREATE)).toEqual([
        Role.EVENT_ORGANISER,
      ]);
    });

    it('does not let any other role create an event', () => {
      for (const role of ALL_ROLES.filter((r) => r !== Role.EVENT_ORGANISER)) {
        expect(isPermitted(role, Resource.EVENT, Action.CREATE)).toBe(false);
      }
    });
  });

  describe('US-04 rows', () => {
    it('grants the Organiser UPDATE on their own events', () => {
      // Editing a draft is EVENT/UPDATE at OWN scope — already present from
      // US-02, so US-04 adds no new rows. Asserted here so a change breaks
      // this story's tests too.
      expect(permissionScope(Role.EVENT_ORGANISER, Resource.EVENT, Action.UPDATE)).toBe(Scope.OWN);
    });

    it('agrees with the hardcoded @Roles list on the draft routes', () => {
      // PATCH /events/:id and POST /events/:id/submit both declare
      // @Roles(EVENT_ORGANISER).
      expect(rolesWithPermission(Resource.EVENT, Action.SUBMIT)).toEqual([
        Role.EVENT_ORGANISER,
      ]);
    });

    it('does not let a Coordinator edit or submit an event request', () => {
      expect(isPermitted(Role.EVENT_COORDINATOR, Resource.EVENT, Action.SUBMIT)).toBe(false);
      // A Coordinator may UPDATE assigned events (review outcomes), but never
      // at OWN scope — they cannot act as the Organiser.
      expect(permissionScope(Role.EVENT_COORDINATOR, Resource.EVENT, Action.UPDATE)).toBe(Scope.ASSIGNED);
    });

    it('does not let an Attendee touch drafts', () => {
      expect(isPermitted(Role.ATTENDEE, Resource.EVENT, Action.UPDATE)).toBe(false);
      expect(isPermitted(Role.ATTENDEE, Resource.EVENT, Action.SUBMIT)).toBe(false);
    });
  });

  describe('US-06 rows', () => {
    it('adds no new actions — layout and accessibility are part of CREATE/UPDATE', () => {
      // US-06 captures extra fields on an event request; it introduces no new
      // verb, so the matrix is unchanged. Asserted so that if a later story
      // does add a layout-specific action, this expectation forces the
      // decision to be explicit rather than incidental.
      expect(permissionScope(Role.EVENT_ORGANISER, Resource.EVENT, Action.CREATE)).toBe(Scope.OWN);
      expect(permissionScope(Role.EVENT_ORGANISER, Resource.EVENT, Action.UPDATE)).toBe(Scope.OWN);
    });

    it('lets a Coordinator read the preferences on assigned events', () => {
      // AC-6: visibility comes from the existing EVENT/READ grant at ASSIGNED
      // scope — no separate permission for the layout fields.
      expect(permissionScope(Role.EVENT_COORDINATOR, Resource.EVENT, Action.READ)).toBe(Scope.ASSIGNED);
    });

    it('keeps the Attendee on the public projection, which omits them', () => {
      expect(permissionScope(Role.ATTENDEE, Resource.EVENT, Action.READ)).toBe(Scope.PUBLIC);
    });
  });

  describe('US-05 rows', () => {
    it('covers viewing own requests with the existing READ grant at OWN scope', () => {
      // US-05 is read-only and introduces no new verb: GET /events/mine is
      // EVENT/READ scoped to OWN, which US-02 already granted.
      expect(permissionScope(Role.EVENT_ORGANISER, Resource.EVENT, Action.READ)).toBe(Scope.OWN);
    });

    it('agrees with the hardcoded @Roles list on the /events/mine routes', () => {
      // Both routes declare @Roles(EVENT_ORGANISER). Other roles hold EVENT
      // READ too, but never at OWN scope — so the literal is narrower than the
      // matrix here by design, and this asserts the intended difference.
      expect(
        rolesWithPermission(Resource.EVENT, Action.READ).filter(
          (role) => permissionScope(role, Resource.EVENT, Action.READ) === Scope.OWN,
        ),
      ).toEqual([Role.EVENT_ORGANISER]);
    });

    it('does not let another role read at OWN scope', () => {
      expect(permissionScope(Role.EVENT_COORDINATOR, Resource.EVENT, Action.READ)).toBe(Scope.ASSIGNED);
      expect(permissionScope(Role.ATTENDEE, Resource.EVENT, Action.READ)).toBe(Scope.PUBLIC);
      expect(permissionScope(Role.VENUE_STAFF, Resource.EVENT, Action.READ)).toBe(Scope.RELATED);
    });
  });

  describe('US-10 rows', () => {
    it('grants the Coordinator EVENT/ASSIGN at ANY scope', () => {
      // ANY, not ASSIGNED: AC-2 requires reassigning an event currently held
      // by a different Coordinator, which an ASSIGNED scope would hide.
      expect(permissionScope(Role.EVENT_COORDINATOR, Resource.EVENT, Action.ASSIGN)).toBe(Scope.ANY);
    });

    it('agrees with the hardcoded @Roles list on PATCH /events/:id/coordinator', () => {
      expect(rolesWithPermission(Resource.EVENT, Action.ASSIGN)).toEqual([
        Role.EVENT_COORDINATOR,
      ]);
    });

    it('lets no other role assign a Coordinator', () => {
      for (const role of ALL_ROLES.filter((r) => r !== Role.EVENT_COORDINATOR)) {
        expect(isPermitted(role, Resource.EVENT, Action.ASSIGN)).toBe(false);
      }
    });

    it('keeps ASSIGN wider than the Coordinator’s other event grants', () => {
      // The asymmetry is deliberate and worth pinning: a Coordinator may
      // assign any event but may only read/update/review assigned ones.
      expect(permissionScope(Role.EVENT_COORDINATOR, Resource.EVENT, Action.READ)).toBe(Scope.ASSIGNED);
      expect(permissionScope(Role.EVENT_COORDINATOR, Resource.EVENT, Action.UPDATE)).toBe(Scope.ASSIGNED);
      expect(permissionScope(Role.EVENT_COORDINATOR, Resource.EVENT, Action.REVIEW)).toBe(Scope.ASSIGNED);
    });
  });

  describe('US-12 rows', () => {
    it('covers the coordinator detail view with the existing READ grant', () => {
      // US-12 is read-only and adds no verb: GET /events/assigned[/:id] is
      // EVENT/READ at ASSIGNED scope, granted back in US-02.
      expect(permissionScope(Role.EVENT_COORDINATOR, Resource.EVENT, Action.READ)).toBe(Scope.ASSIGNED);
    });

    it('agrees with the hardcoded @Roles list on the /events/assigned routes', () => {
      // ASSIGNED scope is unique to the Coordinator, which is what makes
      // @Roles(EVENT_COORDINATOR) the correct literal on those routes.
      expect(
        rolesWithPermission(Resource.EVENT, Action.READ).filter(
          (role) =>
            permissionScope(role, Resource.EVENT, Action.READ) === Scope.ASSIGNED,
        ),
      ).toEqual([Role.EVENT_COORDINATOR]);
    });

    it('gives no other role sight of an assigned event’s full detail', () => {
      // US-25 AC-3 opened RELATED reads to staff; ASSIGNED stays Coordinator-only.
      expect(permissionScope(Role.VENUE_STAFF, Resource.EVENT, Action.READ)).toBe(Scope.RELATED);
      expect(permissionScope(Role.TECHNICAL_SUPPORT_STAFF, Resource.EVENT, Action.READ)).toBe(Scope.RELATED);
      expect(permissionScope(Role.ATTENDEE, Resource.EVENT, Action.READ)).toBe(Scope.PUBLIC);
    });
  });

  describe('US-07 rows', () => {
    it('covers approval with the existing REVIEW grant at ASSIGNED scope', () => {
      // US-07 adds no verb: approving is EVENT/REVIEW, granted in US-02. The
      // service narrows ASSIGNED further, to the coordinator actually linked
      // to the event — the matrix cannot express "assigned to me specifically
      // rather than the unassigned pool".
      expect(permissionScope(Role.EVENT_COORDINATOR, Resource.EVENT, Action.REVIEW)).toBe(Scope.ASSIGNED);
    });

    it('agrees with the hardcoded @Roles list on POST /events/:id/approve', () => {
      expect(rolesWithPermission(Resource.EVENT, Action.REVIEW)).toEqual([
        Role.EVENT_COORDINATOR,
      ]);
    });

    it('lets no other role review a request', () => {
      for (const role of ALL_ROLES.filter((r) => r !== Role.EVENT_COORDINATOR)) {
        expect(isPermitted(role, Resource.EVENT, Action.REVIEW)).toBe(false);
      }
    });

    it('keeps REVIEW narrower than ASSIGN', () => {
      // US-10 deliberately made assignment ANY-scope; reviewing stays bound to
      // the assignment relationship.
      expect(permissionScope(Role.EVENT_COORDINATOR, Resource.EVENT, Action.ASSIGN)).toBe(Scope.ANY);
      expect(permissionScope(Role.EVENT_COORDINATOR, Resource.EVENT, Action.REVIEW)).toBe(Scope.ASSIGNED);
    });
  });

  describe('US-08 rows', () => {
    it('covers reject and return with the existing REVIEW grant', () => {
      // Both are review decisions: EVENT/REVIEW at ASSIGNED, granted in US-02.
      // They are distinct *actions* in the service and distinct endpoints, but
      // they are not distinct permissions — a Coordinator who may review may
      // reach either outcome.
      expect(permissionScope(Role.EVENT_COORDINATOR, Resource.EVENT, Action.REVIEW)).toBe(Scope.ASSIGNED);
    });

    it('lets no other role reject or return a request', () => {
      for (const role of ALL_ROLES.filter((r) => r !== Role.EVENT_COORDINATOR)) {
        expect(isPermitted(role, Resource.EVENT, Action.REVIEW)).toBe(false);
      }
    });

    it('leaves the Organiser able to amend, but never to decide', () => {
      // A returned request becomes editable again, which is UPDATE at OWN —
      // not a review permission.
      expect(permissionScope(Role.EVENT_ORGANISER, Resource.EVENT, Action.UPDATE)).toBe(Scope.OWN);
      expect(isPermitted(Role.EVENT_ORGANISER, Resource.EVENT, Action.REVIEW)).toBe(false);
    });
  });

  describe('US-09 rows', () => {
    it('grants both parties CLARIFY, at their own scope', () => {
      // A new verb, unlike US-07/US-08: taking part in a clarification thread
      // is neither reviewing nor editing, and both roles need it from
      // opposite sides.
      expect(permissionScope(Role.EVENT_COORDINATOR, Resource.EVENT, Action.CLARIFY)).toBe(Scope.ASSIGNED);
      expect(permissionScope(Role.EVENT_ORGANISER, Resource.EVENT, Action.CLARIFY)).toBe(Scope.OWN);
    });

    it('is the only action both roles share on events', () => {
      const shared = (Object.values(Action) as Action[]).filter(
        (action) =>
          isPermitted(Role.EVENT_ORGANISER, Resource.EVENT, action) &&
          isPermitted(Role.EVENT_COORDINATOR, Resource.EVENT, action),
      );
      expect(shared).toEqual([Action.READ, Action.UPDATE, Action.CLARIFY]);
    });

    it('lets no uninvolved role join a clarification thread', () => {
      for (const role of [
        Role.ATTENDEE,
        Role.VENUE_STAFF,
        Role.TECHNICAL_SUPPORT_STAFF,
      ]) {
        expect(isPermitted(role, Resource.EVENT, Action.CLARIFY)).toBe(false);
      }
    });
  });

  describe('US-13 rows', () => {
    it('grants Venue Staff create, update and publish on their own venues', () => {
      expect(permissionScope(Role.VENUE_STAFF, Resource.VENUE, Action.CREATE)).toBe(Scope.OWN);
      expect(permissionScope(Role.VENUE_STAFF, Resource.VENUE, Action.UPDATE)).toBe(Scope.OWN);
      expect(permissionScope(Role.VENUE_STAFF, Resource.VENUE, Action.PUBLISH)).toBe(Scope.OWN);
    });

    it('agrees with the hardcoded @Roles list on the venue write routes', () => {
      for (const action of [Action.CREATE, Action.UPDATE, Action.PUBLISH]) {
        expect(rolesWithPermission(Resource.VENUE, action)).toEqual([Role.VENUE_STAFF]);
      }
    });

    it('leaves the catalogue readable by the roles that plan events', () => {
      // AC-4's draft rule is record-level and lives in VenuesService; the
      // matrix only says who may read venues at all.
      for (const role of [
        Role.VENUE_STAFF,
        Role.EVENT_COORDINATOR,
        Role.EVENT_ORGANISER,
      ]) {
        expect(permissionScope(role, Resource.VENUE, Action.READ)).toBe(Scope.ANY);
      }
    });

    it('gives an Attendee no sight of the venue catalogue', () => {
      expect(isPermitted(Role.ATTENDEE, Resource.VENUE, Action.READ)).toBe(false);
    });
  });

  describe('US-14 rows', () => {
    it('covers editing an existing venue with the US-13 UPDATE grant', () => {
      // US-14 adds no verb: editing a published venue is the same VENUE/UPDATE
      // at OWN scope that editing a draft is. What differs is the completeness
      // rule, which is a service concern, not a permission one.
      expect(permissionScope(Role.VENUE_STAFF, Resource.VENUE, Action.UPDATE)).toBe(Scope.OWN);
    });

    it('does not let a Coordinator or Organiser edit the catalogue', () => {
      for (const role of [Role.EVENT_COORDINATOR, Role.EVENT_ORGANISER]) {
        expect(isPermitted(role, Resource.VENUE, Action.UPDATE)).toBe(false);
        // ...though they may still read it.
        expect(isPermitted(role, Resource.VENUE, Action.READ)).toBe(true);
      }
    });
  });

  describe('US-15 rows', () => {
    it('covers browsing with the existing VENUE/READ grant', () => {
      // US-15 adds no verb. Draft exclusion is record-level and lives in
      // VenuesService.visibilityFilter, as it has since US-13.
      for (const role of [Role.VENUE_STAFF, Role.EVENT_COORDINATOR]) {
        expect(permissionScope(role, Resource.VENUE, Action.READ)).toBe(Scope.ANY);
      }
    });

    it('also admits Organisers, who were granted VENUE/READ in US-02', () => {
      // The story says "staff/coordinator roles per the permission matrix";
      // the matrix is wider than that phrase. Asserted so the difference is a
      // decision rather than an oversight — see the US-15 summary.
      expect(permissionScope(Role.EVENT_ORGANISER, Resource.VENUE, Action.READ)).toBe(Scope.ANY);
    });

    it('keeps the catalogue away from Attendees and Technical Support', () => {
      for (const role of [Role.ATTENDEE, Role.TECHNICAL_SUPPORT_STAFF]) {
        expect(isPermitted(role, Resource.VENUE, Action.READ)).toBe(false);
      }
    });
  });

  it('is frozen, so grants cannot be added at runtime', () => {
    expect(Object.isFrozen(PERMISSIONS)).toBe(true);
  });

  describe('US-25 rows', () => {
    it('lets Venue Staff and Technical Support read related events only', () => {
      for (const role of [Role.VENUE_STAFF, Role.TECHNICAL_SUPPORT_STAFF]) {
        expect(permissionScope(role, Resource.EVENT, Action.READ)).toBe(Scope.RELATED);
      }
    });

    it('gives them no other event verb', () => {
      for (const role of [Role.VENUE_STAFF, Role.TECHNICAL_SUPPORT_STAFF]) {
        for (const action of Object.values(Action).filter((a) => a !== Action.READ)) {
          expect(isPermitted(role, Resource.EVENT, action)).toBe(false);
        }
      }
    });

    it('covers the planning edit with the Coordinator’s existing UPDATE grant', () => {
      expect(rolesWithPermission(Resource.EVENT, Action.UPDATE)).toEqual([
        Role.EVENT_ORGANISER,
        Role.EVENT_COORDINATOR,
      ]);
      expect(permissionScope(Role.EVENT_COORDINATOR, Resource.EVENT, Action.UPDATE)).toBe(
        Scope.ASSIGNED,
      );
    });
  });
});
