import { ConflictException, NotFoundException } from '@nestjs/common';
import { BookingDecisionKind, BookingStatus, Role } from '@prisma/client';

import { AuthenticatedUser } from '../auth/jwt.strategy';
import { AccessControlService } from '../common/access/access-control.service';
import { Scope } from '../common/access/permission.types';
import { PrismaService } from '../prisma/prisma.service';
import { BookingReviewService } from './booking-review.service';

/** US-51 — flagging, re-checking and resolving "Conflict - needs review". */
describe('BookingReviewService (US-51)', () => {
  const at = (time: string) => new Date(`2030-10-01T${time}:00Z`);
  const NOW = at('08:00');

  let db: {
    venueBooking: { findMany: jest.Mock; findFirst: jest.Mock; update: jest.Mock; updateMany: jest.Mock };
    venue: { findUniqueOrThrow: jest.Mock };
    bookingDecision: { create: jest.Mock };
    $executeRaw: jest.Mock;
    $transaction: jest.Mock;
  };
  let service: BookingReviewService;

  const manager: AuthenticatedUser = { userId: 'staff-1', role: Role.VENUE_STAFF, jti: 'j1' };

  const row = (id: string, start: string, end: string, extra: Record<string, unknown> = {}) => ({
    id,
    start: at(start),
    end: at(end),
    status: BookingStatus.APPROVED,
    needsReview: false,
    event: { name: `Event ${id}` },
    ...extra,
  });

  beforeEach(() => {
    db = {
      venueBooking: {
        findMany: jest.fn().mockResolvedValue([]),
        findFirst: jest.fn(),
        update: jest.fn().mockResolvedValue({}),
        updateMany: jest.fn().mockResolvedValue({ count: 0 }),
      },
      venue: { findUniqueOrThrow: jest.fn().mockResolvedValue({ setupMinutes: 30, turnaroundMinutes: 45 }) },
      bookingDecision: { create: jest.fn() },
      $executeRaw: jest.fn(),
      $transaction: jest.fn(),
    };
    db.$transaction.mockImplementation((run: (tx: typeof db) => unknown) => run(db));

    service = new BookingReviewService(
      db as unknown as PrismaService,
      { requireScope: jest.fn().mockReturnValue(Scope.ANY) } as unknown as AccessControlService,
    );
  });

  describe('previewBufferChange', () => {
    it('US-51 AC-1/AC-2: loads the venue\'s live, unfinished bookings in one query', async () => {
      await service.previewBufferChange(db as never, 'venue-1', { setupMinutes: 0, turnaroundMinutes: 0 }, { setupMinutes: 30, turnaroundMinutes: 45 }, NOW);

      expect(db.venueBooking.findMany).toHaveBeenCalledTimes(1);
      expect(db.venueBooking.findMany.mock.calls[0][0].where).toEqual({
        venueId: 'venue-1',
        // US-54: a hold counts only until it expires.
        OR: [
          { status: { in: [BookingStatus.REQUESTED, BookingStatus.APPROVED] } },
          { status: BookingStatus.HELD, holdExpiresAt: { gt: NOW } },
        ],
        end: { gt: NOW },
      });
    });

    it('US-51 AC-3: returns each clash with the booking it clashes with', async () => {
      db.venueBooking.findMany.mockResolvedValue([row('a', '10:00', '12:00'), row('b', '12:30', '14:00')]);

      const clashes = await service.previewBufferChange(
        db as never,
        'venue-1',
        { setupMinutes: 0, turnaroundMinutes: 0 },
        { setupMinutes: 30, turnaroundMinutes: 45 },
        NOW,
      );

      expect(clashes.map((c) => [c.bookingId, c.clashesWith.bookingId])).toEqual([
        ['a', 'b'],
        ['b', 'a'],
      ]);
    });
  });

  describe('flag', () => {
    it('US-51 AC-5/AC-6: sets only the review fields — never start, end or status', async () => {
      db.venueBooking.findMany.mockResolvedValue([row('a', '10:00', '12:00'), row('b', '12:30', '14:00')]);
      const clashes = await service.previewBufferChange(
        db as never,
        'venue-1',
        { setupMinutes: 0, turnaroundMinutes: 0 },
        { setupMinutes: 30, turnaroundMinutes: 45 },
        NOW,
      );

      const flagged = await service.flag(db as never, clashes, { setupMinutes: 30, turnaroundMinutes: 45 }, NOW);

      expect(flagged).toBe(2);
      for (const [{ data }] of db.venueBooking.update.mock.calls) {
        expect(Object.keys(data).sort()).toEqual(
          ['flaggedAt', 'needsReview', 'needsReviewReason', 'reviewResolvedAt', 'reviewResolvedById'].sort(),
        );
        expect(data.needsReview).toBe(true);
        expect(data.needsReviewReason).toMatch(/30\/45/);
      }
    });
  });

  describe('recheckReviewFlags', () => {
    it('US-51: clears a flag that no longer clashes and keeps one that still does', async () => {
      db.venueBooking.findMany
        // flagged bookings on the venue
        .mockResolvedValueOnce([
          row('a', '10:00', '12:00', { needsReview: true }),
          row('lonely', '18:00', '19:00', { needsReview: true }),
        ])
        // live, unfinished bookings on the venue
        .mockResolvedValueOnce([row('a', '10:00', '12:00'), row('b', '12:30', '14:00'), row('lonely', '18:00', '19:00')]);

      const cleared = await service.recheckReviewFlags('venue-1', db as never, NOW);

      expect(cleared).toEqual(['lonely']);
      expect(db.venueBooking.updateMany).toHaveBeenCalledWith({
        where: { id: { in: ['lonely'] } },
        data: { needsReview: false, reviewResolvedAt: NOW, reviewResolvedById: null },
      });
    });

    it('US-51: clears the flag on a booking that is no longer live', async () => {
      db.venueBooking.findMany
        .mockResolvedValueOnce([row('a', '10:00', '12:00', { needsReview: true, status: BookingStatus.REJECTED })])
        .mockResolvedValueOnce([row('b', '12:30', '14:00')]);

      expect(await service.recheckReviewFlags('venue-1', db as never, NOW)).toEqual(['a']);
    });

    it('US-51: does nothing when nothing is flagged', async () => {
      expect(await service.recheckReviewFlags('venue-1', db as never, NOW)).toEqual([]);
      expect(db.venueBooking.updateMany).not.toHaveBeenCalled();
    });
  });

  describe('resolveReview', () => {
    it('US-51 AC-5: clears the flag, records who resolved it and writes a BookingDecision', async () => {
      db.venueBooking.findFirst.mockResolvedValue(row('a', '10:00', '12:00', { needsReview: true, venueId: 'venue-1' }));

      await service.resolveReview(manager, 'a', 'Spoke to both organisers', NOW);

      expect(db.venueBooking.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'a' },
          data: { needsReview: false, reviewResolvedAt: NOW, reviewResolvedById: 'staff-1' },
        }),
      );
      expect(db.bookingDecision.create).toHaveBeenCalledWith({
        data: {
          bookingId: 'a',
          decidedById: 'staff-1',
          kind: BookingDecisionKind.REVIEW_RESOLVED,
          outcome: BookingStatus.APPROVED,
          reason: 'Spoke to both organisers',
        },
      });
    });

    it('US-51: a booking on a venue the caller does not manage is not found', async () => {
      db.venueBooking.findFirst.mockResolvedValue(null);

      await expect(service.resolveReview(manager, 'a', null, NOW)).rejects.toThrow(NotFoundException);
      expect(db.bookingDecision.create).not.toHaveBeenCalled();
    });

    it('US-51: a booking that is not flagged cannot be resolved', async () => {
      db.venueBooking.findFirst.mockResolvedValue(row('a', '10:00', '12:00', { venueId: 'venue-1' }));

      await expect(service.resolveReview(manager, 'a', null, NOW)).rejects.toThrow(ConflictException);
    });
  });
});
