import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import {
  ChangeRequestStatus,
  EventStatus,
  Prisma,
  Role,
} from '@prisma/client';

import { AccessControlService } from '../common/access/access-control.service';
import { Action, Resource } from '../common/access/permission.types';
import { AuthenticatedUser } from '../auth/jwt.strategy';
import { EquipmentReservationsService } from '../equipment/equipment-reservations.service';
import { NotificationsService } from '../notifications/notifications.service';
import { PrismaService } from '../prisma/prisma.service';
import { CreateChangeRequestDto } from './dto/create-change-request.dto';
import { NO_DIFFERENCE_MESSAGE } from './change-request.rules';
import { EventsChangeRequestService } from './events-change-request.service';
import { EventsService } from './events.service';
import { BookingsService } from '../bookings/bookings.service';

/** US-37 — an Organiser requests a change to their event. */
describe('EventsChangeRequestService (US-37)', () => {
  const DAY = 24 * 60 * 60 * 1000;
  const inDays = (days: number, hour = 9) => {
    const date = new Date(Date.now() + days * DAY);
    date.setUTCHours(hour, 0, 0, 0);
    return date;
  };

  const eventStart = inDays(30, 9);
  const eventEnd = inDays(30, 17);

  const organiser: AuthenticatedUser = {
    userId: 'organiser-1',
    role: Role.EVENT_ORGANISER,
    jti: 'j1',
  };

  const event = (overrides: Record<string, unknown> = {}) => ({
    id: 'event-1',
    organiserId: 'organiser-1',
    coordinatorId: null,
    status: EventStatus.SUBMITTED,
    proposedStart: eventStart,
    proposedEnd: eventEnd,
    expectedAttendance: 50,
    ...overrides,
  });

  let prisma: {
    eventChangeRequest: { findFirst: jest.Mock; create: jest.Mock };
    equipmentRequirement: { findMany: jest.Mock };
    equipment: { findMany: jest.Mock };
  };
  let access: { assertEventAccess: jest.Mock };
  let service: EventsChangeRequestService;
  let stored: Record<string, unknown>;

  const dto = (fields: Partial<CreateChangeRequestDto> = {}): CreateChangeRequestDto => ({
    reason: 'The hall is booked that day',
    ...fields,
  });

  const created = () => prisma.eventChangeRequest.create.mock.calls[0][0].data;

  beforeEach(() => {
    stored = event();
    prisma = {
      eventChangeRequest: {
        findFirst: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockImplementation(({ data }) =>
          Promise.resolve({ id: 'cr-1', createdAt: new Date(), ...data }),
        ),
      },
      equipmentRequirement: {
        findMany: jest.fn().mockResolvedValue([
          { equipmentId: 'projector', quantity: 2 },
          { equipmentId: 'mic', quantity: 4 },
        ]),
      },
      equipment: {
        findMany: jest.fn().mockImplementation(({ where }) =>
          Promise.resolve(where.id.in.map((id: string) => ({ id }))),
        ),
      },
    };
    access = {
      assertEventAccess: jest.fn().mockImplementation(() => Promise.resolve({ ...stored })),
    };
    service = new EventsChangeRequestService(
      prisma as unknown as PrismaService,
      access as unknown as AccessControlService,
    );
  });

  describe('AC: a submitted request is saved as Pending and linked to the event', () => {
    it('saves PENDING, linked to the event and the requester, with the reason', async () => {
      const result = await service.request(
        organiser,
        'event-1',
        dto({ proposedAttendance: 80 }),
      );

      expect(created()).toMatchObject({
        eventId: 'event-1',
        requestedById: 'organiser-1',
        status: ChangeRequestStatus.PENDING,
        reason: 'The hall is booked that day',
        proposedAttendance: 80,
      });
      expect(result.status).toBe(ChangeRequestStatus.PENDING);
    });

    it('stores only the fields that differ, and null for the rest', async () => {
      await service.request(
        organiser,
        'event-1',
        dto({ proposedStart: eventStart, proposedEnd: inDays(30, 18), proposedAttendance: 50 }),
      );

      expect(created()).toMatchObject({
        proposedStart: null,
        proposedEnd: inDays(30, 18),
        proposedAttendance: null,
        equipmentChanged: false,
      });
    });

    it('does not modify the event', async () => {
      const unexpected = jest.fn();
      (prisma as unknown as Record<string, unknown>).eventRequest = { update: unexpected };

      await service.request(organiser, 'event-1', dto({ proposedAttendance: 80 }));

      expect(unexpected).not.toHaveBeenCalled();
    });
  });

  describe('AC: at least one field must differ', () => {
    it('rejects a request identical to the event', async () => {
      await expect(
        service.request(
          organiser,
          'event-1',
          dto({
            proposedStart: eventStart,
            proposedEnd: eventEnd,
            proposedAttendance: 50,
            equipment: [
              { equipmentId: 'projector', quantity: 2 },
              { equipmentId: 'mic', quantity: 4 },
            ],
          }),
        ),
      ).rejects.toThrow(new BadRequestException([NO_DIFFERENCE_MESSAGE]));

      expect(prisma.eventChangeRequest.create).not.toHaveBeenCalled();
    });
  });

  describe('AC: proposed dates cannot be in the past; end must be after start', () => {
    it('rejects a start in the past', async () => {
      await expect(
        service.request(organiser, 'event-1', dto({ proposedStart: inDays(-1) })),
      ).rejects.toThrow(BadRequestException);
      expect(prisma.eventChangeRequest.create).not.toHaveBeenCalled();
    });

    it('rejects an end that is not after the start', async () => {
      await expect(
        service.request(
          organiser,
          'event-1',
          dto({ proposedStart: inDays(40, 12), proposedEnd: inDays(40, 9) }),
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('accepts a later date', async () => {
      await service.request(
        organiser,
        'event-1',
        dto({ proposedStart: inDays(40, 9), proposedEnd: inDays(40, 17) }),
      );

      expect(created()).toMatchObject({
        proposedStart: inDays(40, 9),
        proposedEnd: inDays(40, 17),
      });
    });
  });

  describe('AC: equipment changes — add, remove, change quantity, from the catalogue', () => {
    it('saves the complete proposed list when an item is added', async () => {
      await service.request(
        organiser,
        'event-1',
        dto({
          equipment: [
            { equipmentId: 'projector', quantity: 2 },
            { equipmentId: 'mic', quantity: 4 },
            { equipmentId: 'camera', quantity: 1 },
          ],
        }),
      );

      expect(created().equipmentChanged).toBe(true);
      expect(created().equipment.create).toEqual([
        { equipmentId: 'projector', quantity: 2 },
        { equipmentId: 'mic', quantity: 4 },
        { equipmentId: 'camera', quantity: 1 },
      ]);
    });

    it('saves a removal as the list without that item', async () => {
      await service.request(
        organiser,
        'event-1',
        dto({ equipment: [{ equipmentId: 'projector', quantity: 2 }] }),
      );

      expect(created().equipment.create).toEqual([{ equipmentId: 'projector', quantity: 2 }]);
    });

    it('saves a changed quantity', async () => {
      await service.request(
        organiser,
        'event-1',
        dto({
          equipment: [
            { equipmentId: 'projector', quantity: 5 },
            { equipmentId: 'mic', quantity: 4 },
          ],
        }),
      );

      expect(created().equipment.create).toContainEqual({
        equipmentId: 'projector',
        quantity: 5,
      });
    });

    it('saves an empty list as "remove everything"', async () => {
      await service.request(organiser, 'event-1', dto({ equipment: [] }));

      expect(created().equipmentChanged).toBe(true);
      expect(created().equipment.create).toEqual([]);
    });

    it('rejects an item that is not in the catalogue', async () => {
      prisma.equipment.findMany.mockResolvedValue([{ id: 'projector' }]);

      await expect(
        service.request(
          organiser,
          'event-1',
          dto({
            equipment: [
              { equipmentId: 'projector', quantity: 2 },
              { equipmentId: 'ghost', quantity: 1 },
            ],
          }),
        ),
      ).rejects.toThrow(
        new BadRequestException(['equipment item ghost is not in the catalogue']),
      );
      expect(prisma.eventChangeRequest.create).not.toHaveBeenCalled();
    });

    it('ignores requirements with no catalogue link when comparing', async () => {
      prisma.equipmentRequirement.findMany.mockResolvedValue([]);

      await service.request(
        organiser,
        'event-1',
        dto({ equipment: [{ equipmentId: 'projector', quantity: 2 }] }),
      );

      expect(prisma.equipmentRequirement.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { eventId: 'event-1', equipmentId: { not: null } },
        }),
      );
      expect(created().equipmentChanged).toBe(true);
    });
  });

  describe('AC: only submitted or confirmed events (and those live in between)', () => {
    it.each([EventStatus.SUBMITTED, EventStatus.CONFIRMED, EventStatus.RETURNED])(
      'accepts a request for a %s event',
      async (status) => {
        stored = event({ status });

        await service.request(organiser, 'event-1', dto({ proposedAttendance: 80 }));

        expect(prisma.eventChangeRequest.create).toHaveBeenCalled();
      },
    );

    it.each([
      EventStatus.CANCELLED,
      EventStatus.COMPLETED,
      EventStatus.REJECTED,
      EventStatus.DRAFT,
    ])('refuses a request for a %s event', async (status) => {
      stored = event({ status });

      await expect(
        service.request(organiser, 'event-1', dto({ proposedAttendance: 80 })),
      ).rejects.toThrow(ConflictException);
      expect(prisma.eventChangeRequest.create).not.toHaveBeenCalled();
    });
  });

  describe('AC: Organisers can only request changes to their own events', () => {
    it('asks the access layer for REQUEST_CHANGE on this event', async () => {
      await service.request(organiser, 'event-1', dto({ proposedAttendance: 80 }));

      expect(access.assertEventAccess).toHaveBeenCalledWith(
        organiser,
        'event-1',
        Action.REQUEST_CHANGE,
      );
    });

    it("denies another Organiser's event and saves nothing", async () => {
      access.assertEventAccess.mockRejectedValue(
        new NotFoundException('event request not found'),
      );

      await expect(
        service.request(organiser, 'event-2', dto({ proposedAttendance: 80 })),
      ).rejects.toThrow(NotFoundException);
      expect(prisma.eventChangeRequest.create).not.toHaveBeenCalled();
    });

    it('scopes the real access check to events the Organiser raised', async () => {
      const eventRequest = { findFirst: jest.fn().mockResolvedValue(null) };
      const real = new AccessControlService({ eventRequest } as unknown as PrismaService);

      await expect(
        real.assertEventAccess(organiser, 'event-2', Action.REQUEST_CHANGE),
      ).rejects.toThrow(NotFoundException);

      expect(eventRequest.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { AND: [{ id: 'event-2' }, { organiserId: 'organiser-1' }] },
        }),
      );
    });

    it.each([
      Role.EVENT_COORDINATOR,
      Role.VENUE_STAFF,
      Role.TECHNICAL_SUPPORT_STAFF,
      Role.ATTENDEE,
    ])('gives %s no REQUEST_CHANGE grant', (role) => {
      const real = new AccessControlService({} as unknown as PrismaService);

      expect(() =>
        real.requireScope(
          { userId: 'u', role, jti: 'j' },
          Resource.EVENT,
          Action.REQUEST_CHANGE,
        ),
      ).toThrow();
    });
  });

  describe('AC: equipment items are selected from the catalogue', () => {
    it('lists the catalogue for the picker with only id, type, description and location', async () => {
      prisma.equipment.findMany.mockResolvedValue([
        { id: 'projector', type: 'Projector', description: null, location: 'Store room A' },
      ]);

      await expect(service.listCatalogue()).resolves.toEqual([
        { id: 'projector', type: 'Projector', description: null, location: 'Store room A' },
      ]);
      expect(prisma.equipment.findMany).toHaveBeenCalledWith({
        select: { id: true, type: true, description: true, location: true },
        orderBy: { type: 'asc' },
      });
    });
  });

  describe('one pending request per event', () => {
    it('refuses a second while one is pending', async () => {
      prisma.eventChangeRequest.findFirst.mockResolvedValue({ id: 'cr-0' });

      await expect(
        service.request(organiser, 'event-1', dto({ proposedAttendance: 80 })),
      ).rejects.toThrow(ConflictException);
      expect(prisma.eventChangeRequest.create).not.toHaveBeenCalled();
    });

    it('maps the unique-index violation from a racing submit to a conflict', async () => {
      prisma.eventChangeRequest.create.mockRejectedValue(
        new Prisma.PrismaClientKnownRequestError('dup', {
          code: 'P2002',
          clientVersion: 'test',
        }),
      );

      await expect(
        service.request(organiser, 'event-1', dto({ proposedAttendance: 80 })),
      ).rejects.toThrow(ConflictException);
    });
  });
});

/** US-37 AC: the original details still show, with the pending request alongside. */
describe('EventsService viewing an event with a pending change request (US-37)', () => {
  const organiser: AuthenticatedUser = {
    userId: 'organiser-1',
    role: Role.EVENT_ORGANISER,
    jti: 'j1',
  };

  const original = {
    id: 'event-1',
    organiserId: 'organiser-1',
    coordinatorId: null,
    status: EventStatus.SUBMITTED,
    proposedStart: new Date('2026-11-01T09:00:00Z'),
    proposedEnd: new Date('2026-11-01T17:00:00Z'),
    expectedAttendance: 50,
    clarificationRequest: null,
    decisionReason: null,
    coordinator: null,
  };

  const pending = {
    id: 'cr-1',
    eventId: 'event-1',
    status: ChangeRequestStatus.PENDING,
    reason: 'More people are coming',
    proposedAttendance: 80,
    proposedStart: null,
    proposedEnd: null,
    equipmentChanged: false,
    equipment: [],
  };

  const rejected = {
    id: 'cr-0',
    eventId: 'event-1',
    status: ChangeRequestStatus.REJECTED,
    reason: 'Earlier ask',
    decisionReason: 'The venue is booked solid',
    equipment: [],
  };

  const build = (
    pendingRow: unknown,
    user: AuthenticatedUser = organiser,
    decidedRow: unknown = null,
  ) => {
    const prisma = {
      eventRequest: { findUniqueOrThrow: jest.fn().mockResolvedValue(original) },
      equipmentRequirement: { findMany: jest.fn().mockResolvedValue([]) },
      eventChangeRequest: {
        // One lookup for the pending request, one for the latest decision.
        findFirst: jest.fn().mockImplementation(({ where }) =>
          Promise.resolve(where.status === ChangeRequestStatus.PENDING ? pendingRow : decidedRow),
        ),
      },
    };
    const access = {
      assertEventAccess: jest.fn().mockResolvedValue(original),
      projectEvent: jest.fn().mockImplementation((_user, e) => e),
    };
    const service = new EventsService(
      prisma as unknown as PrismaService,
      access as unknown as AccessControlService,
      {} as NotificationsService,
      { findUnavailableForEvent: jest.fn().mockResolvedValue([]) } as unknown as EquipmentReservationsService,
      { releaseForCancelledEvent: jest.fn().mockResolvedValue([]) } as unknown as BookingsService,
    );
    return { prisma, service, user };
  };

  it.each(['findMyRequest', 'findOneForUser'] as const)(
    '%s keeps the original details and adds the pending request',
    async (method) => {
      const { prisma, service } = build(pending);

      const view = (await service[method](organiser, 'event-1')) as unknown as Record<
        string,
        unknown
      >;

      expect(view.expectedAttendance).toBe(50);
      expect(view.proposedStart).toEqual(original.proposedStart);
      expect(view.pendingChangeRequest).toEqual(pending);
      expect(prisma.eventChangeRequest.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { eventId: 'event-1', status: ChangeRequestStatus.PENDING },
        }),
      );
    },
  );

  it('asks for the equipment lines with the Organiser view, for the form', async () => {
    const { prisma, service } = build(null);

    await service.findMyRequest(organiser, 'event-1');

    expect(prisma.eventRequest.findUniqueOrThrow).toHaveBeenCalledWith(
      expect.objectContaining({
        include: expect.objectContaining({
          equipmentRequirements: expect.anything(),
        }),
      }),
    );
  });

  it.each(['findMyRequest', 'findOneForUser'] as const)(
    '%s shows the Organiser the latest decision, including a rejection reason (US-38 AC-5)',
    async (method) => {
      const { prisma, service } = build(null, organiser, rejected);

      const view = (await service[method](organiser, 'event-1')) as unknown as Record<
        string,
        unknown
      >;

      expect(view.latestChangeDecision).toEqual(rejected);
      expect(prisma.eventChangeRequest.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            eventId: 'event-1',
            status: { in: [ChangeRequestStatus.APPROVED, ChangeRequestStatus.REJECTED] },
          },
          orderBy: { decidedAt: 'desc' },
        }),
      );
    },
  );

  it('reports null when nothing is pending', async () => {
    const { service } = build(null);

    const view = (await service.findMyRequest(organiser, 'event-1')) as unknown as Record<
      string,
      unknown
    >;

    expect(view.pendingChangeRequest).toBeNull();
  });

  it("does not put the request on anyone else's view of the event", async () => {
    const coordinator: AuthenticatedUser = {
      userId: 'coordinator-1',
      role: Role.EVENT_COORDINATOR,
      jti: 'j2',
    };
    const { prisma, service } = build(pending, coordinator);

    const view = (await service.findOneForUser(coordinator, 'event-1')) as unknown as Record<
      string,
      unknown
    >;

    expect(view).not.toHaveProperty('pendingChangeRequest');
    expect(prisma.eventChangeRequest.findFirst).not.toHaveBeenCalled();
  });
});
