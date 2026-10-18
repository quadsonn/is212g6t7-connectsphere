import { ConflictException, ForbiddenException } from '@nestjs/common';
import { EventStatus, Role } from '@prisma/client';

import { AccessControlService } from '../common/access/access-control.service';
import { Resource, Action, Scope } from '../common/access/permission.types';
import { AuthenticatedUser } from '../auth/jwt.strategy';
import { EquipmentReservationsService } from '../equipment/equipment-reservations.service';
import { NotificationsService } from '../notifications/notifications.service';
import { PrismaService } from '../prisma/prisma.service';
import { EventsService } from './events.service';
import { CreateEventRequestDto } from './dto/create-event-request.dto';

describe('EventsService (US-03)', () => {
  let prisma: {
    eventRequest: { create: jest.Mock; update: jest.Mock; findMany: jest.Mock };
    equipmentRequirement: { findMany: jest.Mock };
    eventChangeRequest: { findFirst: jest.Mock };
    registration: { groupBy: jest.Mock; findMany: jest.Mock };
    $transaction: jest.Mock;
  };
  let access: {
    requireScope: jest.Mock;
    scopedEventFilter: jest.Mock;
    assertEventAccess: jest.Mock;
    projectEvent: jest.Mock;
  };
  let notifications: { notify: jest.Mock; notifySafely: jest.Mock };
  let service: EventsService;

  const organiser: AuthenticatedUser = {
    userId: 'organiser-1',
    role: Role.EVENT_ORGANISER,
    jti: 'jti-1',
  };

  const validDto = (): CreateEventRequestDto =>
    ({
      name: 'Freshman Orientation',
      purpose: 'Welcome new students',
      description: 'Full-day programme',
      category: 'Student engagement',
      proposedStart: new Date('2030-10-01T09:00:00Z'),
      proposedEnd: new Date('2030-10-01T17:00:00Z'),
      expectedAttendance: 300,
    }) as CreateEventRequestDto;

  const draftRow = (overrides: Record<string, unknown> = {}) => ({
    id: 'event-1',
    organiserId: 'organiser-1',
    coordinatorId: null,
    status: EventStatus.DRAFT,
    ...overrides,
  });

  beforeEach(() => {
    prisma = {
      eventRequest: {
        create: jest.fn(),
        update: jest.fn(),
        findMany: jest.fn().mockResolvedValue([]),
      },
      equipmentRequirement: { findMany: jest.fn().mockResolvedValue([]) },
      // US-36: an Organiser's event view looks for a pending change request.
      eventChangeRequest: { findFirst: jest.fn().mockResolvedValue(null) },
      registration: {
        groupBy: jest.fn().mockResolvedValue([]),
        findMany: jest.fn().mockResolvedValue([]),
      },
      // Run the callback against the same mock client.
      $transaction: jest.fn((callback) => callback(prisma)),
    };
    access = {
      requireScope: jest.fn().mockReturnValue(Scope.OWN),
      scopedEventFilter: jest.fn().mockReturnValue({ organiserId: 'organiser-1' }),
      assertEventAccess: jest.fn(),
      projectEvent: jest.fn((_user, event) => event),
    };

    notifications = { notify: jest.fn(), notifySafely: jest.fn() };
    service = new EventsService(
      prisma as unknown as PrismaService,
      access as unknown as AccessControlService,
      notifications as unknown as NotificationsService,
      { releaseForCancelledEvent: jest.fn() } as unknown as EquipmentReservationsService,
    );
  });

  describe('AC-1: a valid request is recorded as SUBMITTED', () => {
    it('creates the record then transitions it to SUBMITTED', async () => {
      prisma.eventRequest.create.mockResolvedValue(draftRow());
      prisma.eventRequest.update.mockResolvedValue(
        draftRow({ status: EventStatus.SUBMITTED }),
      );

      const result = await service.createAndSubmit(organiser, validDto());

      expect(result.status).toBe(EventStatus.SUBMITTED);
      expect(prisma.eventRequest.update).toHaveBeenCalledWith({
        where: { id: 'event-1' },
        data: { status: EventStatus.SUBMITTED },
      });
    });

    it('never writes status directly on create — DRAFT comes from the schema default', async () => {
      prisma.eventRequest.create.mockResolvedValue(draftRow());
      prisma.eventRequest.update.mockResolvedValue(
        draftRow({ status: EventStatus.SUBMITTED }),
      );

      await service.createAndSubmit(organiser, validDto());

      const createArg = prisma.eventRequest.create.mock.calls[0][0];
      expect(createArg.data).not.toHaveProperty('status');
    });

    it('records the request against the calling organiser, not a client-supplied id', async () => {
      prisma.eventRequest.create.mockResolvedValue(draftRow());
      prisma.eventRequest.update.mockResolvedValue(
        draftRow({ status: EventStatus.SUBMITTED }),
      );

      await service.createAndSubmit(organiser, validDto());

      expect(prisma.eventRequest.create.mock.calls[0][0].data.organiserId).toBe(
        'organiser-1',
      );
    });

    it('persists the whole submission in one transaction', async () => {
      prisma.eventRequest.create.mockResolvedValue(draftRow());
      prisma.eventRequest.update.mockResolvedValue(
        draftRow({ status: EventStatus.SUBMITTED }),
      );

      await service.createAndSubmit(organiser, validDto());

      expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    });

    it('checks the caller may create before touching the database', async () => {
      access.requireScope.mockImplementation(() => {
        throw new ForbiddenException();
      });

      await expect(
        service.createAndSubmit(organiser, validDto()),
      ).rejects.toThrow(ForbiddenException);
      expect(prisma.eventRequest.create).not.toHaveBeenCalled();
    });
  });

  describe('AC-5: attendance is stored as given', () => {
    it('persists a positive whole number unchanged', async () => {
      prisma.eventRequest.create.mockResolvedValue(draftRow());
      prisma.eventRequest.update.mockResolvedValue(
        draftRow({ status: EventStatus.SUBMITTED }),
      );

      await service.createAndSubmit(organiser, validDto());

      expect(
        prisma.eventRequest.create.mock.calls[0][0].data.expectedAttendance,
      ).toBe(300);
    });
  });

  describe('setStatus: the only way status changes', () => {
    it('applies a legal transition', async () => {
      prisma.eventRequest.update.mockResolvedValue(
        draftRow({ status: EventStatus.SUBMITTED }),
      );

      const result = await service.setStatus(
        draftRow() as never,
        EventStatus.SUBMITTED,
      );

      expect(result.status).toBe(EventStatus.SUBMITTED);
    });

    it('refuses an illegal transition and writes nothing', async () => {
      await expect(
        service.setStatus(draftRow() as never, EventStatus.CONFIRMED),
      ).rejects.toThrow(ConflictException);

      expect(prisma.eventRequest.update).not.toHaveBeenCalled();
    });

    it('refuses to move out of a terminal status', async () => {
      await expect(
        service.setStatus(
          draftRow({ status: EventStatus.COMPLETED }) as never,
          EventStatus.PLANNING,
        ),
      ).rejects.toThrow(ConflictException);
    });

    it('is a no-op when the status is unchanged', async () => {
      const event = draftRow({ status: EventStatus.SUBMITTED });

      const result = await service.setStatus(
        event as never,
        EventStatus.SUBMITTED,
      );

      expect(result).toBe(event);
      expect(prisma.eventRequest.update).not.toHaveBeenCalled();
    });

    it('names both statuses when refusing, so the caller can act on it', async () => {
      await expect(
        service.setStatus(draftRow() as never, EventStatus.COMPLETED),
      ).rejects.toThrow(/DRAFT.*COMPLETED/);
    });
  });

  describe('AC-4: viewing a submitted request', () => {
    it('enforces ownership before returning anything', async () => {
      const event = draftRow({ status: EventStatus.SUBMITTED });
      access.assertEventAccess.mockResolvedValue(event);

      await service.findOneForUser(organiser, 'event-1');

      expect(access.assertEventAccess).toHaveBeenCalledWith(
        organiser,
        'event-1',
        Action.READ,
      );
    });

    it('returns the record the access layer approved', async () => {
      const event = draftRow({ status: EventStatus.SUBMITTED });
      access.assertEventAccess.mockResolvedValue(event);

      // US-27 attaches the equipment requirements alongside the record.
      await expect(service.findOneForUser(organiser, 'event-1')).resolves.toEqual({
        ...event,
        equipmentRequirements: [],
        pendingChangeRequest: null,
        latestChangeDecision: null,
      });
    });

    it('scopes the list query rather than filtering after the fact', async () => {
      await service.findAllForUser(organiser);

      expect(prisma.eventRequest.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { organiserId: 'organiser-1' } }),
      );
    });
  });

  describe("Attendee list: only events they can register for", () => {
    const attendee: AuthenticatedUser = {
      userId: 'att-1',
      role: Role.ATTENDEE,
      jti: 'jti-a',
    };
    const DAY = 24 * 60 * 60 * 1000;
    const inDays = (days: number) => new Date(Date.now() + days * DAY);

    const open = (id: string, overrides: Record<string, unknown> = {}) => ({
      id,
      status: EventStatus.CONFIRMED,
      registrationEnabled: true,
      proposedStart: inDays(30),
      expectedAttendance: 10,
      registrationOpensAt: null,
      registrationClosesAt: null,
      withdrawalCutoffAt: null,
      ...overrides,
    });

    const idsFor = async () =>
      (await service.findAllForUser(attendee)).map((e) => (e as { id: string }).id);

    it('keeps a confirmed, open, non-full event', async () => {
      prisma.eventRequest.findMany.mockResolvedValue([open('ok')]);
      await expect(idsFor()).resolves.toEqual(['ok']);
    });

    it('hides events that are not CONFIRMED or have registration disabled', async () => {
      prisma.eventRequest.findMany.mockResolvedValue([
        open('planning', { status: EventStatus.PLANNING }),
        open('approved', { status: EventStatus.APPROVED }),
        open('disabled', { registrationEnabled: false }),
      ]);
      await expect(idsFor()).resolves.toEqual([]);
    });

    it('hides events that have already started or ended', async () => {
      prisma.eventRequest.findMany.mockResolvedValue([
        open('past', { proposedStart: inDays(-2) }),
      ]);
      await expect(idsFor()).resolves.toEqual([]);
    });

    it('hides events that start within 3 days (registration closed)', async () => {
      prisma.eventRequest.findMany.mockResolvedValue([
        open('soon', { proposedStart: inDays(2) }),
        open('edge', { proposedStart: inDays(4) }),
      ]);
      await expect(idsFor()).resolves.toEqual(['edge']);
    });

    it('hides events more than 2 months away (not open yet)', async () => {
      prisma.eventRequest.findMany.mockResolvedValue([
        open('far', { proposedStart: inDays(90) }),
      ]);
      await expect(idsFor()).resolves.toEqual([]);
    });

    it('hides full events, counting only REGISTERED rows', async () => {
      prisma.eventRequest.findMany.mockResolvedValue([
        open('full', { expectedAttendance: 2 }),
        open('room', { expectedAttendance: 3 }),
      ]);
      prisma.registration.groupBy.mockResolvedValue([
        { eventId: 'full', _count: { _all: 2 } },
        { eventId: 'room', _count: { _all: 2 } },
      ]);

      await expect(idsFor()).resolves.toEqual(['room']);
      expect(prisma.registration.groupBy).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ status: 'REGISTERED' }),
        }),
      );
    });

    it('hides events the attendee is already registered for', async () => {
      prisma.eventRequest.findMany.mockResolvedValue([open('mine'), open('other')]);
      prisma.registration.findMany.mockResolvedValue([{ eventId: 'mine' }]);
      await expect(idsFor()).resolves.toEqual(['other']);
    });

    it('does not apply the filter to staff roles', async () => {
      prisma.eventRequest.findMany.mockResolvedValue([
        open('planning', { status: EventStatus.PLANNING }),
      ]);
      const result = await service.findAllForUser(organiser);
      expect(result).toHaveLength(1);
      expect(prisma.registration.groupBy).not.toHaveBeenCalled();
    });
  });

  it('uses the same resource/action the matrix declares', async () => {
    prisma.eventRequest.create.mockResolvedValue(draftRow());
    prisma.eventRequest.update.mockResolvedValue(
      draftRow({ status: EventStatus.SUBMITTED }),
    );

    await service.createAndSubmit(organiser, validDto());

    expect(access.requireScope).toHaveBeenCalledWith(
      organiser,
      Resource.EVENT,
      Action.CREATE,
    );
  });
});
