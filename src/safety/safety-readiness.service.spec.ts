import { ConflictException } from '@nestjs/common';
import { BookingStatus, EventStatus } from '@prisma/client';

import { ArrangementsRegistry } from '../common/arrangements/arrangements.registry';
import { EventsService } from '../events/events.service';
import { PrismaService } from '../prisma/prisma.service';
import { SafetyReadinessService } from './safety-readiness.service';

/**
 * US-57 AC-1 — the way out of the Safety queue when arrangements stop being
 * ready, for the paths the real app cannot reach through HTTP: a venue with no
 * name, and a status change that loses a race or fails. The normal way out is
 * proven end to end in test/safety-check.e2e-spec.ts.
 */
describe('US-57 SafetyReadinessService failure and fallback paths', () => {
  const build = () => {
    const prisma = {
      eventRequest: {
        findUnique: jest.fn().mockResolvedValue({ id: 'event-1', status: EventStatus.AWAITING_SAFETY_CHECK }),
      },
      // One booking, still pending, at a venue with no name: not ready.
      venueBooking: {
        findMany: jest
          .fn()
          .mockResolvedValue([
            { status: BookingStatus.REQUESTED, needsReview: false, holdExpiresAt: null, venue: { name: null } },
          ]),
      },
      equipmentRequirement: { findMany: jest.fn().mockResolvedValue([]) },
      equipmentReservation: { findMany: jest.fn().mockResolvedValue([]) },
    };
    const events = { setStatus: jest.fn().mockResolvedValue({}) };
    const service = new SafetyReadinessService(
      prisma as unknown as PrismaService,
      events as unknown as EventsService,
      { register: jest.fn() } as unknown as ArrangementsRegistry,
    );
    return { service, prisma, events };
  };

  // TC-S3-177 · US-57 AC-1 · setup: none (unit) · fails if a booking at a venue with no name breaks the readiness check
  // Code: SafetyReadinessService.loadFacts (venue name fallback, default client)
  it('names a venue with no name, reading from its own database client by default', async () => {
    const { service } = build();

    const facts = await service.loadFacts('event-1');

    expect(facts.bookings[0].venueName).toBe('an unnamed venue');
  });

  // TC-S3-177 · US-57 AC-1 · setup: none (unit) · fails if losing the race to another status change is treated as an error
  // Code: SafetyReadinessService.syncEvent (ConflictException swallowed)
  it('leaves the event as someone else moved it when the status change loses a race', async () => {
    const { service, events } = build();
    events.setStatus.mockRejectedValue(new ConflictException('already moved'));

    await expect(service.syncEvent('event-1')).resolves.toBeUndefined();
    expect(events.setStatus).toHaveBeenCalledWith(expect.objectContaining({ id: 'event-1' }), EventStatus.PLANNING);
  });

  // TC-S3-177 · US-57 AC-1 · setup: none (unit) · fails if a database failure while taking an event out of the queue is swallowed
  // Code: SafetyReadinessService.syncEvent (rethrows anything but a conflict)
  it('lets an unexpected failure through', async () => {
    const { service, events } = build();
    events.setStatus.mockRejectedValue(new Error('connection lost'));

    await expect(service.syncEvent('event-1')).rejects.toThrow('connection lost');
  });
});
