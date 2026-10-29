import { ConflictException, NotFoundException } from '@nestjs/common';
import { EventRequest, EventStatus, Role, SafetyOutcome } from '@prisma/client';

import { AuthenticatedUser } from '../auth/jwt.strategy';
import { BookingsService } from '../bookings/bookings.service';
import { AccessControlService } from '../common/access/access-control.service';
import { EventsService } from '../events/events.service';
import { NotificationsService } from '../notifications/notifications.service';
import { SafetyCheckNotifier } from '../notifications/safety-check-notifier.service';
import { PrismaService } from '../prisma/prisma.service';
import { SafetyDecisionDto } from './dto/safety-decision.dto';
import { SafetyReadinessService } from './safety-readiness.service';
import { SafetyService } from './safety.service';

/**
 * US-57 — the SafetyService paths the real app cannot reach through HTTP: a
 * venue or event with missing numbers, a block row without its block, a
 * decision the DTO would normally have completed, and races between the
 * checks and the lock. Everything reachable is proven end to end in
 * test/safety-check.e2e-spec.ts.
 */
describe('US-57 SafetyService failure and fallback paths', () => {
  const officer = { userId: 'officer-1', role: Role.SAFETY_OFFICER } as AuthenticatedUser;
  const coordinator = { userId: 'coord-1', role: Role.EVENT_COORDINATOR } as AuthenticatedUser;

  const waiting = {
    id: 'event-1',
    name: 'Careers Fair',
    status: EventStatus.AWAITING_SAFETY_CHECK,
    coordinatorId: 'coord-1',
  } as EventRequest;

  const build = () => {
    const tx = {
      $queryRaw: jest.fn().mockResolvedValue([{ id: 'event-1' }]),
      eventRequest: { findUniqueOrThrow: jest.fn().mockResolvedValue(waiting) },
      safetyReview: {
        create: jest.fn().mockImplementation(({ data }) => Promise.resolve({ id: 'SFR-001', ...data })),
      },
    };
    const prisma = {
      $transaction: jest.fn().mockImplementation((fn) => fn(tx)),
      eventRequest: { findFirst: jest.fn() },
    };
    const access = { requireScope: jest.fn(), assertEventAccess: jest.fn().mockResolvedValue(waiting) };
    const events = { setStatus: jest.fn().mockResolvedValue({}) };
    const bookings = { findOverlappingBlocks: jest.fn().mockResolvedValue([]) };
    const readiness = {
      evaluate: jest.fn().mockResolvedValue({ ready: true, reasons: [] }),
      syncEvent: jest.fn(),
    };
    const notifications = { notifySafely: jest.fn() };

    const service = new SafetyService(
      prisma as unknown as PrismaService,
      access as unknown as AccessControlService,
      events as unknown as EventsService,
      bookings as unknown as BookingsService,
      readiness as unknown as SafetyReadinessService,
      notifications as unknown as NotificationsService,
      { notifyCheckDue: jest.fn() } as unknown as SafetyCheckNotifier,
    );
    return { service, prisma, tx, events, bookings, readiness, notifications };
  };

  const decision = (dto: Partial<SafetyDecisionDto>) => dto as SafetyDecisionDto;

  // TC-S3-178 · US-57 AC-2 · setup: none (unit) · fails if the review breaks on a venue or event with no capacity or attendance, or on a block row without its block
  // Code: SafetyService.getPacket (capacityMargin, blocks)
  it('shows no capacity margin when a number is missing, and only real blocks, each with a reason', async () => {
    const { service, prisma, bookings } = build();
    const venue = { id: 'VEN-1', name: 'Hall', capacity: null };
    const booking = { id: 'BKG-1', venueId: 'VEN-1', start: new Date(), end: new Date(), venue };
    prisma.eventRequest.findFirst.mockResolvedValue({
      ...waiting,
      expectedAttendance: null,
      venueBookings: [booking, { ...booking, id: 'BKG-2', venue: { ...venue, capacity: 200 } }],
      equipmentRequirements: [],
      equipmentReservations: [],
      safetyReviews: [],
    });
    const at = new Date('2030-10-01T10:00:00Z');
    bookings.findOverlappingBlocks.mockResolvedValue([
      { blockId: null, start: null, end: null, reason: null },
      { blockId: 'BLK-1', start: at, end: at, reason: null },
    ]);

    const packet = await service.getPacket(officer, 'event-1');

    expect(packet.venues.map((v) => v.capacityMargin)).toEqual([null, null]);
    expect(packet.venues[0].blocks).toEqual([{ id: 'BLK-1', start: at, end: at, reason: '' }]);
  });

  // TC-S3-180 · US-57 AC-4 · setup: none (unit) · fails if a decision is recorded on arrangements that stopped being confirmed after the queue was read
  // Code: SafetyService.decide (readiness re-checked under the lock)
  it('refuses a decision once the arrangements are no longer ready, recording nothing', async () => {
    const { service, tx, readiness, events } = build();
    readiness.evaluate.mockResolvedValue({ ready: false, reasons: ['VENUE_BOOKING_PENDING'] });

    await expect(service.decide(officer, 'event-1', decision({ outcome: SafetyOutcome.APPROVED }))).rejects.toThrow(
      ConflictException,
    );
    expect(tx.safetyReview.create).not.toHaveBeenCalled();
    expect(events.setStatus).not.toHaveBeenCalled();
  });

  // TC-S3-180, TC-S3-182 · US-57 AC-4, AC-6 · setup: none (unit) · fails if a decision without a reason or stage stores anything but null for them
  // Code: SafetyService.decide (reason ?? null, returnStage ?? null)
  it('stores a missing reason or stage as none', async () => {
    const { service, tx } = build();

    await service.decide(officer, 'event-1', decision({ outcome: SafetyOutcome.CHANGES_REQUESTED }));

    expect(tx.safetyReview.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ reason: null, returnStage: null }) }),
    );
  });

  // TC-S3-181 · US-57 AC-5 · setup: none (unit) · fails if deciding on an event with no Coordinator crashes or notifies someone
  // Code: SafetyService.notifyCoordinator (no Coordinator)
  it('records the decision and notifies no one when the event has no Coordinator', async () => {
    const { service, tx, notifications } = build();
    tx.eventRequest.findUniqueOrThrow.mockResolvedValue({ ...waiting, coordinatorId: null });

    await expect(
      service.decide(officer, 'event-1', decision({ outcome: SafetyOutcome.APPROVED })),
    ).resolves.toMatchObject({ outcome: SafetyOutcome.APPROVED });
    expect(notifications.notifySafely).not.toHaveBeenCalled();
  });

  // TC-S3-185 · US-57 AC-9 · setup: none (unit) · fails if a resubmit for an event that disappears after the access check does not return 404
  // Code: SafetyService.resubmit (locked row)
  it('refuses a resubmit when the event is gone by the time it is locked', async () => {
    const { service, tx, events } = build();
    tx.$queryRaw.mockResolvedValue([]);

    await expect(service.resubmit(coordinator, 'event-1')).rejects.toThrow(NotFoundException);
    expect(events.setStatus).not.toHaveBeenCalled();
  });
});
