import { BadRequestException } from '@nestjs/common';
import { BookingStatus, Role } from '@prisma/client';

import { AuthenticatedUser } from '../auth/jwt.strategy';
import { AccessControlService } from '../common/access/access-control.service';
import { PrismaService } from '../prisma/prisma.service';
import { BookingsService } from './bookings.service';
import { HoldNotifier } from './hold-notifier';
import { HoldsService } from './holds.service';

jest.mock('./hold-expiry', () => ({
  ...jest.requireActual('./hold-expiry'),
  releaseExpiredHolds: jest.fn().mockResolvedValue([]),
}));

/**
 * US-54 AC-2 — the service checks the expiry again for callers that skip the
 * DTO (whose @MinDate normally refuses a past expiry first, tested end to end
 * in test/us54-venue-holds.e2e-spec.ts).
 */
describe('US-54 HoldsService expiry rule without the DTO', () => {
  const staff = { userId: 'USR-010', role: Role.VENUE_STAFF } as AuthenticatedUser;
  const hold = {
    id: 'BKG-1',
    venueId: 'VEN-1',
    eventId: 'EVT-1',
    status: BookingStatus.HELD,
    holdExpiresAt: new Date(Date.now() + 48 * 3_600_000),
    start: new Date('2030-10-01T18:00:00Z'),
  };

  // TC-S3-153 · US-54 AC-2 · setup: none (unit) · fails if the service accepts a past expiry when the DTO is skipped
  // Code: HoldsService.extend -> assertExpiry (expiresAt <= now)
  it('refuses to extend a hold to a time in the past, changing nothing', async () => {
    const tx = {
      venueBooking: { findUniqueOrThrow: jest.fn().mockResolvedValue(hold), update: jest.fn() },
      eventRequest: { findUniqueOrThrow: jest.fn().mockResolvedValue({ proposedStart: hold.start }) },
    };
    const prisma = {
      venueBooking: { findFirst: jest.fn().mockResolvedValue(hold) },
      $transaction: jest.fn((cb) => cb(tx)),
    };
    const service = new HoldsService(
      prisma as unknown as PrismaService,
      { requireScope: jest.fn() } as unknown as AccessControlService,
      { lockVenue: jest.fn() } as unknown as BookingsService,
      {} as HoldNotifier,
    );

    await expect(service.extend(staff, 'BKG-1', { expiresAt: new Date(Date.now() - 60_000) })).rejects.toThrow(
      new BadRequestException('expiresAt must be in the future'),
    );
    expect(tx.venueBooking.update).not.toHaveBeenCalled();
  });
});
