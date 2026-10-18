import {
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import {
  EventStatus,
  NotificationType,
  RegistrationStatus,
  Role,
} from '@prisma/client';

import { AuthenticatedUser } from '../auth/jwt.strategy';
import { AccessControlService } from '../common/access/access-control.service';
import { Action, Resource, Scope } from '../common/access/permission.types';
import { NotificationsService } from '../notifications/notifications.service';
import { PrismaService } from '../prisma/prisma.service';
import {
  NO_REGISTRATIONS_MESSAGE,
  RegistrationsService,
} from './registrations.service';

/** US-33, US-34 and US-35 — service rules, with Prisma mocked. */
describe('RegistrationsService', () => {
  const attendee: AuthenticatedUser = {
    userId: 'att-1',
    role: Role.ATTENDEE,
    jti: 'j1',
  };

  // 30 days out: inside the default window (opens 2 months before, closes
  // 3 days before), so the happy paths stay open whenever the suite runs.
  const start = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
  const end = new Date(start.getTime() + 8 * 60 * 60 * 1000);

  const eventFacts = {
    id: 'event-1',
    name: 'Capstone Showcase',
    status: EventStatus.CONFIRMED as EventStatus,
    registrationEnabled: true,
    proposedStart: start as Date | null,
    proposedEnd: end,
    expectedAttendance: 2 as number | null,
    registrationOpensAt: null as Date | null,
    registrationClosesAt: null as Date | null,
    withdrawalCutoffAt: null as Date | null,
  };

  const row = (overrides: Record<string, unknown> = {}) => ({
    id: 'reg-1',
    status: RegistrationStatus.REGISTERED,
    phone: '+65 9123 4567',
    dietaryRequirements: null,
    accessibilityNeeds: null,
    createdAt: new Date('2999-09-01T00:00:00.000Z'),
    withdrawnAt: null,
    attendeeId: 'att-1',
    event: {
      ...eventFacts,
      venueBookings: [
        { venue: { id: 'v1', name: 'Auditorium', location: 'Block A' } },
      ],
    },
    ...overrides,
  });

  const dto = { eventId: 'event-1', phone: '+65 9123 4567' };

  let tx: {
    $queryRaw: jest.Mock;
    eventRequest: { findUnique: jest.Mock };
    registration: {
      findUnique: jest.Mock;
      findUniqueOrThrow: jest.Mock;
      count: jest.Mock;
      create: jest.Mock;
      update: jest.Mock;
    };
  };
  let prisma: {
    $transaction: jest.Mock;
    eventRequest: { findUnique: jest.Mock };
    registration: {
      findUnique: jest.Mock;
      findMany: jest.Mock;
      count: jest.Mock;
    };
  };
  let access: { requireScope: jest.Mock };
  let notifications: { notifySafely: jest.Mock };
  let service: RegistrationsService;

  beforeEach(() => {
    tx = {
      $queryRaw: jest.fn().mockResolvedValue([{ id: 'event-1' }]),
      eventRequest: { findUnique: jest.fn().mockResolvedValue(eventFacts) },
      registration: {
        findUnique: jest.fn().mockResolvedValue(null),
        findUniqueOrThrow: jest
          .fn()
          .mockResolvedValue({ status: RegistrationStatus.REGISTERED }),
        count: jest.fn().mockResolvedValue(0),
        create: jest.fn().mockResolvedValue(row()),
        update: jest.fn().mockResolvedValue(row()),
      },
    };
    prisma = {
      $transaction: jest.fn((fn: (t: typeof tx) => unknown) => fn(tx)),
      eventRequest: { findUnique: jest.fn().mockResolvedValue(eventFacts) },
      registration: {
        findUnique: jest.fn().mockResolvedValue(null),
        findMany: jest.fn().mockResolvedValue([]),
        count: jest.fn().mockResolvedValue(0),
      },
    };
    access = { requireScope: jest.fn().mockReturnValue(Scope.OWN) };
    notifications = { notifySafely: jest.fn().mockResolvedValue(undefined) };

    service = new RegistrationsService(
      prisma as unknown as PrismaService,
      access as unknown as AccessControlService,
      notifications as unknown as NotificationsService,
    );
  });

  describe('register (US-33)', () => {
    it('AC-3: saves a REGISTERED registration, returns it and notifies', async () => {
      const result = await service.register(attendee, dto);

      expect(access.requireScope).toHaveBeenCalledWith(
        attendee,
        Resource.REGISTRATION,
        Action.REGISTER,
      );
      expect(tx.registration.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            eventId: 'event-1',
            attendeeId: 'att-1',
            status: RegistrationStatus.REGISTERED,
            phone: '+65 9123 4567',
          }),
        }),
      );
      expect(result.status).toBe(RegistrationStatus.REGISTERED);
      expect(notifications.notifySafely).toHaveBeenCalledWith(
        expect.objectContaining({
          recipientId: 'att-1',
          type: NotificationType.REGISTRATION_CONFIRMED,
        }),
      );
    });

    it('locks the event before checking capacity', async () => {
      await service.register(attendee, dto);
      expect(tx.$queryRaw).toHaveBeenCalled();
    });

    it('AC-4/AC-5: refuses a second registration while one is active', async () => {
      tx.registration.findUnique.mockResolvedValue({
        id: 'reg-1',
        status: RegistrationStatus.REGISTERED,
      });

      await expect(service.register(attendee, dto)).rejects.toThrow(
        /already registered/i,
      );
      expect(tx.registration.create).not.toHaveBeenCalled();
      expect(notifications.notifySafely).not.toHaveBeenCalled();
    });

    it('re-registering after a withdrawal reactivates the row, not a duplicate', async () => {
      tx.registration.findUnique.mockResolvedValue({
        id: 'reg-1',
        status: RegistrationStatus.WITHDRAWN,
      });

      await service.register(attendee, dto);

      expect(tx.registration.create).not.toHaveBeenCalled();
      expect(tx.registration.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'reg-1' },
          data: expect.objectContaining({
            status: RegistrationStatus.REGISTERED,
            withdrawnAt: null,
          }),
        }),
      );
    });

    it('AC-7: rejects with a "full" message at capacity', async () => {
      tx.registration.count.mockResolvedValue(2);

      await expect(service.register(attendee, dto)).rejects.toThrow(
        new ConflictException('This event is full.'),
      );
      expect(tx.registration.create).not.toHaveBeenCalled();
    });

    it('AC-1: refuses an event that is not confirmed', async () => {
      tx.eventRequest.findUnique.mockResolvedValue({
        ...eventFacts,
        status: EventStatus.PLANNING,
      });

      await expect(service.register(attendee, dto)).rejects.toThrow(
        ConflictException,
      );
    });

    it('AC-1: refuses an event with registration disabled', async () => {
      tx.eventRequest.findUnique.mockResolvedValue({
        ...eventFacts,
        registrationEnabled: false,
      });

      await expect(service.register(attendee, dto)).rejects.toThrow(
        ConflictException,
      );
    });

    it('AC-6: outside the window the error carries the open/close times', async () => {
      const closes = new Date('2000-01-01T00:00:00.000Z');
      tx.eventRequest.findUnique.mockResolvedValue({
        ...eventFacts,
        registrationClosesAt: closes,
      });

      await expect(service.register(attendee, dto)).rejects.toThrow(
        new RegExp(closes.toISOString()),
      );
    });

    it('404s for an event an Attendee may not see (e.g. a draft)', async () => {
      tx.eventRequest.findUnique.mockResolvedValue({
        ...eventFacts,
        status: EventStatus.DRAFT,
      });

      await expect(service.register(attendee, dto)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('404s for an event that does not exist', async () => {
      tx.$queryRaw.mockResolvedValue([]);

      await expect(service.register(attendee, dto)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('does not record a notification if the registration was refused', async () => {
      tx.registration.count.mockResolvedValue(2);
      await service.register(attendee, dto).catch(() => undefined);
      expect(notifications.notifySafely).not.toHaveBeenCalled();
    });
  });

  describe('getOptions (US-33 AC-1/AC-5/AC-6/AC-7)', () => {
    it('offers registration for an open, confirmed event with room', async () => {
      const result = await service.getOptions(attendee, 'event-1');

      expect(result.canRegister).toBe(true);
      expect(result.alreadyRegistered).toBe(false);
      expect(result.capacity).toBe(2);
    });

    it('hides the option once the attendee is registered', async () => {
      prisma.registration.findUnique.mockResolvedValue({
        status: RegistrationStatus.REGISTERED,
      });

      const result = await service.getOptions(attendee, 'event-1');

      expect(result.canRegister).toBe(false);
      expect(result.alreadyRegistered).toBe(true);
    });

    it('offers it again after a withdrawal', async () => {
      prisma.registration.findUnique.mockResolvedValue({
        status: RegistrationStatus.WITHDRAWN,
      });

      const result = await service.getOptions(attendee, 'event-1');

      expect(result.canRegister).toBe(true);
      expect(result.alreadyRegistered).toBe(false);
    });

    it('reports the reason and times when the event is full', async () => {
      prisma.registration.count.mockResolvedValue(2);

      const result = await service.getOptions(attendee, 'event-1');

      expect(result.canRegister).toBe(false);
      expect(result.reason).toMatch(/full/i);
    });

    it('does not offer registration on an unconfirmed event', async () => {
      prisma.eventRequest.findUnique.mockResolvedValue({
        ...eventFacts,
        status: EventStatus.APPROVED,
      });

      expect((await service.getOptions(attendee, 'event-1')).canRegister).toBe(
        false,
      );
    });
  });

  describe('findMine (US-34)', () => {
    it('AC-1: lists event name, date/time, venue and status', async () => {
      prisma.registration.findMany.mockResolvedValue([row()]);

      const { registrations, message } = await service.findMine(attendee);

      expect(registrations).toHaveLength(1);
      expect(registrations[0]).toMatchObject({
        status: RegistrationStatus.REGISTERED,
        event: {
          name: 'Capstone Showcase',
          start,
          end,
          venue: { name: 'Auditorium' },
        },
      });
      expect(message).toBeNull();
    });

    it('lists withdrawn registrations with their status', async () => {
      prisma.registration.findMany.mockResolvedValue([
        row({ status: RegistrationStatus.WITHDRAWN }),
      ]);

      const { registrations } = await service.findMine(attendee);

      expect(registrations[0].status).toBe(RegistrationStatus.WITHDRAWN);
      expect(registrations[0].withdrawal.canWithdraw).toBe(false);
    });

    it('AC-2: reads the event live through the relation, never a stored copy', async () => {
      await service.findMine(attendee);

      const query = prisma.registration.findMany.mock.calls[0][0];
      expect(query.select.event.select).toMatchObject({
        name: true,
        proposedStart: true,
        proposedEnd: true,
        status: true,
      });
    });

    it('shows a null venue when none has been approved yet', async () => {
      const r = row();
      r.event.venueBookings = [];
      prisma.registration.findMany.mockResolvedValue([r]);

      expect((await service.findMine(attendee)).registrations[0].event.venue).toBeNull();
    });

    it('AC-3: returns the "No Events Registered" message when there are none', async () => {
      const result = await service.findMine(attendee);

      expect(result.registrations).toEqual([]);
      expect(result.message).toBe(NO_REGISTRATIONS_MESSAGE);
    });

    it('AC-4: only queries the caller\'s own registrations', async () => {
      await service.findMine(attendee);

      expect(prisma.registration.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { attendeeId: 'att-1' } }),
      );
    });
  });

  describe('findOne (US-34 AC-4)', () => {
    it('returns the caller\'s own registration', async () => {
      tx.registration.findUnique.mockResolvedValue(row());
      prisma.registration.findUnique.mockResolvedValue(row());

      expect((await service.findOne(attendee, 'reg-1')).id).toBe('reg-1');
    });

    it("denies another attendee's registration", async () => {
      prisma.registration.findUnique.mockResolvedValue(
        row({ attendeeId: 'someone-else' }),
      );

      await expect(service.findOne(attendee, 'reg-1')).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('404s for a registration that does not exist', async () => {
      prisma.registration.findUnique.mockResolvedValue(null);

      await expect(service.findOne(attendee, 'nope')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('withdraw (US-35)', () => {
    beforeEach(() => {
      tx.registration.findUnique.mockResolvedValue(row());
      tx.registration.update.mockResolvedValue(
        row({
          status: RegistrationStatus.WITHDRAWN,
          withdrawnAt: new Date(),
        }),
      );
    });

    it('AC-3: changes the status to WITHDRAWN and notifies', async () => {
      const result = await service.withdraw(attendee, 'reg-1');

      expect(access.requireScope).toHaveBeenCalledWith(
        attendee,
        Resource.REGISTRATION,
        Action.WITHDRAW,
      );
      expect(tx.registration.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'reg-1' },
          data: expect.objectContaining({
            status: RegistrationStatus.WITHDRAWN,
            withdrawnAt: expect.any(Date),
          }),
        }),
      );
      expect(result.status).toBe(RegistrationStatus.WITHDRAWN);
      expect(notifications.notifySafely).toHaveBeenCalledWith(
        expect.objectContaining({
          type: NotificationType.REGISTRATION_WITHDRAWN,
        }),
      );
    });

    it('AC-4: frees the place — the count only includes REGISTERED rows', async () => {
      tx.registration.findUnique.mockResolvedValue(null);

      await service.register(attendee, dto);

      expect(tx.registration.count).toHaveBeenCalledWith({
        where: { eventId: 'event-1', status: RegistrationStatus.REGISTERED },
      });
    });

    it('AC-5: after the cutoff, refuses and states the cutoff', async () => {
      const cutoff = new Date('2000-01-01T00:00:00.000Z');
      const late = row();
      late.event.withdrawalCutoffAt = cutoff;
      tx.registration.findUnique.mockResolvedValue(late);

      await expect(service.withdraw(attendee, 'reg-1')).rejects.toThrow(
        new RegExp(cutoff.toISOString()),
      );
      expect(tx.registration.update).not.toHaveBeenCalled();
      expect(notifications.notifySafely).not.toHaveBeenCalled();
    });

    it('AC-6: an already-withdrawn registration cannot be withdrawn again', async () => {
      tx.registration.findUnique.mockResolvedValue(
        row({ status: RegistrationStatus.WITHDRAWN }),
      );
      tx.registration.findUniqueOrThrow.mockResolvedValue({
        status: RegistrationStatus.WITHDRAWN,
      });

      await expect(service.withdraw(attendee, 'reg-1')).rejects.toThrow(
        ConflictException,
      );
      expect(tx.registration.update).not.toHaveBeenCalled();
    });

    it("refuses to withdraw another attendee's registration", async () => {
      tx.registration.findUnique.mockResolvedValue(
        row({ attendeeId: 'someone-else' }),
      );

      await expect(service.withdraw(attendee, 'reg-1')).rejects.toThrow(
        ForbiddenException,
      );
      expect(tx.registration.update).not.toHaveBeenCalled();
    });

    it('404s for a registration that does not exist', async () => {
      tx.registration.findUnique.mockResolvedValue(null);

      await expect(service.withdraw(attendee, 'nope')).rejects.toThrow(
        NotFoundException,
      );
    });
  });
});
