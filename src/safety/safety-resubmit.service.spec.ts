import { ConflictException } from '@nestjs/common';
import { EventRequest, EventStatus, Role, SafetyOutcome } from '@prisma/client';

import { AuthenticatedUser } from '../auth/jwt.strategy';
import { BookingsService } from '../bookings/bookings.service';
import { AccessControlService } from '../common/access/access-control.service';
import { EventsService } from '../events/events.service';
import { NotificationsService } from '../notifications/notifications.service';
import { SafetyCheckNotifier } from '../notifications/safety-check-notifier.service';
import { PrismaService } from '../prisma/prisma.service';
import { SafetyReadinessService } from './safety-readiness.service';
import { SafetyService } from './safety.service';

/**
 * US-64 — the second way into AWAITING_SAFETY_CHECK: the Coordinator sends the
 * event back after the Safety Officer asked for changes. Only the alert is
 * tested here; the resubmission rules themselves are covered end to end in
 * test/safety-check.e2e-spec.ts.
 */
describe('US-64 SafetyService.resubmit alerts the Safety Officers', () => {
  const coordinator = { userId: 'coord-1', role: Role.EVENT_COORDINATOR } as AuthenticatedUser;

  const event = {
    id: 'event-1',
    name: 'Careers Fair',
    status: EventStatus.PLANNING,
    coordinatorId: 'coord-1',
    proposedStart: new Date('2026-11-13T02:00:00Z'),
  } as EventRequest;

  const build = () => {
    const tx = {
      $queryRaw: jest.fn().mockResolvedValue([{ id: 'event-1' }]),
      eventRequest: { findUniqueOrThrow: jest.fn().mockResolvedValue(event) },
      safetyReview: {
        // Unanswered feedback, two hours old.
        findFirst: jest.fn().mockResolvedValue({
          id: 'SFR-001',
          outcome: SafetyOutcome.CHANGES_REQUESTED,
          resubmittedAt: null,
          createdAt: new Date(Date.now() - 2 * 60 * 60 * 1000),
        }),
        update: jest.fn().mockResolvedValue({}),
      },
      // One planning edit since the review, so something has changed.
      eventChange: { count: jest.fn().mockResolvedValue(1) },
      venueBooking: { count: jest.fn().mockResolvedValue(0) },
      bookingDecision: { count: jest.fn().mockResolvedValue(0) },
      equipmentReservation: { count: jest.fn().mockResolvedValue(0) },
      equipmentRequirement: { count: jest.fn().mockResolvedValue(0) },
    };
    const prisma = { $transaction: jest.fn().mockImplementation((fn) => fn(tx)) };
    const access = { requireScope: jest.fn(), assertEventAccess: jest.fn().mockResolvedValue(event) };
    const events = {
      setStatus: jest.fn().mockResolvedValue({ ...event, status: EventStatus.AWAITING_SAFETY_CHECK }),
    };
    const readiness = { evaluate: jest.fn().mockResolvedValue({ ready: true, reasons: [] }) };
    const safetyChecks = { notifyCheckDue: jest.fn().mockResolvedValue(2) };

    const service = new SafetyService(
      prisma as unknown as PrismaService,
      access as unknown as AccessControlService,
      events as unknown as EventsService,
      {} as BookingsService,
      readiness as unknown as SafetyReadinessService,
      { notifySafely: jest.fn() } as unknown as NotificationsService,
      safetyChecks as unknown as SafetyCheckNotifier,
    );
    return { service, tx, events, safetyChecks };
  };

  it('Given unanswered feedback and a changed plan, When the Coordinator resubmits, Then every Safety Officer is alerted', async () => {
    const { service, safetyChecks } = build();

    await expect(service.resubmit(coordinator, 'event-1')).resolves.toEqual({
      eventStatus: EventStatus.AWAITING_SAFETY_CHECK,
    });
    expect(safetyChecks.notifyCheckDue).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'event-1', status: EventStatus.AWAITING_SAFETY_CHECK }),
    );
  });

  it('Given nothing changed since the review, When the Coordinator resubmits, Then it is refused and nobody is alerted', async () => {
    const { service, tx, safetyChecks } = build();
    tx.eventChange.count.mockResolvedValue(0);

    await expect(service.resubmit(coordinator, 'event-1')).rejects.toThrow(ConflictException);
    expect(safetyChecks.notifyCheckDue).not.toHaveBeenCalled();
  });

  it('Given the resubmission transaction rolls back, Then nobody is alerted', async () => {
    const { service, events, safetyChecks } = build();
    events.setStatus.mockRejectedValue(new Error('write failed; transaction rolled back'));

    await expect(service.resubmit(coordinator, 'event-1')).rejects.toThrow('rolled back');
    expect(safetyChecks.notifyCheckDue).not.toHaveBeenCalled();
  });
});
