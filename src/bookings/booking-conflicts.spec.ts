import { ConflictException } from '@nestjs/common';
import { BookingStatus, Prisma, Role } from '@prisma/client';

import { AccessControlService } from '../common/access/access-control.service';
import { Scope } from '../common/access/permission.types';
import { AuthenticatedUser } from '../auth/jwt.strategy';
import { NotificationsService } from '../notifications/notifications.service';
import { PrismaService } from '../prisma/prisma.service';
import { classifyConflicts, HARD_CONFLICT_CODE } from './booking.types';
import { BookingsService } from './bookings.service';

/** US-24 — classifying overlaps, and the database backstop's error mapping. */
describe('US-24 overlapping booking detection', () => {
  const at = (hour: number) => new Date(`2030-10-01T${String(hour).padStart(2, '0')}:00:00Z`);
  const row = (id: string, status: BookingStatus, from = 9, to = 12) => ({
    id,
    status,
    eventName: `Event ${id}`,
    start: at(from),
    end: at(to),
  });

  describe('classifyConflicts', () => {
    it('US-24 AC-2: an APPROVED overlap is a hard conflict', () => {
      const report = classifyConflicts('self', [row('a', BookingStatus.APPROVED)], []);

      expect(report.hardConflicts).toEqual([
        { bookingId: 'a', eventName: 'Event a', start: at(9), end: at(12) },
      ]);
      expect(report.softConflicts).toEqual([]);
      expect(report.hasHardConflict).toBe(true);
    });

    it('US-24 AC-3: a REQUESTED overlap is only a soft conflict', () => {
      const report = classifyConflicts('self', [row('p', BookingStatus.REQUESTED)], []);

      expect(report.softConflicts.map((c) => c.bookingId)).toEqual(['p']);
      expect(report.hardConflicts).toEqual([]);
      expect(report.hasHardConflict).toBe(false);
    });

    it('US-24: ignores REJECTED bookings', () => {
      const report = classifyConflicts('self', [row('r', BookingStatus.REJECTED)], []);

      expect(report).toEqual({ hardConflicts: [], softConflicts: [], blocks: [], hasHardConflict: false });
    });

    it('US-24: never reports the booking being checked against itself', () => {
      const report = classifyConflicts(
        'self',
        [row('self', BookingStatus.APPROVED), row('other', BookingStatus.REQUESTED)],
        [],
      );

      expect(report.hardConflicts).toEqual([]);
      expect(report.softConflicts.map((c) => c.bookingId)).toEqual(['other']);
    });

    it('US-24: hard outranks soft — a hard conflict is reported even alongside soft ones', () => {
      const report = classifyConflicts(
        'self',
        [row('p', BookingStatus.REQUESTED), row('a', BookingStatus.APPROVED)],
        [],
      );

      expect(report.hasHardConflict).toBe(true);
      expect(report.hardConflicts.map((c) => c.bookingId)).toEqual(['a']);
      expect(report.softConflicts.map((c) => c.bookingId)).toEqual(['p']);
    });

    it('US-24: a blocked-out period (US-16) counts as hard', () => {
      const report = classifyConflicts('self', [], [
        { blockId: 'b', reason: 'Maintenance', start: at(9), end: at(12) },
      ]);

      expect(report.hasHardConflict).toBe(true);
      expect(report.blocks.map((b) => b.blockId)).toEqual(['b']);
    });

    it('US-24: a proposed slot (no booking yet) excludes nothing', () => {
      const report = classifyConflicts(null, [row('a', BookingStatus.APPROVED)], []);

      expect(report.hardConflicts).toHaveLength(1);
    });
  });

  describe('database backstop (SQLSTATE 23P01)', () => {
    const staff: AuthenticatedUser = { userId: 'staff-1', role: Role.VENUE_STAFF, jti: 'j' };
    const booking = { id: 'b1', venueId: 'v1', start: at(9), end: at(12), status: BookingStatus.REQUESTED };

    const exclusionError = () =>
      new Prisma.PrismaClientUnknownRequestError(
        'PostgresError { code: "23P01", message: "conflicting key value violates exclusion constraint \\"VenueBooking_no_overlapping_approved\\"" }',
        { clientVersion: 'test' },
      );

    const service = (transactionError: unknown) => {
      const prisma = {
        venueBooking: {
          findFirst: jest.fn().mockResolvedValue(booking),
          findUniqueOrThrow: jest.fn().mockResolvedValue(booking),
          // What the fresh report sees after losing the race.
          findMany: jest.fn().mockResolvedValue([
            { ...row('winner', BookingStatus.APPROVED), event: { name: 'Winner' } },
          ]),
        },
        venueBlock: { findMany: jest.fn().mockResolvedValue([]) },
        // US-50: the venue's buffers; none configured.
        venue: { findUnique: jest.fn().mockResolvedValue(null) },
        $transaction: jest.fn().mockRejectedValue(transactionError),
      };
      return new BookingsService(
        prisma as unknown as PrismaService,
        { requireScope: jest.fn().mockReturnValue(Scope.ANY) } as unknown as AccessControlService,
        { notifySafely: jest.fn() } as unknown as NotificationsService,
      );
    };

    it('US-24: turns an exclusion violation into the hard-conflict 409, not a 500', async () => {
      const error = await service(exclusionError())
        .approve(staff, 'b1', {})
        .catch((e: unknown) => e);

      expect(error).toBeInstanceOf(ConflictException);
      const body = (error as ConflictException).getResponse() as Record<string, unknown>;
      expect(body.code).toBe(HARD_CONFLICT_CODE);
      expect((body.report as { hardConflicts: { bookingId: string }[] }).hardConflicts[0].bookingId).toBe(
        'winner',
      );
    });

    it('US-24: leaves any other database error alone', async () => {
      const other = new Prisma.PrismaClientUnknownRequestError('something else', { clientVersion: 'test' });

      await expect(service(other).approve(staff, 'b1', {})).rejects.toBe(other);
    });
  });
});
