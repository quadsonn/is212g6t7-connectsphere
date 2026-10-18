import {
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import {
  EquipmentStatus,
  EventStatus,
  NotificationType,
  ReservationStatus,
  Role,
} from '@prisma/client';

import { AccessControlService } from '../common/access/access-control.service';
import { Scope } from '../common/access/permission.types';
import { AuthenticatedUser } from '../auth/jwt.strategy';
import { NotificationsService } from '../notifications/notifications.service';
import { PrismaService } from '../prisma/prisma.service';
import {
  EquipmentReservationsService,
  rejectionReason,
} from './equipment-reservations.service';

/** US-31 (commit) and US-32 (release) — service rules, with Prisma mocked. */
describe('EquipmentReservationsService', () => {
  const tech: AuthenticatedUser = {
    userId: 'tech-1',
    role: Role.TECHNICAL_SUPPORT_STAFF,
    jti: 'j1',
  };

  const start = new Date('2030-10-01T09:00:00.000Z');
  const end = new Date('2030-10-01T17:00:00.000Z');

  const event = {
    id: 'event-1',
    name: 'Capstone Showcase',
    status: EventStatus.PLANNING as EventStatus,
    coordinatorId: 'coord-1' as string | null,
    proposedStart: start,
    proposedEnd: end,
  };
  const mic = {
    id: 'eq-mic',
    type: 'Wireless microphone',
    totalQuantity: 10,
    operationalStatus: EquipmentStatus.OPERATIONAL as EquipmentStatus,
  };

  let tx: {
    $queryRaw: jest.Mock;
    eventRequest: { findUniqueOrThrow: jest.Mock; findUnique: jest.Mock };
    equipment: { findUniqueOrThrow: jest.Mock };
    equipmentReservation: {
      findMany: jest.Mock;
      create: jest.Mock;
      updateMany: jest.Mock;
    };
  };
  let prisma: {
    $transaction: jest.Mock;
    equipmentReservation: { findMany: jest.Mock };
  };
  let access: { requireScope: jest.Mock };
  let notifications: { notifySafely: jest.Mock };
  let service: EquipmentReservationsService;

  const commit = (quantity: number) =>
    service.commit(tech, { eventId: 'event-1', equipmentId: 'eq-mic', quantity });

  beforeEach(() => {
    tx = {
      // Both row locks find their row by default.
      $queryRaw: jest.fn().mockResolvedValue([{ id: 'row' }]),
      eventRequest: {
        findUniqueOrThrow: jest.fn().mockResolvedValue({ ...event }),
        findUnique: jest.fn().mockResolvedValue({ status: EventStatus.CANCELLED }),
      },
      equipment: { findUniqueOrThrow: jest.fn().mockResolvedValue({ ...mic }) },
      equipmentReservation: {
        findMany: jest.fn().mockResolvedValue([]),
        create: jest.fn().mockImplementation(({ data }) =>
          Promise.resolve({
            id: 'res-1',
            ...data,
            createdAt: new Date(),
            equipment: { id: mic.id, type: mic.type },
          }),
        ),
        updateMany: jest.fn().mockResolvedValue({ count: 2 }),
      },
    };
    prisma = {
      $transaction: jest.fn().mockImplementation((fn) => fn(tx)),
      equipmentReservation: { findMany: jest.fn().mockResolvedValue([]) },
    };
    access = { requireScope: jest.fn().mockReturnValue(Scope.ANY) };
    notifications = { notifySafely: jest.fn().mockResolvedValue(undefined) };

    service = new EquipmentReservationsService(
      prisma as unknown as PrismaService,
      access as unknown as AccessControlService,
      notifications as unknown as NotificationsService,
    );
  });

  describe('US-31 AC-1: commit an item and quantity to an event for its date and time', () => {
    it('creates a committed (APPROVED) reservation over the event’s own window', async () => {
      const result = await commit(4);

      expect(tx.equipmentReservation.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: {
            eventId: 'event-1',
            equipmentId: 'eq-mic',
            quantity: 4,
            start,
            end,
            status: ReservationStatus.APPROVED,
          },
        }),
      );
      expect(result).toMatchObject({ id: 'res-1', quantity: 4, start, end });
    });

    it('is gated on RESERVATION/CREATE before touching the database', async () => {
      access.requireScope.mockImplementation(() => {
        throw new ForbiddenException();
      });

      await expect(commit(1)).rejects.toThrow(ForbiddenException);
      expect(access.requireScope).toHaveBeenCalledWith(tech, 'RESERVATION', 'CREATE');
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('404s for an event that does not exist', async () => {
      tx.$queryRaw.mockResolvedValueOnce([]);

      await expect(commit(1)).rejects.toThrow(NotFoundException);
      expect(tx.equipmentReservation.create).not.toHaveBeenCalled();
    });

    it('404s for equipment that does not exist', async () => {
      tx.$queryRaw
        .mockResolvedValueOnce([{ id: 'event-1' }])
        .mockResolvedValueOnce([]);

      await expect(commit(1)).rejects.toThrow(/equipment not found/);
      expect(tx.equipmentReservation.create).not.toHaveBeenCalled();
    });

    it.each([
      EventStatus.DRAFT,
      EventStatus.REJECTED,
      EventStatus.CANCELLED,
      EventStatus.COMPLETED,
    ])('refuses an event that is %s', async (status) => {
      tx.eventRequest.findUniqueOrThrow.mockResolvedValue({ ...event, status });

      await expect(commit(1)).rejects.toThrow(ConflictException);
      expect(tx.equipmentReservation.create).not.toHaveBeenCalled();
    });
  });

  describe('US-31 AC-2: the committed quantity is locked against overlapping commitments', () => {
    it('runs the transaction with room to wait for the row lock', async () => {
      await commit(1);

      expect(prisma.$transaction).toHaveBeenCalledWith(expect.any(Function), {
        maxWait: 10_000,
        timeout: 15_000,
      });
    });

    it('row-locks the event and then the equipment item inside the transaction', async () => {
      await commit(1);

      const sql = tx.$queryRaw.mock.calls.map(([strings]) => strings.join('?'));
      expect(sql[0]).toMatch(/FROM "EventRequest" WHERE "id" = \? FOR SHARE/);
      expect(sql[1]).toMatch(/FROM "Equipment" WHERE "id" = \? FOR UPDATE/);
      expect(tx.$queryRaw.mock.calls[1][1]).toBe('eq-mic');
    });

    it('counts committed reservations overlapping the event’s window, via the shared US-29 query', async () => {
      await commit(1);

      expect(tx.equipmentReservation.findMany).toHaveBeenCalledWith({
        where: {
          equipmentId: { in: ['eq-mic'] },
          status: { in: [ReservationStatus.APPROVED] },
          start: { lt: end },
          end: { gt: start },
        },
        select: { quantity: true, start: true, end: true },
      });
    });

    it.each([
      ['below', 5],
      ['exactly equal to', 6],
    ])('accepts a quantity %s what is free', async (_label, quantity) => {
      tx.equipmentReservation.findMany.mockResolvedValue([{ quantity: 4, start, end }]);

      await expect(commit(quantity)).resolves.toMatchObject({ quantity });
    });
  });

  describe('US-31 AC-3: a quantity already locked elsewhere is rejected with the reason', () => {
    it('rejects one unit above what is free, and says why', async () => {
      tx.equipmentReservation.findMany.mockResolvedValue([{ quantity: 4, start, end }]);

      await expect(commit(7)).rejects.toThrow(
        'Only 6 of the 7 Wireless microphone requested are free for ' +
          '2030-10-01T09:00:00.000Z – 2030-10-01T17:00:00.000Z: 4 of 10 are ' +
          'already committed to an overlapping period.',
      );
      expect(tx.equipmentReservation.create).not.toHaveBeenCalled();
      expect(notifications.notifySafely).not.toHaveBeenCalled();
    });

    it('rejects any quantity when everything is committed elsewhere', async () => {
      tx.equipmentReservation.findMany.mockResolvedValue([{ quantity: 10, start, end }]);

      await expect(commit(1)).rejects.toThrow(ConflictException);
    });

    it.each([
      [EquipmentStatus.UNDER_MAINTENANCE, 'under maintenance'],
      [EquipmentStatus.OUT_OF_SERVICE, 'damaged (out of service)'],
    ])('rejects equipment that is %s, naming the condition', async (operationalStatus, words) => {
      tx.equipment.findUniqueOrThrow.mockResolvedValue({ ...mic, operationalStatus });

      await expect(commit(1)).rejects.toThrow(
        `Wireless microphone is ${words}, so none of it can be committed.`,
      );
    });

    it('rejectionReason() reports the free, requested and committed counts', () => {
      expect(
        rejectionReason(
          {
            equipmentId: 'eq-mic',
            type: 'Wireless microphone',
            operationalStatus: EquipmentStatus.OPERATIONAL,
            requestedQuantity: 3,
            totalQuantity: 5,
            unavailableQuantity: 0,
            reservedQuantity: 4,
            availableQuantity: 1,
            fullyAvailable: false,
            shortfall: 2,
          },
          { start, end },
        ),
      ).toMatch(/Only 1 of the 3 .* 4 of 5 are already committed/);
    });
  });

  describe('US-31 AC-4: the assigned Coordinator is notified once the commitment is confirmed', () => {
    it('notifies the assigned Coordinator after the transaction commits', async () => {
      await commit(2);

      expect(notifications.notifySafely).toHaveBeenCalledWith({
        recipientId: 'coord-1',
        type: NotificationType.EQUIPMENT_RESERVATION_DECIDED,
        message: expect.stringContaining('2 × Wireless microphone committed to "Capstone Showcase"'),
        relatedEventId: 'event-1',
      });
      // After, not inside: the call order proves the transaction resolved first.
      expect(prisma.$transaction.mock.invocationCallOrder[0]).toBeLessThan(
        notifications.notifySafely.mock.invocationCallOrder[0],
      );
    });

    it('sends nothing when the event has no assigned Coordinator', async () => {
      tx.eventRequest.findUniqueOrThrow.mockResolvedValue({ ...event, coordinatorId: null });

      await commit(2);

      expect(notifications.notifySafely).not.toHaveBeenCalled();
    });
  });

  describe('US-32 AC-1/AC-4: releasing a cancelled event’s reservations', () => {
    it('releases only that event’s still-held reservations, stamping when', async () => {
      const count = await service.releaseForCancelledEvent(
        'event-1',
        tx as never,
      );

      expect(count).toBe(2);
      expect(tx.equipmentReservation.updateMany).toHaveBeenCalledWith({
        where: {
          eventId: 'event-1',
          status: { in: [ReservationStatus.REQUESTED, ReservationStatus.APPROVED] },
        },
        data: { status: ReservationStatus.RELEASED, releasedAt: expect.any(Date) },
      });
    });

    it('never matches an already-released reservation, so a repeat release is a no-op', async () => {
      tx.equipmentReservation.updateMany.mockResolvedValue({ count: 0 });

      await expect(
        service.releaseForCancelledEvent('event-1', tx as never),
      ).resolves.toBe(0);
      const { where } = tx.equipmentReservation.updateMany.mock.calls[0][0];
      expect(where.status.in).not.toContain(ReservationStatus.RELEASED);
    });

    it('refuses to release equipment for an event that is not cancelled', async () => {
      tx.eventRequest.findUnique.mockResolvedValue({ status: EventStatus.PLANNING });

      await expect(
        service.releaseForCancelledEvent('event-1', tx as never),
      ).rejects.toThrow(ConflictException);
      expect(tx.equipmentReservation.updateMany).not.toHaveBeenCalled();
    });
  });

  describe('US-32 AC-3: which reservations were released, for which event', () => {
    it('lists RELEASED reservations with their event and equipment, newest first', async () => {
      await service.findReleased(tech);

      expect(access.requireScope).toHaveBeenCalledWith(tech, 'RESERVATION', 'READ');
      const query = prisma.equipmentReservation.findMany.mock.calls[0][0];
      expect(query.where).toEqual({ status: ReservationStatus.RELEASED });
      expect(query.orderBy[0]).toEqual({ releasedAt: 'desc' });
      expect(query.select.event).toEqual({
        select: { id: true, name: true, status: true },
      });
      expect(query.select.releasedAt).toBe(true);
    });
  });
});
