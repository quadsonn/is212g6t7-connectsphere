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

  // TC-S2-01, TC-S2-02 · US-16 AC-1 · unit: CalendarService.getCalendar() with Prisma mocked · fails
  // if venues outside my management appear, or a booking or block gets the wrong kind
  describe('AC-1: my venues, each slot distinguished by status', () => {
    it('lists only published venues the caller manages', async () => {
      await service.getCalendar(staff, { from, to });

      expect(prisma.venue.findMany.mock.calls[0][0].where).toEqual({
        managedById: 'staff-1',
        status: VenueStatus.PUBLISHED,
      });
    });

    it('US-54: marks pending as PENDING, approved as CONFIRMED and blocks as BLOCKED, in time order', async () => {
      prisma.venueBooking.findMany.mockResolvedValue([
        { id: 'b1', venueId: 'v1', start: at(9), end: at(10), status: BookingStatus.REQUESTED, expectedAttendance: 50, event: { name: 'Talk', organiser: { name: 'Org' } } },
        { id: 'b2', venueId: 'v1', start: at(13), end: at(14), status: BookingStatus.APPROVED, expectedAttendance: 80, event: { name: 'Gala', organiser: { name: 'Org' } } },
      ]);
      prisma.venueBlock.findMany.mockResolvedValue([
        { id: 'k1', venueId: 'v1', start: at(11), end: at(12), reason: 'Cleaning', createdBy: { name: 'Staff' } },
      ]);

      const { entries } = await service.getCalendar(staff, { from, to });

      expect(entries.map((e) => [e.id, e.kind])).toEqual([
        ['b1', 'PENDING'],
        ['k1', 'BLOCKED'],
        ['b2', 'CONFIRMED'],
      ]);
    });

    it('leaves rejected bookings, and released or expired holds, off the calendar', async () => {
      await service.getCalendar(staff, { from, to });

      expect(prisma.venueBooking.findMany.mock.calls[0][0].where.OR).toEqual([
        { status: { in: [BookingStatus.REQUESTED, BookingStatus.APPROVED] } },
        { status: BookingStatus.HELD, holdExpiresAt: { gt: expect.any(Date) } },
      ]);
    });

    it('US-54 AC-4: a live hold is TENTATIVE and carries its expiry', async () => {
      const expires = new Date(Date.now() + 864e5);
      prisma.venueBooking.findMany.mockResolvedValue([
        { id: 'h1', venueId: 'v1', start: at(9), end: at(10), status: BookingStatus.HELD, holdExpiresAt: expires, expectedAttendance: 50, event: { name: 'Talk', organiser: { name: 'Org' } } },
      ]);

      const { entries } = await service.getCalendar(staff, { from, to });

      expect(entries).toEqual([expect.objectContaining({ id: 'h1', kind: 'TENTATIVE', holdExpiresAt: expires })]);
    });
  });

  // TC-S2-04 · US-16 AC-2 · unit: getCalendar() · fails if entries outside the window are read, or a
  // window over 42 days is accepted
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

  // TC-S2-05 · US-16 AC-3 · unit: getCalendar() · fails if the venue filter is dropped or widens
  // past my venues
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

  // TC-S2-06 · US-16 AC-4 · unit: getCalendar() · fails if an entry lacks its event name, organiser,
  // time or attendance
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

  // TC-S2-08, TC-S2-09 · US-16 AC-6 · unit: createBlock()/removeBlock() · fails if a block is not
  // stored, not limited to my venues, or hides the bookings it covers
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
