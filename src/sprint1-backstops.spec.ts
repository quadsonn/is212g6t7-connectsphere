import { ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { ROUTE_ARGS_METADATA } from '@nestjs/common/constants';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { EventStatus, NotificationType, Role } from '@prisma/client';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';

import { AuthService } from './auth/auth.service';
import { AuthenticatedUser, JwtStrategy } from './auth/jwt.strategy';
import { BookingsService } from './bookings/bookings.service';
import { AccessControlService } from './common/access/access-control.service';
import { Scope } from './common/access/permission.types';
import { CurrentUser } from './common/decorators/current-user.decorator';
import { UnauthorizedFilter } from './common/filters/unauthorized.filter';
import { IsAfterField } from './common/validators/is-after.validator';
import { EquipmentReservationsService } from './equipment/equipment-reservations.service';
import { EventsService } from './events/events.service';
import { NotificationsService } from './notifications/notifications.service';
import { PrismaService } from './prisma/prisma.service';

// Lets one test hand assertReadyForSubmission errors without `constraints`;
// every other call validates for real.
let mockValidationErrors: unknown[] | null = null;
jest.mock('class-validator', () => {
  const actual = jest.requireActual('class-validator');
  return {
    ...actual,
    validate: (...args: unknown[]) => mockValidationErrors ?? actual.validate(...args),
  };
});

/**
 * Sprint 1 (US-01 to US-09) — the branches the running app cannot reach,
 * forced here so each still behaves as meant if its guarantee is lost:
 *  - configuration fallbacks (no JWT_EXPIRES_IN, JWT_SECRET or lockout
 *    overrides): every environment sets them;
 *  - a token with no `exp`: JwtModule always signs with expiresIn;
 *  - a 401 with a plain-string body, @CurrentUser('field'), IsAfterField's
 *    default message, and a RELATED role with no event rule: nothing in the
 *    codebase produces them;
 *  - an event with no name, a decision with no reason, a draft saved
 *    unchanged and a validation error without constraints: submission
 *    requires a name, both decisions require a reason, and the candidate DTO
 *    is flat.
 * Everything reachable is proven against the test database in test/auth,
 * events-* and status-view e2e specs.
 */
describe('Sprint 1 backstops', () => {
  const config = (values: Record<string, string | undefined> = {}) =>
    ({ get: (key: string) => values[key] }) as unknown as ConfigService;

  describe('AuthService (US-01)', () => {
    const build = (values: Record<string, string | undefined> = {}) => {
      const prisma = { revokedToken: { upsert: jest.fn().mockResolvedValue({}) } };
      const service = new AuthService(prisma as unknown as PrismaService, {} as JwtService, config(values));
      return { prisma, service };
    };
    const revokedUntil = async (values: Record<string, string | undefined>) => {
      const { prisma, service } = build(values);
      const before = Date.now();
      await service.logout({ sub: 'USR-001', role: Role.EVENT_ORGANISER, jti: 'jti-1' });
      return prisma.revokedToken.upsert.mock.calls[0][0].create.expiresAt.getTime() - before;
    };

    // TC-S1-59 · US-01 AC-4 · setup: none (unit) · fails if a token without an expiry is not revoked for the configured lifetime
    // Code: AuthService.logout (no exp) -> tokenLifetimeMs (JWT_EXPIRES_IN, default 1h, unreadable -> 1h)
    it('revokes a token with no expiry for the configured token lifetime', async () => {
      const minute = 60_000;
      expect(Math.round((await revokedUntil({ JWT_EXPIRES_IN: '30m' })) / minute)).toBe(30);
      expect(Math.round((await revokedUntil({})) / minute)).toBe(60);
      expect(Math.round((await revokedUntil({ JWT_EXPIRES_IN: 'forever' })) / minute)).toBe(60);
    });

    // TC-S1-60 · US-01 AC-5 · setup: none (unit) · fails if a valid lockout override is ignored, or an invalid one replaces the default
    // Code: AuthService.numberFrom
    it('takes a positive lockout setting from the environment, and falls back otherwise', () => {
      expect(build({ LOGIN_MAX_FAILED_ATTEMPTS: '5' }).service['numberFrom']('LOGIN_MAX_FAILED_ATTEMPTS', 15)).toBe(5);
      expect(build({ LOGIN_MAX_FAILED_ATTEMPTS: '-3' }).service['numberFrom']('LOGIN_MAX_FAILED_ATTEMPTS', 15)).toBe(15);
    });
  });

  // TC-S1-57 · US-01 AC-3 · setup: none (unit) · fails if the server starts with no signing secret
  // Code: JwtStrategy constructor (JWT_SECRET ?? '')
  it('JwtStrategy refuses to start without a JWT secret', () => {
    expect(() => new JwtStrategy(config(), {} as AuthService)).toThrow('JwtStrategy requires a secret or key');
  });

  // TC-S1-57 · US-01 AC-3 · setup: none (unit) · fails if @CurrentUser('field') does not return that field of the signed-in user
  // Code: CurrentUser (data key)
  it('@CurrentUser(field) returns one field of the signed-in user', () => {
    class Handler {
      run(@CurrentUser('role') _role: string) {}
    }
    const [arg] = Object.values(Reflect.getMetadata(ROUTE_ARGS_METADATA, Handler, 'run')) as {
      factory: (data: string, ctx: ExecutionContext) => unknown;
    }[];
    const ctx = {
      switchToHttp: () => ({ getRequest: () => ({ user: { userId: 'USR-001', role: Role.ATTENDEE } }) }),
    } as unknown as ExecutionContext;

    expect(arg.factory('role', ctx)).toBe(Role.ATTENDEE);
  });

  // TC-S1-74 · US-02 AC-8 · setup: none (unit) · fails if a 401 with a plain-string body loses its message or the login pointer
  // Code: UnauthorizedFilter.catch (string body)
  it('UnauthorizedFilter keeps a plain-string message and points at login', () => {
    const exception = new UnauthorizedException();
    jest.spyOn(exception, 'getResponse').mockReturnValue('session has ended');
    const res = { status: jest.fn(), setHeader: jest.fn(), json: jest.fn() };
    res.status.mockReturnValue(res);
    res.setHeader.mockReturnValue(res);

    new UnauthorizedFilter().catch(exception, { switchToHttp: () => ({ getResponse: () => res }) } as never);

    expect(res.json).toHaveBeenCalledWith({ message: 'session has ended', loginUrl: '/auth/login' });
  });

  // TC-S1-26 · US-03 AC-3 · setup: none (unit) · fails if an end not after the start gives no message naming both fields
  // Code: IsAfterField defaultMessage
  it('IsAfterField names both fields when no message is given', async () => {
    class Window {
      start!: string;
      @IsAfterField('start')
      end!: string;
    }

    const [error] = await validate(plainToInstance(Window, { start: '2030-01-02', end: '2030-01-01' }));

    expect(error.constraints).toEqual({ isAfterField: 'end must be later than start' });
  });

  // TC-S1-71, TC-S1-72 · US-02 AC-5, AC-6 · setup: none (unit) · fails if a RELATED role with no event rule sees any event
  // Code: AccessControlService.scopedEventFilter (RELATED fallback)
  it('a RELATED role with no event rule sees no events', () => {
    const access = new AccessControlService({} as PrismaService);
    jest.spyOn(access, 'requireScope').mockReturnValue(Scope.RELATED);

    expect(access.scopedEventFilter({ userId: 'USR-001', role: Role.SAFETY_OFFICER, jti: 'j' })).toEqual({
      id: { in: [] },
    });
  });

  describe('EventsService (US-04, US-08, US-09)', () => {
    const coordinator: AuthenticatedUser = { userId: 'USR-004', role: Role.EVENT_COORDINATOR, jti: 'j' };
    const nameless = {
      id: 'EVT-001',
      organiserId: 'USR-006',
      coordinatorId: 'USR-004',
      name: null,
      status: EventStatus.SUBMITTED,
      clarificationRequest: null,
      decisionReason: null,
    };
    const build = () => {
      const prisma = { $transaction: jest.fn().mockResolvedValue({ ...nameless, status: EventStatus.REJECTED }) };
      const access = {
        assertEventAccess: jest.fn().mockResolvedValue(nameless),
        isAssignedCoordinator: jest.fn().mockReturnValue(true),
      };
      const notifications = { notifySafely: jest.fn().mockResolvedValue(undefined) };
      const service = new EventsService(
        prisma as unknown as PrismaService,
        access as unknown as AccessControlService,
        notifications as unknown as NotificationsService,
        {} as EquipmentReservationsService,
        {} as BookingsService,
      );
      return { service, notifications };
    };

    afterEach(() => {
      mockValidationErrors = null;
    });

    // TC-S1-32 · US-04 AC-2 · setup: none (unit) · fails if saving a draft unchanged records an empty history entry
    // Code: EventsService.applyEdits (no changes -> no entry)
    it('saving a draft unchanged records no history entry', async () => {
      const { service } = build();
      const tx = { eventRequest: { update: jest.fn().mockResolvedValue(nameless) } };

      const result = await service['applyEdits'](tx as never, { ...nameless, name: 'Gala' } as never, 'USR-006', { name: 'Gala' });

      expect(result.changeId).toBeNull();
    });

    // TC-S1-36 · US-04 AC-4 · setup: none (unit) · fails if a validation error without constraints breaks the 400
    // Code: EventsService.assertReadyForSubmission (constraints ?? {})
    it('a submission error without constraints is still a 400', async () => {
      const { service } = build();
      mockValidationErrors = [{ property: 'name', children: [] }];

      await expect(service['assertReadyForSubmission'](nameless as never)).rejects.toMatchObject({
        status: 400,
        response: expect.objectContaining({ message: [] }),
      });
    });

    // TC-S1-20 · US-09 AC-4 · setup: none (unit) · fails if a question about a nameless request cannot be worded
    // Code: EventsService.askClarification (name fallback)
    it('words a clarification notice for a request with no name', async () => {
      const { service, notifications } = build();

      await service.askClarification(coordinator, 'EVT-001', { question: 'How many?' });

      expect(notifications.notifySafely).toHaveBeenCalledWith(
        expect.objectContaining({
          type: NotificationType.CLARIFICATION_REQUESTED,
          message: 'The coordinator has asked a question about "your event request". Reason: How many?',
        }),
      );
    });

    // TC-S1-12 · US-08 AC-4 · setup: none (unit) · fails if a decision with no reason sends "Reason: null"
    // Code: EventsService.decide (decisionReason ?? clarificationRequest ?? null)
    it('a decision with no reason sends a notice without one', async () => {
      const { service, notifications } = build();

      await service['decide'](coordinator, 'EVT-001', EventStatus.REJECTED, {});

      expect(notifications.notifySafely.mock.calls[0][0].message).toBe('Your event request "your event request" was rejected.');
    });
  });
});
