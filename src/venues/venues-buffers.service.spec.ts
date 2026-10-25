import { ConflictException, NotFoundException } from '@nestjs/common';
import { Role, VenueStatus } from '@prisma/client';

import { AccessControlService } from '../common/access/access-control.service';
import { VenueBookingLookup } from '../bookings/booking-impact';
import { BookingReviewService } from '../bookings/booking-review.service';
import { BufferClash } from '../bookings/buffer-clashes';
import { Scope } from '../common/access/permission.types';
import { AuthenticatedUser } from '../auth/jwt.strategy';
import { EventsService } from '../events/events.service';
import { NotificationsService } from '../notifications/notifications.service';
import { PrismaService } from '../prisma/prisma.service';
import { SupabaseStorageService } from '../storage/supabase-storage.service';
import { VenuesService } from './venues.service';
import { EquipmentService } from '../equipment/equipment.service';

/** US-49 — configuring a venue's setup and turnaround time. */
describe('VenuesService updateBuffers (US-49)', () => {
  let prisma: {
    venue: { update: jest.Mock; findUnique: jest.Mock; findUniqueOrThrow: jest.Mock };
    venueBooking: { findMany: jest.Mock };
    $executeRaw: jest.Mock;
    $transaction: jest.Mock;
  };
  let access: { requireScope: jest.Mock };
  let reviews: { previewBufferChange: jest.Mock; flag: jest.Mock };
  let service: VenuesService;

  const clash: BufferClash = {
    bookingId: 'b1',
    eventName: 'Morning lecture',
    start: new Date('2030-10-01T10:00:00Z'),
    end: new Date('2030-10-01T12:00:00Z'),
    clashesWith: {
      bookingId: 'b2',
      eventName: 'Lunch talk',
      start: new Date('2030-10-01T12:30:00Z'),
      end: new Date('2030-10-01T14:00:00Z'),
    },
  };

  const manager: AuthenticatedUser = { userId: 'staff-1', role: Role.VENUE_STAFF, jti: 'j1' };
  const otherStaff: AuthenticatedUser = { userId: 'staff-2', role: Role.VENUE_STAFF, jti: 'j2' };

  const venue = (overrides: Record<string, unknown> = {}) => ({
    id: 'venue-1',
    name: 'Sandbox Auditorium',
    status: VenueStatus.PUBLISHED,
    managedById: 'staff-1',
    setupMinutes: 0,
    turnaroundMinutes: 0,
    ...overrides,
  });

  beforeEach(() => {
    prisma = {
      venue: {
        update: jest.fn().mockImplementation(({ data }) => Promise.resolve(venue(data))),
        findUnique: jest.fn().mockResolvedValue(venue()),
        findUniqueOrThrow: jest.fn().mockResolvedValue({ setupMinutes: 0, turnaroundMinutes: 0 }),
      },
      // US-51: the automatic re-check finds nothing flagged.
      venueBooking: { findMany: jest.fn().mockResolvedValue([]) },
      $executeRaw: jest.fn(),
      $transaction: jest.fn(),
    };
    prisma.$transaction.mockImplementation((run: (tx: typeof prisma) => unknown) => run(prisma));
    access = { requireScope: jest.fn().mockReturnValue(Scope.OWN) };
    reviews = {
      previewBufferChange: jest.fn().mockResolvedValue([]),
      flag: jest.fn().mockResolvedValue(0),
    };

    service = new VenuesService(
      prisma as unknown as PrismaService,
      access as unknown as AccessControlService,
      {} as unknown as VenueBookingLookup,
      {} as unknown as NotificationsService,
      {} as unknown as SupabaseStorageService,
      {} as unknown as EventsService,
      reviews as unknown as BookingReviewService,
      {} as unknown as EquipmentService,
    );
  });

  it('US-49 AC-1/AC-5: the managing Venue Staff saves both values, and they are returned', async () => {
    const result = await service.updateBuffers(manager, 'venue-1', {
      setupMinutes: 30,
      turnaroundMinutes: 45,
    });

    expect(prisma.venue.update).toHaveBeenCalledWith({
      where: { id: 'venue-1' },
      data: { setupMinutes: 30, turnaroundMinutes: 45 },
    });
    expect(result).toMatchObject({ setupMinutes: 30, turnaroundMinutes: 45 });
  });

  it('US-49 AC-1: a draft venue can be configured too', async () => {
    prisma.venue.findUnique.mockResolvedValue(venue({ status: VenueStatus.DRAFT }));

    await service.updateBuffers(manager, 'venue-1', { setupMinutes: 15, turnaroundMinutes: 0 });

    expect(prisma.venue.update).toHaveBeenCalled();
  });

  it('US-49 AC-4: Venue Staff who do not manage the venue see it as not found, and nothing is saved', async () => {
    await expect(
      service.updateBuffers(otherStaff, 'venue-1', { setupMinutes: 30, turnaroundMinutes: 45 }),
    ).rejects.toThrow(NotFoundException);

    expect(prisma.venue.update).not.toHaveBeenCalled();
  });

  it('US-49: a missing venue is not found', async () => {
    prisma.venue.findUnique.mockResolvedValue(null);

    await expect(
      service.updateBuffers(manager, 'nope', { setupMinutes: 30, turnaroundMinutes: 45 }),
    ).rejects.toThrow(NotFoundException);
  });

  describe('US-51: re-checking bookings before saving', () => {
    const proposed = { setupMinutes: 30, turnaroundMinutes: 45 };

    it('US-51 AC-1: compares the current buffers with the proposed ones, under the venue lock', async () => {
      await service.updateBuffers(manager, 'venue-1', proposed);

      expect(prisma.$executeRaw).toHaveBeenCalled();
      expect(reviews.previewBufferChange).toHaveBeenCalledWith(
        prisma,
        'venue-1',
        { setupMinutes: 0, turnaroundMinutes: 0 },
        proposed,
      );
    });

    it('US-51 AC-4: clashes without confirmation are a 409 listing them, and nothing is saved', async () => {
      reviews.previewBufferChange.mockResolvedValue([clash]);

      const error = await service.updateBuffers(manager, 'venue-1', proposed).catch((e: unknown) => e);

      expect(error).toBeInstanceOf(ConflictException);
      expect((error as ConflictException).getResponse()).toMatchObject({ clashes: [clash] });
      expect(prisma.venue.update).not.toHaveBeenCalled();
      expect(reviews.flag).not.toHaveBeenCalled();
    });

    it('US-51 AC-5: confirmed — saves the buffers and flags the clashes', async () => {
      reviews.previewBufferChange.mockResolvedValue([clash]);
      reviews.flag.mockResolvedValue(1);

      const result = await service.updateBuffers(manager, 'venue-1', { ...proposed, confirmConflicts: true });

      expect(prisma.venue.update).toHaveBeenCalledWith({ where: { id: 'venue-1' }, data: proposed });
      expect(reviews.flag).toHaveBeenCalledWith(prisma, [clash], proposed);
      expect(result).toMatchObject({ ...proposed, flagged: 1 });
    });

    it('US-51 AC-7: no clashes — saves and flags nothing', async () => {
      const result = await service.updateBuffers(manager, 'venue-1', proposed);

      expect(prisma.venue.update).toHaveBeenCalled();
      expect(result).toMatchObject({ flagged: 0 });
    });

    it('US-51: preview reports the clashes and saves nothing', async () => {
      reviews.previewBufferChange.mockResolvedValue([clash]);

      expect(await service.previewBuffers(manager, 'venue-1', proposed)).toEqual({ clashes: [clash] });
      expect(prisma.venue.update).not.toHaveBeenCalled();
    });

    it('US-51: other Venue Staff cannot preview (not found)', async () => {
      await expect(service.previewBuffers(otherStaff, 'venue-1', proposed)).rejects.toThrow(NotFoundException);
      expect(reviews.previewBufferChange).not.toHaveBeenCalled();
    });
  });
});
