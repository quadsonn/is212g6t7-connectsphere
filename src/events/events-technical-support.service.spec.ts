import { ConflictException, ForbiddenException } from '@nestjs/common';
import { EventRequest, EventStatus, Role } from '@prisma/client';

import { AuthenticatedUser } from '../auth/jwt.strategy';
import { AccessControlService } from '../common/access/access-control.service';
import { PrismaService } from '../prisma/prisma.service';
import { EventsService } from './events.service';
import { EventsTechnicalSupportService } from './events-technical-support.service';

/**
 * US-61 — the paths the integration tests cannot build: a Coordinator who can
 * see the event but is not assigned to it (the access layer refuses them with
 * 404 first), an event with no dates (the completeness CHECK forbids it once
 * submitted), and conflicts on events with no name or no dates. Everything
 * else is proven end to end in test/us61-technical-support-assignment.e2e-spec.ts.
 */
describe('US-61 EventsTechnicalSupportService edge cases', () => {
  const carla = { userId: 'USR-039', role: Role.EVENT_COORDINATOR } as AuthenticatedUser;
  const townHall = {
    id: 'EVT-304',
    name: 'Town Hall',
    status: EventStatus.PLANNING,
    coordinatorId: 'USR-039',
    technicalSupportNeeds: 'On-site AV technician',
    technicalSupportId: null,
    proposedStart: new Date('2030-10-01T10:00:00Z'),
    proposedEnd: new Date('2030-10-01T12:00:00Z'),
  } as unknown as EventRequest;
  const wei = { id: 'USR-042', name: 'Wei Technical', email: 'wei.t@example.com' };

  const build = (event: EventRequest, { assigned = true, weiEvents = [] as unknown[] } = {}) => {
    const db = {
      $queryRaw: jest.fn().mockResolvedValue([]),
      eventRequest: { findUniqueOrThrow: jest.fn().mockResolvedValue(event) },
      user: {
        findUnique: jest.fn().mockResolvedValue({ ...wei, role: Role.TECHNICAL_SUPPORT_STAFF }),
        // Nadia is free, so "nobody available" does not take over.
        findMany: jest.fn().mockResolvedValue([
          { id: 'USR-043', name: 'Nadia Technical', email: 'nadia.t@example.com', technicalSupportEvents: [] },
          { ...wei, technicalSupportEvents: weiEvents },
        ]),
      },
    };
    const prisma = { ...db, $transaction: jest.fn((fn) => fn(db)) };
    const access = {
      assertEventAccess: jest.fn().mockResolvedValue(event),
      isAssignedCoordinator: jest.fn().mockReturnValue(assigned),
    };
    const service = new EventsTechnicalSupportService(
      prisma as unknown as PrismaService,
      access as unknown as AccessControlService,
      { recordChange: jest.fn() } as unknown as EventsService,
    );
    return { service, db };
  };

  // TC-S4-76 · US-61 AC-1 · setup: none (unit) · fails if a Coordinator who is not assigned to the event can read or change its assignment
  // Code: EventsTechnicalSupportService.assertAssignedCoordinator
  it('refuses a Coordinator who is not assigned to the event (403)', async () => {
    const { service } = build(townHall, { assigned: false });

    await expect(service.getAssignment(carla, 'EVT-304')).rejects.toThrow(ForbiddenException);
    await expect(service.assign(carla, 'EVT-304', { staffId: wei.id })).rejects.toThrow(ForbiddenException);
  });

  // TC-S4-76 · US-61 AC-1 · setup: none (unit) · fails if an event with no date breaks the screen, or can be assigned
  // Code: buildView (no window: no staff listed); assertCanAssign (no date and time)
  it('lists nobody for an event with no date, and refuses to assign for it', async () => {
    const undated = { ...townHall, proposedStart: null, proposedEnd: null } as unknown as EventRequest;
    const { service, db } = build(undated);

    await expect(service.getAssignment(carla, 'EVT-304')).resolves.toMatchObject({ staff: [] });
    expect(db.user.findMany).not.toHaveBeenCalled();
    await expect(service.assign(carla, 'EVT-304', { staffId: wei.id })).rejects.toThrow(
      new ConflictException('the event has no date and time to assign for'),
    );
  });

  // TC-S4-77 · US-61 AC-2 · setup: none (unit) · fails if a clash with an unnamed event cannot be named, or an assigned event with no dates counts as a clash
  // Code: EventsTechnicalSupportService.assign (conflict message name fallback); staffOptions (events without dates ignored)
  it('names an unnamed overlapping event as "an event", and ignores assigned events with no dates', async () => {
    const { service } = build(townHall, {
      weiEvents: [
        { id: 'EVT-1', name: null, proposedStart: new Date('2030-10-01T11:00:00Z'), proposedEnd: new Date('2030-10-01T13:00:00Z') },
        { id: 'EVT-2', name: 'Undated', proposedStart: null, proposedEnd: null },
      ],
    });

    const error = await service.assign(carla, 'EVT-304', { staffId: wei.id }).catch((e) => e);

    expect(error).toBeInstanceOf(ConflictException);
    expect(error.getResponse().message).toMatch(/^Wei Technical is already assigned to "an event" \(/);
    expect(error.getResponse().conflicts.map((c: { eventId: string }) => c.eventId)).toEqual(['EVT-1']);
  });
});
