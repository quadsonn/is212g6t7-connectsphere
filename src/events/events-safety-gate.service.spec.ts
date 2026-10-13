import { ConflictException } from '@nestjs/common';
import { EventRequest, EventStatus, SafetyOutcome } from '@prisma/client';

import { AccessControlService } from '../common/access/access-control.service';
import { EquipmentReservationsService } from '../equipment/equipment-reservations.service';
import { NotificationsService } from '../notifications/notifications.service';
import { PrismaService } from '../prisma/prisma.service';
import { EventsService } from './events.service';

/**
 * Requirement change 6 — "given the event has no approved safety check, when
 * anyone tries to move it to preparation, then it is blocked".
 *
 * Preparation is CONFIRMED. The state machine has no edge into it except from
 * AWAITING_SAFETY_CHECK; setStatus() then checks the latest review as well, so
 * a path that skipped the machine would still be refused.
 */
describe('EventsService.setStatus → the safety gate', () => {
  let prisma: {
    eventRequest: { update: jest.Mock };
    safetyReview: { findFirst: jest.Mock };
  };
  let service: EventsService;

  const awaiting = {
    id: 'event-1',
    status: EventStatus.AWAITING_SAFETY_CHECK,
  } as EventRequest;

  beforeEach(() => {
    prisma = {
      eventRequest: {
        update: jest.fn().mockImplementation(({ data }) =>
          Promise.resolve({ ...awaiting, ...data }),
        ),
      },
      safetyReview: { findFirst: jest.fn().mockResolvedValue(null) },
    };

    service = new EventsService(
      prisma as unknown as PrismaService,
      {} as AccessControlService,
      {} as NotificationsService,
      {} as EquipmentReservationsService,
    );
  });

  it.each([
    EventStatus.PLANNING,
    EventStatus.AWAITING_ARRANGEMENTS,
    EventStatus.APPROVED,
    EventStatus.SAFETY_REJECTED,
  ])('refuses to confirm an event that is %s, before looking at any review', async (status) => {
    await expect(
      service.setStatus({ ...awaiting, status }, EventStatus.CONFIRMED),
    ).rejects.toThrow(ConflictException);

    expect(prisma.eventRequest.update).not.toHaveBeenCalled();
  });

  it('refuses to confirm an event awaiting its check when it has no review', async () => {
    await expect(
      service.setStatus(awaiting, EventStatus.CONFIRMED),
    ).rejects.toThrow(/without an approved safety check/);

    expect(prisma.eventRequest.update).not.toHaveBeenCalled();
  });

  it.each([SafetyOutcome.REJECTED, SafetyOutcome.CHANGES_REQUESTED])(
    'refuses to confirm when the latest review is %s',
    async (outcome) => {
      prisma.safetyReview.findFirst.mockResolvedValue({ outcome });

      await expect(
        service.setStatus(awaiting, EventStatus.CONFIRMED),
      ).rejects.toThrow(ConflictException);
      expect(prisma.eventRequest.update).not.toHaveBeenCalled();
    },
  );

  it('confirms an event whose latest review is an approval', async () => {
    prisma.safetyReview.findFirst.mockResolvedValue({ outcome: SafetyOutcome.APPROVED });

    const result = await service.setStatus(awaiting, EventStatus.CONFIRMED);

    expect(result.status).toBe(EventStatus.CONFIRMED);
    expect(prisma.safetyReview.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { eventId: 'event-1' },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      }),
    );
  });

  it('stamps when the event entered the Safety queue', async () => {
    await service.setStatus(
      { ...awaiting, status: EventStatus.PLANNING },
      EventStatus.AWAITING_SAFETY_CHECK,
    );

    expect(prisma.eventRequest.update).toHaveBeenCalledWith({
      where: { id: 'event-1' },
      data: {
        status: EventStatus.AWAITING_SAFETY_CHECK,
        safetyQueuedAt: expect.any(Date),
      },
    });
  });
});
