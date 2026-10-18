import { BadRequestException, NotFoundException } from '@nestjs/common';
import { BookingStatus, Role, VenueStatus } from '@prisma/client';

import { AccessControlService } from '../common/access/access-control.service';
import { Action, Resource, Scope } from '../common/access/permission.types';
import { AuthenticatedUser } from '../auth/jwt.strategy';
import { PrismaService } from '../prisma/prisma.service';
import { BookingsService } from './bookings.service';
import { CalendarService } from './calendar.service';

/** US-16 — Venue Availability Calendar. */
describe('CalendarService (US-16)', () => {
  let prisma: {
    venue: { findMany: jest.Mock; findFirst: jest.Mock };
    venueBooking: { findMany: jest.Mock };
    venueBlock: { findMany: jest.Mock; findFirst: jest.Mock; create: jest.Mock; delete: jest.Mock };
    $transaction: jest.Mock;
  };
  let access: { requireScope: jest.Mock };
  let bookings: { lockVenue: jest.Mock; buffersFor: jest.Mock };
  let service: CalendarService;

  const staff: AuthenticatedUser = { userId: 'staff-1', role: Role.VENUE_STAFF, jti: 'j1' };
  const from = new Date('2030-10-01T00:00:00Z');
  const to = new Date('2030-10-08T00:00:00Z');
  const at = (h: number) => new Date(`2030-10-02T${String(h).padStart(2, '0')}:00:00Z`);

  beforeEach(() => {
    prisma = {
      venue: {
        findMany: jest.fn().mockResolvedValue([{ id: 'v1', name: 'Hall', location: null, capacity: 100 }]),
        findFirst: jest.fn().mockResolvedValue({ id: 'v1' }),
      },
      venueBooking: { findMany: jest.fn().mockResolvedValue([]) },
      venueBlock: {
        findMany: jest.fn().mockResolvedValue([]),
        findFirst: jest.fn().mockResolvedValue({ id: 'block-1' }),
        create: jest.fn().mockImplementation(({ data }) => Promise.resolve({ id: 'block-new', ...data })),
        delete: jest.fn().mockResolvedValue({}),
      },
      $transaction: jest.fn(),
    };
    prisma.$transaction.mockImplementation((fn) => fn(prisma));
    access = { requireScope: jest.fn().mockReturnValue(Scope.ANY) };
    bookings = {
      lockVenue: jest.fn().mockResolvedValue(undefined),
      // US-50: no buffers configured.
      buffersFor: jest.fn().mockResolvedValue({ setupMinutes: 0, turnaroundMinutes: 0 }),
    };
    service = new CalendarService(
      prisma as unknown as PrismaService,
      access as unknown as AccessControlService,
      bookings as unknown as BookingsService,
    );
  });

  describe('AC-1: my venues, each slot distinguished by status', () => {
    it('lists only published venues the caller manages', async () => {
      await service.getCalendar(staff, { from, to });

      expect(prisma.venue.findMany.mock.calls[0][0].where).toEqual({
        managedById: 'staff-1',
        status: VenueStatus.PUBLISHED,
      });
    });

    it('marks pending as TENTATIVE, approved as CONFIRMED and blocks as BLOCKED, in time order', async () => {
      prisma.venueBooking.findMany.mockResolvedValue([
        { id: 'b1', venueId: 'v1', start: at(9), end: at(10), status: BookingStatus.REQUESTED, expectedAttendance: 50, event: { name: 'Talk', organiser: { name: 'Org' } } },
        { id: 'b2', venueId: 'v1', start: at(13), end: at(14), status: BookingStatus.APPROVED, expectedAttendance: 80, event: { name: 'Gala', organiser: { name: 'Org' } } },
      ]);
      prisma.venueBlock.findMany.mockResolvedValue([
        { id: 'k1', venueId: 'v1', start: at(11), end: at(12), reason: 'Cleaning', createdBy: { name: 'Staff' } },
      ]);

      const { entries } = await service.getCalendar(staff, { from, to });

      expect(entries.map((e) => [e.id, e.kind])).toEqual([
        ['b1', 'TENTATIVE'],
        ['k1', 'BLOCKED'],
        ['b2', 'CONFIRMED'],
      ]);
    });

    it('leaves rejected bookings off the calendar', async () => {
      await service.getCalendar(staff, { from, to });

      expect(prisma.venueBooking.findMany.mock.calls[0][0].where.status).toEqual({
        in: [BookingStatus.REQUESTED, BookingStatus.APPROVED],
      });
    });
  });

  describe('AC-2: day, week and month windows', () => {
    it('accepts a six-week month window', async () => {
      await expect(
        service.getCalendar(staff, { from, to: new Date(from.getTime() + 42 * 864e5) }),
      ).resolves.toBeDefined();
    });

    it('refuses a window wider than six weeks', async () => {
      await expect(
        service.getCalendar(staff, { from, to: new Date(from.getTime() + 43 * 864e5) }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('only returns entries overlapping the window', async () => {
      await service.getCalendar(staff, { from, to });

      expect(prisma.venueBooking.findMany.mock.calls[0][0].where).toMatchObject({
        start: { lt: to },
        end: { gt: from },
      });
    });
  });

  describe('AC-3: filter to a single venue', () => {
    it('narrows to the chosen venue, still within the caller\'s own', async () => {
      await service.getCalendar(staff, { from, to, venueId: 'v1' });

      expect(prisma.venue.findMany.mock.calls[0][0].where).toEqual({
        managedById: 'staff-1',
        status: VenueStatus.PUBLISHED,
        id: 'v1',
      });
    });
  });

  describe('AC-4: a booked slot carries its event details', () => {
    it('includes event name, organiser, time and attendance', async () => {
      prisma.venueBooking.findMany.mockResolvedValue([
        { id: 'b1', venueId: 'v1', start: at(9), end: at(10), status: BookingStatus.APPROVED, expectedAttendance: 50, event: { name: 'Talk', organiser: { name: 'Org' } } },
      ]);

      const { entries } = await service.getCalendar(staff, { from, to });

      expect(entries[0]).toMatchObject({
        eventName: 'Talk',
        organiserName: 'Org',
        start: at(9),
        end: at(10),
        expectedAttendance: 50,
      });
    });
  });

  describe('AC-6: blocked-out periods', () => {
    const dto = { venueId: 'v1', start: at(8), end: at(18), reason: ' Maintenance ' };

    it('blocks out time on a managed venue, under the venue lock', async () => {
      const result = await service.createBlock(staff, dto);

      expect(bookings.lockVenue).toHaveBeenCalledWith(prisma, 'v1');
      expect(prisma.venueBlock.create.mock.calls[0][0].data).toMatchObject({
        venueId: 'v1',
        reason: 'Maintenance',
        createdById: 'staff-1',
      });
      expect(result.overlappingBookings).toEqual([]);
      expect(access.requireScope).toHaveBeenCalledWith(staff, Resource.VENUE, Action.UPDATE);
    });

    it('reports bookings already inside the blocked period', async () => {
      prisma.venueBooking.findMany.mockResolvedValue([
        { id: 'b1', start: at(9), end: at(10), status: BookingStatus.APPROVED, event: { name: 'Talk' } },
      ]);

      const result = await service.createBlock(staff, dto);

      expect(result.overlappingBookings).toEqual([
        expect.objectContaining({ bookingId: 'b1', eventName: 'Talk' }),
      ]);
    });

    it('refuses a venue the caller does not manage', async () => {
      prisma.venue.findFirst.mockResolvedValue(null);

      await expect(service.createBlock(staff, dto)).rejects.toBeInstanceOf(NotFoundException);
      expect(prisma.venue.findFirst).toHaveBeenCalledWith({
        where: { id: 'v1', managedById: 'staff-1' },
      });
    });

    it('removes a block only from a managed venue', async () => {
      await service.removeBlock(staff, 'block-1');
      expect(prisma.venueBlock.delete).toHaveBeenCalledWith({ where: { id: 'block-1' } });

      prisma.venueBlock.findFirst.mockResolvedValue(null);
      await expect(service.removeBlock(staff, 'block-2')).rejects.toBeInstanceOf(NotFoundException);
    });
  });
});
