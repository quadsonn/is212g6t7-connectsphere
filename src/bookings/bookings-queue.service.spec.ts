import { ForbiddenException } from '@nestjs/common';
import { BookingStatus, Role } from '@prisma/client';

import { AccessControlService } from '../common/access/access-control.service';
import { Action, Resource, Scope } from '../common/access/permission.types';
import { AuthenticatedUser } from '../auth/jwt.strategy';
import { NotificationsService } from '../notifications/notifications.service';
import { PrismaService } from '../prisma/prisma.service';
import { BookingsService } from './bookings.service';
import { QueueSortField, QueueView } from './dto/booking-queue-query.dto';

/** US-22 — Venue Booking Request Queue. */
describe('BookingsService findQueue (US-22)', () => {
  let prisma: { venueBooking: { findMany: jest.Mock } };
  let access: { requireScope: jest.Mock };
  let service: BookingsService;

  const staff: AuthenticatedUser = { userId: 'staff-1', role: Role.VENUE_STAFF, jti: 'j1' };
  const now = new Date('2030-10-01T00:00:00Z');

  const booking = (id: string, startIso: string, status: BookingStatus = BookingStatus.REQUESTED) => ({
    id,
    start: new Date(startIso),
    end: new Date(new Date(startIso).getTime() + 3 * 60 * 60 * 1000),
    status,
  });

  const whereOf = () => prisma.venueBooking.findMany.mock.calls[0][0].where;

  beforeEach(() => {
    prisma = { venueBooking: { findMany: jest.fn().mockResolvedValue([]) } };
    access = { requireScope: jest.fn().mockReturnValue(Scope.ANY) };
    service = new BookingsService(
      prisma as unknown as PrismaService,
      access as unknown as AccessControlService,
      { notifySafely: jest.fn() } as unknown as NotificationsService,
    );
  });

  describe('AC-1: pending requests for venues I manage', () => {
    it('defaults to pending requests on venues managed by the caller', async () => {
      await service.findQueue(staff, {}, now);

      expect(whereOf()).toEqual({
        venue: { managedById: 'staff-1' },
        status: { in: [BookingStatus.REQUESTED] },
      });
    });

    it('requires the BOOKING/DECIDE grant', async () => {
      access.requireScope.mockImplementation(() => {
        throw new ForbiddenException();
      });

      await expect(service.findQueue(staff, {}, now)).rejects.toBeInstanceOf(ForbiddenException);
      expect(access.requireScope).toHaveBeenCalledWith(staff, Resource.BOOKING, Action.DECIDE);
    });
  });

  describe('AC-2: each entry carries what is needed to review it', () => {
    it('includes venue, event, organiser and requester', async () => {
      await service.findQueue(staff, {}, now);

      expect(prisma.venueBooking.findMany.mock.calls[0][0].include).toMatchObject({
        venue: expect.anything(),
        event: { select: expect.objectContaining({ organiser: expect.anything() }) },
        requestedBy: expect.anything(),
      });
    });
  });

  describe('AC-3: sorting', () => {
    it('sorts pending by event date, soonest first, by default', async () => {
      await service.findQueue(staff, {}, now);

      expect(prisma.venueBooking.findMany.mock.calls[0][0].orderBy).toEqual({ start: 'asc' });
    });

    it('sorts by submission date when asked', async () => {
      await service.findQueue(
        staff,
        { sortBy: QueueSortField.SUBMITTED, sortOrder: 'desc' },
        now,
      );

      expect(prisma.venueBooking.findMany.mock.calls[0][0].orderBy).toEqual({ createdAt: 'desc' });
    });
  });

  describe('AC-4: filtering', () => {
    it('filters by venue', async () => {
      await service.findQueue(staff, { venueId: 'venue-9' }, now);

      expect(whereOf()).toMatchObject({ venueId: 'venue-9', venue: { managedById: 'staff-1' } });
    });

    it('filters by date range, keeping bookings that overlap it', async () => {
      const from = new Date('2030-10-05T00:00:00Z');
      const to = new Date('2030-10-10T00:00:00Z');

      await service.findQueue(staff, { from, to }, now);

      expect(whereOf()).toMatchObject({ start: { lte: to }, end: { gte: from } });
    });

    it('filters the decided view by status', async () => {
      await service.findQueue(
        staff,
        { view: QueueView.DECIDED, status: BookingStatus.REJECTED },
        now,
      );

      expect(whereOf().status).toEqual({ in: [BookingStatus.REJECTED] });
    });

    it('returns nothing for a status outside the chosen view', async () => {
      await service.findQueue(staff, { status: BookingStatus.APPROVED }, now);

      expect(whereOf().status).toEqual({ in: [] });
    });
  });

  describe('AC-5: requests nearing their event date are flagged and prioritised', () => {
    it('flags pending requests starting within 7 days and puts them first', async () => {
      prisma.venueBooking.findMany.mockResolvedValue([
        booking('later', '2030-10-20T09:00:00Z'),
        booking('soon', '2030-10-06T09:00:00Z'),
        booking('also-later', '2030-10-25T09:00:00Z'),
      ]);

      const result = await service.findQueue(
        staff,
        { sortBy: QueueSortField.SUBMITTED },
        now,
      );

      expect(result.map((e) => [e.id, e.urgent])).toEqual([
        ['soon', true],
        ['later', false],
        ['also-later', false],
      ]);
      expect(result[0].daysUntilStart).toBe(5);
    });

    it('does not flag a request exactly 7 days out', async () => {
      prisma.venueBooking.findMany.mockResolvedValue([booking('edge', '2030-10-08T00:00:00Z')]);

      const [entry] = await service.findQueue(staff, {}, now);

      expect(entry.urgent).toBe(false);
    });

    it('never flags a decided request', async () => {
      prisma.venueBooking.findMany.mockResolvedValue([
        booking('decided', '2030-10-02T09:00:00Z', BookingStatus.APPROVED),
      ]);

      const [entry] = await service.findQueue(staff, { view: QueueView.DECIDED }, now);

      expect(entry.urgent).toBe(false);
    });
  });

  describe('AC-7: decided requests leave the pending view', () => {
    it('the decided view lists approved and rejected, newest submission first', async () => {
      await service.findQueue(staff, { view: QueueView.DECIDED }, now);

      expect(whereOf().status).toEqual({
        in: [BookingStatus.APPROVED, BookingStatus.REJECTED],
      });
      expect(prisma.venueBooking.findMany.mock.calls[0][0].orderBy).toEqual({ createdAt: 'desc' });
    });
  });
});
