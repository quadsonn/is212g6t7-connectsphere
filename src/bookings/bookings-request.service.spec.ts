import { ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import {
  AccessibilityFeature,
  BookingStatus,
  EventStatus,
  Role,
  RoomLayout,
} from '@prisma/client';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';

import { AccessControlService } from '../common/access/access-control.service';
import { Scope } from '../common/access/permission.types';
import { AuthenticatedUser } from '../auth/jwt.strategy';
import { NotificationsService } from '../notifications/notifications.service';
import { PrismaService } from '../prisma/prisma.service';
import { BookingsService } from './bookings.service';
import { CreateBookingRequestDto } from './dto/create-booking-request.dto';
import { HoldNotifier } from './hold-notifier';
import { VenueActivityNotifier } from './venue-activity-notifier';

/** US-20 — submit a request to book a venue with timing and requirements. */
describe('BookingsService createRequest (US-20)', () => {
  let prisma: {
    eventRequest: { findFirst: jest.Mock };
    venue: { findFirst: jest.Mock; findUnique: jest.Mock };
    venueBooking: { findMany: jest.Mock; findFirst: jest.Mock; create: jest.Mock };
    venueBlock: { findMany: jest.Mock };
    equipmentRequirement: { findMany: jest.Mock };
    $executeRaw: jest.Mock;
    $queryRaw: jest.Mock;
    $transaction: jest.Mock;
  };
  let access: { requireScope: jest.Mock };
  let service: BookingsService;

  const coordinator: AuthenticatedUser = {
    userId: 'coord-1',
    role: Role.EVENT_COORDINATOR,
    jti: 'j1',
  };

  const start = new Date('2030-10-01T09:00:00Z');
  const end = new Date('2030-10-01T12:00:00Z');

  const dto = (): CreateBookingRequestDto => ({
    eventId: 'event-1',
    venueId: 'venue-1',
    start,
    end,
    expectedAttendance: 120,
  });

  const event = (overrides: Record<string, unknown> = {}) => ({
    id: 'event-1',
    name: 'Orientation',
    coordinatorId: 'coord-1',
    status: EventStatus.APPROVED,
    preferredLayout: RoomLayout.THEATRE,
    layoutNotes: 'Stage at the front',
    accessibilityRequirements: [AccessibilityFeature.STEP_FREE_ACCESS],
    accessibilityNotes: 'Two wheelchair users',
    equipmentNeeds: '2 wireless mics',
    ...overrides,
  });

  const existing = (status: BookingStatus) => ({
    id: `booking-${status}`,
    start: new Date('2030-10-01T10:00:00Z'),
    end: new Date('2030-10-01T11:00:00Z'),
    status,
    event: { name: 'Hackathon' },
  });

  beforeEach(() => {
    prisma = {
      eventRequest: { findFirst: jest.fn().mockResolvedValue(event()) },
      venue: {
        findFirst: jest.fn().mockResolvedValue({ id: 'venue-1' }),
        // US-50: the venue's buffers; none configured.
        findUnique: jest.fn().mockResolvedValue(null),
      },
      venueBooking: {
        findMany: jest.fn().mockResolvedValue([]),
        findFirst: jest.fn().mockResolvedValue({ id: 'booking-1' }),
        create: jest
          .fn()
          .mockImplementation(({ data }) =>
            Promise.resolve({ id: 'booking-new', status: BookingStatus.REQUESTED, ...data }),
          ),
      },
      venueBlock: { findMany: jest.fn().mockResolvedValue([]) },
      equipmentRequirement: { findMany: jest.fn().mockResolvedValue([]) },
      $executeRaw: jest.fn().mockResolvedValue(1),
      // US-54: releaseExpiredHolds finds no expired holds.
      $queryRaw: jest.fn().mockResolvedValue([]),
      $transaction: jest.fn(),
    };
    prisma.$transaction.mockImplementation((fn) => fn(prisma));
    access = { requireScope: jest.fn().mockReturnValue(Scope.ASSIGNED) };

    service = new BookingsService(
      prisma as unknown as PrismaService,
      access as unknown as AccessControlService,
      { notifySafely: jest.fn() } as unknown as NotificationsService,
      { requestSubmitted: jest.fn(), approvedBookingChanged: jest.fn(), eventCancelled: jest.fn() } as unknown as VenueActivityNotifier,
      { placed: jest.fn(), expiring: jest.fn(), expired: jest.fn(), released: jest.fn(), converted: jest.fn() } as unknown as HoldNotifier,
    );
  });

  // TC-S2-34 · US-20 AC-1 · unit: CreateBookingRequestDto and createRequest() with Prisma mocked ·
  // fails if a request without a valid date, times or attendance gets through
  describe('AC-1: date, start/end time and expected attendance are required', () => {
    const errorsFor = async (body: Record<string, unknown>) => {
      const errors = await validate(plainToInstance(CreateBookingRequestDto, body));
      return errors.flatMap((e) => Object.values(e.constraints ?? {}));
    };

    it('flags every missing field at once', async () => {
      const messages = await errorsFor({ eventId: 'e', venueId: 'v' });

      expect(messages).toEqual(
        expect.arrayContaining([
          'start must be a valid ISO 8601 date',
          'end must be a valid ISO 8601 date',
          'expectedAttendance must be a whole number',
        ]),
      );
    });

    it('rejects an end time before the start time', async () => {
      const messages = await errorsFor({
        ...dto(),
        start: '2030-10-01T12:00:00Z',
        end: '2030-10-01T09:00:00Z',
      });

      expect(messages).toContain('end must be later than start');
    });

    it('rejects a start in the past', async () => {
      const messages = await errorsFor({
        ...dto(),
        start: '2020-01-01T09:00:00Z',
        end: '2020-01-01T10:00:00Z',
      });

      expect(messages).toContain('start must be in the future');
    });

    it('rejects zero attendance', async () => {
      const messages = await errorsFor({ ...dto(), expectedAttendance: 0 });

      expect(messages).toContain('expectedAttendance must be greater than zero');
    });

    it('accepts a complete request', async () => {
      const messages = await errorsFor({
        ...dto(),
        start: start.toISOString(),
        end: end.toISOString(),
      });

      expect(messages).toEqual([]);
    });
  });

  // TC-S2-35 · US-20 AC-2 · unit: createRequest() · fails if the event's requirements are not copied
  // onto the request
  describe('AC-2: event requirements are attached to the request', () => {
    it('copies layout, accessibility and equipment needs from the event', async () => {
      await service.createRequest(coordinator, dto());

      expect(prisma.venueBooking.create.mock.calls[0][0].data).toMatchObject({
        preferredLayout: RoomLayout.THEATRE,
        layoutNotes: 'Stage at the front',
        accessibilityRequirements: [AccessibilityFeature.STEP_FREE_ACCESS],
        accessibilityNotes: 'Two wheelchair users',
        equipmentNeeds: '2 wireless mics',
        expectedAttendance: 120,
      });
    });

    it('Story 20 AC-2: copies the equipment lines, in entry order, with technical support and facilities', async () => {
      prisma.equipmentRequirement.findMany.mockResolvedValue([
        { id: 'REQ-1000', createdAt: new Date(0), equipmentType: 'Laptop', quantity: 1, notes: null },
        { id: 'REQ-999', createdAt: new Date(0), equipmentType: 'Projector', quantity: 2, notes: 'HDMI' },
      ]);

      await service.createRequest(coordinator, dto());

      expect(prisma.venueBooking.create.mock.calls[0][0].data).toMatchObject({
        equipmentRequirements: [
          { equipmentType: 'Projector', quantity: 2, notes: 'HDMI' },
          { equipmentType: 'Laptop', quantity: 1, notes: null },
        ],
      });
    });
  });

  // TC-S2-35 · US-20 AC-3 · unit: createRequest() · fails if a new request is written as anything
  // but pending
  describe('AC-3: a new request is pending, not confirmed', () => {
    it('never writes a status, so the REQUESTED default applies', async () => {
      const result = await service.createRequest(coordinator, dto());

      expect(prisma.venueBooking.create.mock.calls[0][0].data).not.toHaveProperty('status');
      expect(result.status).toBe(BookingStatus.REQUESTED);
    });
  });

  // TC-S2-36, TC-S2-37 · US-20 AC-4 · unit: createRequest() · fails if a confirmed overlap does not
  // block, or a touching slot does
  describe('AC-4: overlap with a confirmed booking blocks submission', () => {
    it('throws 409 naming the conflicting booking', async () => {
      prisma.venueBooking.findMany.mockResolvedValue([existing(BookingStatus.APPROVED)]);

      const attempt = service.createRequest(coordinator, dto());

      await expect(attempt).rejects.toBeInstanceOf(ConflictException);
      await attempt.catch((error: ConflictException) => {
        expect(error.getResponse()).toMatchObject({
          conflicts: [
            expect.objectContaining({
              bookingId: 'booking-APPROVED',
              eventName: 'Hackathon',
            }),
          ],
        });
      });
      expect(prisma.venueBooking.create).not.toHaveBeenCalled();
    });

    it('US-16: also blocks a request that falls in a blocked-out period', async () => {
      prisma.venueBlock.findMany.mockResolvedValue([
        { id: 'block-1', start, end, reason: 'Maintenance' },
      ]);

      const attempt = service.createRequest(coordinator, dto());

      await expect(attempt).rejects.toBeInstanceOf(ConflictException);
      await attempt.catch((error: ConflictException) => {
        expect(error.getResponse()).toMatchObject({
          conflicts: [expect.objectContaining({ kind: 'BLOCK', reason: 'Maintenance' })],
        });
      });
      expect(prisma.venueBooking.create).not.toHaveBeenCalled();
    });

    it('checks overlap as start < requested end AND end > requested start', async () => {
      await service.createRequest(coordinator, dto());

      expect(prisma.venueBooking.findMany.mock.calls[0][0].where).toMatchObject({
        venueId: 'venue-1',
        start: { lt: end },
        end: { gt: start },
        // US-54: pending, approved, or a hold that has not expired.
        OR: [
          { status: { in: [BookingStatus.REQUESTED, BookingStatus.APPROVED] } },
          { status: BookingStatus.HELD, holdExpiresAt: { gt: expect.any(Date) } },
        ],
      });
    });

    it('locks the venue before checking, so concurrent requests serialise', async () => {
      await service.createRequest(coordinator, dto());

      expect(prisma.$executeRaw).toHaveBeenCalled();
      expect(prisma.$executeRaw.mock.invocationCallOrder[0]).toBeLessThan(
        prisma.venueBooking.findMany.mock.invocationCallOrder[0],
      );
    });
  });

  // TC-S2-38 · US-20 AC-5 · unit: createRequest() · fails if a pending overlap blocks, or gives no
  // warning
  describe('AC-5: overlap with only a pending request is allowed with a warning', () => {
    it('creates the request and returns a warning', async () => {
      prisma.venueBooking.findMany.mockResolvedValue([existing(BookingStatus.REQUESTED)]);

      const result = await service.createRequest(coordinator, dto());

      expect(prisma.venueBooking.create).toHaveBeenCalled();
      expect(result.warnings).toHaveLength(1);
      expect(result.warnings[0].code).toBe('OVERLAPS_PENDING_REQUEST');
      expect(result.warnings[0].conflicts[0].bookingId).toBe('booking-REQUESTED');
    });

    it('returns no warnings when the slot is clear', async () => {
      const result = await service.createRequest(coordinator, dto());

      expect(result.warnings).toEqual([]);
    });
  });

  // TC-S2-39 · US-20 AC-6 · unit: findMyRequests() · fails if a request is missing from its
  // requester's history
  describe('AC-6: the request appears in the Coordinator\'s history', () => {
    it('records the Coordinator as the requester', async () => {
      await service.createRequest(coordinator, dto());

      expect(prisma.venueBooking.create.mock.calls[0][0].data.requestedById).toBe('coord-1');
    });

    it('lists requests raised by this Coordinator, newest first', async () => {
      prisma.venueBooking.findMany.mockResolvedValue([]);

      await service.findMyRequests(coordinator);

      expect(prisma.venueBooking.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { requestedById: 'coord-1' },
          orderBy: { createdAt: 'desc' },
        }),
      );
    });
  });

  // TC-S2-40 · US-20 access · unit: createRequest() · fails if a request can be made for someone
  // else's or an unapproved event
  describe('authorisation and preconditions', () => {
    it('is denied to a role without BOOKING/CREATE', async () => {
      access.requireScope.mockImplementation(() => {
        throw new ForbiddenException();
      });

      await expect(service.createRequest(coordinator, dto())).rejects.toBeInstanceOf(
        ForbiddenException,
      );
    });

    it('only finds events assigned to the caller', async () => {
      prisma.eventRequest.findFirst.mockResolvedValue(null);

      await expect(service.createRequest(coordinator, dto())).rejects.toBeInstanceOf(
        NotFoundException,
      );
      expect(prisma.eventRequest.findFirst).toHaveBeenCalledWith({
        where: { id: 'event-1', coordinatorId: 'coord-1' },
      });
    });

    it.each([EventStatus.SUBMITTED, EventStatus.REJECTED, EventStatus.CONFIRMED])(
      'refuses an event that is %s',
      async (status) => {
        prisma.eventRequest.findFirst.mockResolvedValue(event({ status }));

        await expect(service.createRequest(coordinator, dto())).rejects.toBeInstanceOf(
          ConflictException,
        );
      },
    );

    it('treats an unpublished venue as not found', async () => {
      prisma.venue.findFirst.mockResolvedValue(null);

      await expect(service.createRequest(coordinator, dto())).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });
  });

  // TC-S2-40 · US-20 access · unit: findOneForUser() · fails if a request is readable by someone not
  // involved
  describe('viewing one request in full', () => {
    it('lets a Coordinator open requests they raised or on their events', async () => {
      await service.findOneForUser(coordinator, 'booking-1');

      expect(prisma.venueBooking.findFirst.mock.calls[0][0].where).toEqual({
        AND: [
          { id: 'booking-1' },
          { OR: [{ requestedById: 'coord-1' }, { event: { coordinatorId: 'coord-1' } }] },
        ],
      });
    });

    it('lets Venue Staff open requests only for venues they manage', async () => {
      access.requireScope.mockReturnValue(Scope.ANY);
      const staff = { userId: 'staff-1', role: Role.VENUE_STAFF, jti: 'j2' };

      await service.findOneForUser(staff, 'booking-1');

      expect(prisma.venueBooking.findFirst.mock.calls[0][0].where).toEqual({
        AND: [{ id: 'booking-1' }, { venue: { managedById: 'staff-1' } }],
      });
    });

    it('reports a request outside the caller\'s reach as not found', async () => {
      prisma.venueBooking.findFirst.mockResolvedValue(null);

      await expect(service.findOneForUser(coordinator, 'booking-1')).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });
  });

  describe('Capacity AC-1/AC-2: a venue too small for the expected attendance cannot be requested', () => {
    const venue = (capacity: number | null) =>
      prisma.venue.findFirst.mockResolvedValue({ id: 'venue-1', name: 'Alumni Lounge', capacity });

    it('Capacity AC-1/AC-2: refuses 499 attendees for a venue holding 90, saying why, and writes nothing', async () => {
      venue(90);

      const refused = service.createRequest(coordinator, { ...dto(), expectedAttendance: 499 });

      await expect(refused).rejects.toBeInstanceOf(ConflictException);
      await expect(refused).rejects.toMatchObject({
        response: {
          code: 'CAPACITY_EXCEEDED',
          message: 'Alumni Lounge holds 90, but expected attendance is 499.',
          capacity: 90,
          expectedAttendance: 499,
        },
      });
      expect(prisma.venueBooking.create).not.toHaveBeenCalled();
    });

    it('Capacity AC-1: refuses attendance one over capacity', async () => {
      venue(90);

      await expect(
        service.createRequest(coordinator, { ...dto(), expectedAttendance: 91 }),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it('Capacity AC-1: allows attendance equal to capacity', async () => {
      venue(90);

      const created = await service.createRequest(coordinator, { ...dto(), expectedAttendance: 90 });

      expect(created.status).toBe(BookingStatus.REQUESTED);
    });

    it('Capacity AC-1: allows attendance below capacity', async () => {
      venue(90);

      const created = await service.createRequest(coordinator, { ...dto(), expectedAttendance: 50 });

      expect(created.status).toBe(BookingStatus.REQUESTED);
    });

    it('Capacity AC-1: refuses a replacement request (US-52) that is over capacity too', async () => {
      venue(90);

      await expect(
        service.createRequest(coordinator, {
          ...dto(),
          expectedAttendance: 499,
          replacesBookingId: 'booking-1',
        }),
      ).rejects.toMatchObject({ response: { code: 'CAPACITY_EXCEEDED' } });
      expect(prisma.venueBooking.create).not.toHaveBeenCalled();
    });

    it('does not guess for a venue with no capacity recorded (the US-48 rule)', async () => {
      venue(null);

      const created = await service.createRequest(coordinator, { ...dto(), expectedAttendance: 499 });

      expect(created.status).toBe(BookingStatus.REQUESTED);
    });
  });
});
