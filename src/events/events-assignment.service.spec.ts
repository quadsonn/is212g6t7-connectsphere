import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { EventStatus, NotificationType, Prisma, Role } from '@prisma/client';

import { AccessControlService } from '../common/access/access-control.service';
import { Action } from '../common/access/permission.types';
import { AuthenticatedUser } from '../auth/jwt.strategy';
import { NotificationsService } from '../notifications/notifications.service';
import { PrismaService } from '../prisma/prisma.service';
import { EventsAssignmentService } from './events-assignment.service';
import { EventsService } from './events.service';

/** Event Coordinator Lead — unassigned queue, assignment, supervision. */
describe('EventsAssignmentService', () => {
  let prisma: {
    eventRequest: {
      findMany: jest.Mock;
      findFirst: jest.Mock;
      findUnique: jest.Mock;
      update: jest.Mock;
    };
    user: { findUnique: jest.Mock; findMany: jest.Mock };
    $transaction: jest.Mock;
  };
  let access: { requireScope: jest.Mock; assertEventAccess: jest.Mock };
  let events: { recordChange: jest.Mock };
  let notifications: { notifySafely: jest.Mock };
  let service: EventsAssignmentService;

  const lead: AuthenticatedUser = {
    userId: 'lead-1',
    role: Role.EVENT_COORDINATOR_LEAD,
    jti: 'j1',
  };

  const marcus = {
    id: 'coordinator-1',
    name: 'Marcus',
    email: 'marcus@example.com',
    role: Role.EVENT_COORDINATOR,
  };
  const fatima = {
    id: 'coordinator-2',
    name: 'Fatima',
    email: 'fatima@example.com',
    role: Role.EVENT_COORDINATOR,
  };
  const leadRow = { id: lead.userId, name: 'Lena', role: Role.EVENT_COORDINATOR_LEAD };

  /** What Prisma throws when the conditional update matches no row. */
  const noRowMatched = () =>
    new Prisma.PrismaClientKnownRequestError('not found', {
      code: 'P2025',
      clientVersion: 'test',
    });

  const queued = (overrides: Record<string, unknown> = {}) => ({
    id: 'event-1',
    name: 'Orientation',
    coordinatorId: null,
    coordinator: null,
    status: EventStatus.SUBMITTED,
    ...overrides,
  });

  const assigned = (overrides: Record<string, unknown> = {}) =>
    queued({
      coordinatorId: marcus.id,
      coordinator: { id: marcus.id, name: marcus.name, email: marcus.email },
      status: EventStatus.PLANNING,
      ...overrides,
    });

  beforeEach(() => {
    const users = [marcus, fatima, leadRow];
    prisma = {
      eventRequest: {
        findMany: jest.fn().mockResolvedValue([]),
        findFirst: jest.fn(),
        findUnique: jest.fn(),
        update: jest.fn().mockResolvedValue({}),
      },
      user: {
        findUnique: jest
          .fn()
          .mockImplementation(({ where }) =>
            Promise.resolve(users.find((u) => u.id === where.id) ?? null),
          ),
        findMany: jest.fn().mockResolvedValue([]),
      },
      $transaction: jest.fn((cb) => cb(prisma)),
    };
    access = {
      requireScope: jest.fn(),
      assertEventAccess: jest.fn().mockResolvedValue(queued()),
    };
    events = { recordChange: jest.fn().mockResolvedValue({}) };
    notifications = { notifySafely: jest.fn() };
    service = new EventsAssignmentService(
      prisma as unknown as PrismaService,
      access as unknown as AccessControlService,
      events as unknown as EventsService,
      notifications as unknown as NotificationsService,
    );
  });

  describe('every operation is gated on EVENT/ASSIGN', () => {
    it('refuses a role without the grant before reading anything', async () => {
      access.requireScope.mockImplementation(() => {
        throw new ForbiddenException();
      });

      await expect(service.listQueue(lead)).rejects.toBeInstanceOf(ForbiddenException);
      await expect(service.getQueuedRequest(lead, 'event-1')).rejects.toBeInstanceOf(
        ForbiddenException,
      );
      await expect(service.listCoordinators(lead)).rejects.toBeInstanceOf(
        ForbiddenException,
      );
      await expect(service.listAssignments(lead)).rejects.toBeInstanceOf(
        ForbiddenException,
      );
      expect(prisma.eventRequest.findMany).not.toHaveBeenCalled();
      expect(prisma.user.findMany).not.toHaveBeenCalled();
    });

    it('loads events for assign and reassign through the ASSIGN grant', async () => {
      await service.assign(lead, 'event-1', { coordinatorId: fatima.id });
      expect(access.assertEventAccess).toHaveBeenCalledWith(
        lead,
        'event-1',
        Action.ASSIGN,
      );

      access.assertEventAccess.mockResolvedValue(assigned());
      await service.reassign(lead, 'event-1', { coordinatorId: fatima.id });
      expect(access.assertEventAccess).toHaveBeenLastCalledWith(
        lead,
        'event-1',
        Action.ASSIGN,
      );
    });
  });

  describe('the unassigned queue', () => {
    it('selects only submitted requests with no Coordinator, oldest first', async () => {
      await service.listQueue(lead);

      expect(prisma.eventRequest.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { coordinatorId: null, status: { in: [EventStatus.SUBMITTED] } },
          orderBy: [{ submittedAt: 'asc' }, { id: 'asc' }],
        }),
      );
    });

    it('shows event, Organiser, organisation, category, date, attendance and submission time', async () => {
      const submittedAt = new Date('2030-01-01T00:00:00Z');
      prisma.eventRequest.findMany.mockResolvedValue([
        {
          ...queued(),
          category: 'Student engagement',
          proposedStart: new Date('2030-10-01T09:00:00Z'),
          proposedEnd: new Date('2030-10-01T17:00:00Z'),
          expectedAttendance: 99,
          submittedAt,
          organiser: {
            id: 'o-1',
            name: 'Olive',
            email: 'olive@example.com',
            organisation: 'Acme',
          },
        },
      ]);

      const [entry] = await service.listQueue(lead);

      expect(entry).toEqual({
        id: 'event-1',
        name: 'Orientation',
        organiser: { id: 'o-1', name: 'Olive', email: 'olive@example.com' },
        organisation: 'Acme',
        category: 'Student engagement',
        proposedStart: new Date('2030-10-01T09:00:00Z'),
        proposedEnd: new Date('2030-10-01T17:00:00Z'),
        expectedAttendance: 99,
        submittedAt,
      });
    });

    it('opens only a request that is in the queue', async () => {
      prisma.eventRequest.findFirst.mockResolvedValue(null);

      await expect(service.getQueuedRequest(lead, 'event-1')).rejects.toBeInstanceOf(
        NotFoundException,
      );
      expect(prisma.eventRequest.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            AND: [
              { id: 'event-1' },
              { coordinatorId: null, status: { in: [EventStatus.SUBMITTED] } },
            ],
          },
        }),
      );
    });
  });

  describe('assigning a queued request', () => {
    it('links the Coordinator, leaves the status alone and records the history', async () => {
      const result = await service.assign(lead, 'event-1', {
        coordinatorId: fatima.id,
      });

      expect(prisma.eventRequest.update).toHaveBeenCalledWith({
        where: { id: 'event-1', coordinatorId: null },
        data: { coordinatorId: fatima.id },
      });
      expect(events.recordChange).toHaveBeenCalledWith(
        prisma,
        'event-1',
        lead.userId,
        [{ field: 'coordinator', previous: null, next: 'Fatima' }],
        [],
      );
      expect(result.status).toBe(EventStatus.SUBMITTED);
      expect(result.coordinator).toEqual({
        id: fatima.id,
        name: 'Fatima',
        email: fatima.email,
      });
    });

    it('notifies the assigned Coordinator', async () => {
      await service.assign(lead, 'event-1', { coordinatorId: fatima.id });

      expect(notifications.notifySafely).toHaveBeenCalledTimes(1);
      expect(notifications.notifySafely).toHaveBeenCalledWith(
        expect.objectContaining({
          recipientId: fatima.id,
          type: NotificationType.EVENT_ASSIGNED,
          relatedEventId: 'event-1',
        }),
      );
    });

    it('blocks an already-assigned request and names the current assignee', async () => {
      access.assertEventAccess.mockResolvedValue(assigned());

      const error = await service
        .assign(lead, 'event-1', { coordinatorId: fatima.id })
        .catch((e) => e);

      expect(error).toBeInstanceOf(ConflictException);
      expect(error.getResponse()).toMatchObject({
        message: 'this request is already assigned to Marcus',
        currentAssignee: { id: marcus.id, name: 'Marcus', email: marcus.email },
      });
      expect(prisma.eventRequest.update).not.toHaveBeenCalled();
      expect(notifications.notifySafely).not.toHaveBeenCalled();
    });

    it('does not treat a draft as queued', async () => {
      access.assertEventAccess.mockResolvedValue(
        queued({ status: EventStatus.DRAFT }),
      );

      await expect(
        service.assign(lead, 'event-1', { coordinatorId: fatima.id }),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('loses a race cleanly: the conditional write matches nothing', async () => {
      prisma.eventRequest.update.mockRejectedValue(noRowMatched());
      prisma.eventRequest.findUnique.mockResolvedValue({
        coordinator: { id: marcus.id, name: 'Marcus', email: marcus.email },
      });

      const error = await service
        .assign(lead, 'event-1', { coordinatorId: fatima.id })
        .catch((e) => e);

      expect(error).toBeInstanceOf(ConflictException);
      expect(error.getResponse()).toMatchObject({
        currentAssignee: { id: marcus.id },
      });
      expect(events.recordChange).not.toHaveBeenCalled();
      expect(notifications.notifySafely).not.toHaveBeenCalled();
    });

    it('rejects an unknown target and a target who is not a Coordinator', async () => {
      await expect(
        service.assign(lead, 'event-1', { coordinatorId: 'nobody' }),
      ).rejects.toBeInstanceOf(NotFoundException);

      await expect(
        service.assign(lead, 'event-1', { coordinatorId: lead.userId }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });
  });

  describe('the assignments view', () => {
    it('counts active events per Coordinator, restricted to active statuses', async () => {
      prisma.user.findMany.mockResolvedValue([
        {
          id: marcus.id,
          name: 'Marcus',
          email: marcus.email,
          coordinatedEvents: [
            {
              id: 'e1',
              name: 'A',
              status: EventStatus.PLANNING,
              proposedStart: new Date('2030-10-01'),
            },
            { id: 'e2', name: 'B', status: EventStatus.CONFIRMED, proposedStart: null },
          ],
        },
        { id: fatima.id, name: 'Fatima', email: fatima.email, coordinatedEvents: [] },
      ]);

      const view = await service.listAssignments(lead);

      expect(view.map((v) => v.activeCount)).toEqual([2, 0]);
      expect(view[0].events[0]).toEqual({
        id: 'e1',
        name: 'A',
        status: EventStatus.PLANNING,
        eventDate: new Date('2030-10-01'),
      });

      const { select } = prisma.user.findMany.mock.calls[0][0];
      const statuses = select.coordinatedEvents.where.status.in;
      for (const closed of [
        EventStatus.COMPLETED,
        EventStatus.CANCELLED,
        EventStatus.REJECTED,
        EventStatus.DRAFT,
      ]) {
        expect(statuses).not.toContain(closed);
      }
    });

    it('filters to one Coordinator, and refuses an id that is not one', async () => {
      await service.listAssignments(lead, fatima.id);
      expect(prisma.user.findMany.mock.calls[0][0].where).toEqual({
        role: Role.EVENT_COORDINATOR,
        id: fatima.id,
      });

      await expect(
        service.listAssignments(lead, lead.userId),
      ).rejects.toBeInstanceOf(BadRequestException);
    });
  });

  describe('reassigning an event', () => {
    beforeEach(() => {
      access.assertEventAccess.mockResolvedValue(assigned());
    });

    it('moves only the coordinator, guarded on the previous one, and records who/from/to', async () => {
      const result = await service.reassign(lead, 'event-1', {
        coordinatorId: fatima.id,
      });

      expect(prisma.eventRequest.update).toHaveBeenCalledWith({
        where: { id: 'event-1', coordinatorId: marcus.id },
        data: { coordinatorId: fatima.id },
      });
      expect(events.recordChange).toHaveBeenCalledWith(
        prisma,
        'event-1',
        lead.userId,
        [{ field: 'coordinator', previous: 'Marcus', next: 'Fatima' }],
        [],
      );
      expect(result.status).toBe(EventStatus.PLANNING);
    });

    it('notifies both the previous and the new Coordinator', async () => {
      await service.reassign(lead, 'event-1', { coordinatorId: fatima.id });

      const calls = notifications.notifySafely.mock.calls.map(([n]) => n);
      expect(calls).toHaveLength(2);
      expect(calls).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            recipientId: marcus.id,
            type: NotificationType.EVENT_REASSIGNED,
          }),
          expect.objectContaining({
            recipientId: fatima.id,
            type: NotificationType.EVENT_REASSIGNED,
          }),
        ]),
      );
    });

    it('blocks reassigning to the current Coordinator', async () => {
      await expect(
        service.reassign(lead, 'event-1', { coordinatorId: marcus.id }),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.eventRequest.update).not.toHaveBeenCalled();
    });

    it.each([EventStatus.COMPLETED, EventStatus.CANCELLED, EventStatus.REJECTED])(
      'blocks a %s event',
      async (status) => {
        access.assertEventAccess.mockResolvedValue(assigned({ status }));

        await expect(
          service.reassign(lead, 'event-1', { coordinatorId: fatima.id }),
        ).rejects.toBeInstanceOf(ConflictException);
        expect(prisma.eventRequest.update).not.toHaveBeenCalled();
      },
    );

    it('points an unassigned request back to the queue', async () => {
      access.assertEventAccess.mockResolvedValue(queued());

      await expect(
        service.reassign(lead, 'event-1', { coordinatorId: fatima.id }),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it('does not notify or record when someone else reassigned first', async () => {
      prisma.eventRequest.update.mockRejectedValue(noRowMatched());

      await expect(
        service.reassign(lead, 'event-1', { coordinatorId: fatima.id }),
      ).rejects.toBeInstanceOf(ConflictException);
      expect(events.recordChange).not.toHaveBeenCalled();
      expect(notifications.notifySafely).not.toHaveBeenCalled();
    });
  });
});
