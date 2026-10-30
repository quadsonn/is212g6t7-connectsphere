import { ExecutionContext, ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Role } from '@prisma/client';

import { Action, Resource } from '../access/permission.types';
import { PERMISSION_KEY } from '../decorators/require-permission.decorator';
import { ROLES_KEY } from '../decorators/roles.decorator';
import { RolesGuard } from './roles.guard';

describe('RolesGuard (US-02)', () => {
  let reflector: { getAllAndOverride: jest.Mock };
  let guard: RolesGuard;

  const contextFor = (user: unknown): ExecutionContext =>
    ({
      getHandler: () => 'handler',
      getClass: () => 'class',
      switchToHttp: () => ({ getRequest: () => ({ user }) }),
    }) as unknown as ExecutionContext;

  const declare = (metadata: Record<string, unknown>) => {
    reflector.getAllAndOverride.mockImplementation(
      (key: string) => metadata[key],
    );
  };

  beforeEach(() => {
    reflector = { getAllAndOverride: jest.fn() };
    guard = new RolesGuard(reflector as unknown as Reflector);
  });

  // TC-S1-67 · US-02 AC-1 · unit: RolesGuard with Reflector stubbed · fails if a route that declares
  // nothing is allowed
  describe('AC-1: default-deny', () => {
    it('denies a route that declares no permission or roles', () => {
      declare({});
      expect(() =>
        guard.canActivate(contextFor({ userId: 'u1', role: Role.EVENT_ORGANISER })),
      ).toThrow(ForbiddenException);
    });

    it('denies a role with no grant for the declared permission', () => {
      declare({
        [PERMISSION_KEY]: { resource: Resource.BOOKING, action: Action.DECIDE },
      });
      expect(() =>
        guard.canActivate(contextFor({ userId: 'u1', role: Role.ATTENDEE })),
      ).toThrow(ForbiddenException);
    });

    it('denies a role absent from an explicit @Roles list', () => {
      declare({ [ROLES_KEY]: [Role.EVENT_COORDINATOR] });
      expect(() =>
        guard.canActivate(contextFor({ userId: 'u1', role: Role.ATTENDEE })),
      ).toThrow(ForbiddenException);
    });
  });

  // TC-S1-68 · US-02 AC-2 · unit · fails if a declared role or matrix permission is refused
  describe('AC-2: granted actions pass', () => {
    it('allows a role holding the declared permission', () => {
      declare({
        [PERMISSION_KEY]: { resource: Resource.EVENT, action: Action.CREATE },
      });
      expect(
        guard.canActivate(contextFor({ userId: 'u1', role: Role.EVENT_ORGANISER })),
      ).toBe(true);
    });

    it('allows a role named in @Roles', () => {
      declare({ [ROLES_KEY]: [Role.VENUE_STAFF, Role.EVENT_COORDINATOR] });
      expect(
        guard.canActivate(contextFor({ userId: 'u1', role: Role.VENUE_STAFF })),
      ).toBe(true);
    });

    it('prefers @RequirePermission when both are present', () => {
      declare({
        [PERMISSION_KEY]: { resource: Resource.EVENT, action: Action.REVIEW },
        [ROLES_KEY]: [Role.ATTENDEE],
      });
      expect(
        guard.canActivate(contextFor({ userId: 'u1', role: Role.EVENT_COORDINATOR })),
      ).toBe(true);
      expect(() =>
        guard.canActivate(contextFor({ userId: 'u2', role: Role.ATTENDEE })),
      ).toThrow(ForbiddenException);
    });
  });

  // TC-S1-74 · US-02 AC-8 · unit · fails if a request with no user is treated as forbidden (403)
  // rather than unauthenticated (401)
  describe('AC-8: unauthenticated requests', () => {
    it('rejects when no principal was established', () => {
      declare({
        [PERMISSION_KEY]: { resource: Resource.EVENT, action: Action.READ },
      });
      expect(() => guard.canActivate(contextFor(undefined))).toThrow(
        UnauthorizedException,
      );
    });

    it('rejects before evaluating permissions', () => {
      declare({});
      expect(() => guard.canActivate(contextFor(undefined))).toThrow(
        UnauthorizedException,
      );
    });
  });
});
