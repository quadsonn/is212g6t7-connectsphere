import { BookingDecisionKind, BookingStatus, ChangeRequestStatus, EventStatus, RegistrationStatus, Role } from '@prisma/client';
import { ClassConstructor, plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';

import { AuthenticatedUser } from './auth/jwt.strategy';
import { assertTransition, BookingAction } from './bookings/booking-status.machine';
import { BookingsService } from './bookings/bookings.service';
import { AccessControlService } from './common/access/access-control.service';
import { BrowseEquipmentDto } from './equipment/dto/browse-equipment.dto';
import * as changeRequestRules from './events/change-request.rules';
import { CreateChangeRequestDto } from './events/dto/create-change-request.dto';
import { RejectChangeRequestDto } from './events/dto/reject-change-request.dto';
import { movedArrangementChanges } from './events/event-change.rules';
import { EventsChangeRequestService } from './events/events-change-request.service';
import { EventsChangeReviewService } from './events/events-change-review.service';
import { NotificationsService } from './notifications/notifications.service';
import { PrismaService } from './prisma/prisma.service';
import { RegisterDto } from './registrations/dto/register.dto';
import { RegistrationsService } from './registrations/registrations.service';
import { capacityShortfall } from './venues/capacity';
import { BrowseVenuesDto } from './venues/dto/browse-venues.dto';
import { VenueDraftDto } from './venues/dto/venue-draft.dto';
import { VenueSearchDto } from './venues/dto/venue-search.dto';
import { VenuesService } from './venues/venues.service';

// Lets one test hand assertPublishable errors without `constraints`; every
// other call validates for real.
let mockValidationErrors: unknown[] | null = null;
jest.mock('class-validator', () => {
  const actual = jest.requireActual('class-validator');
  return {
    ...actual,
    validate: (...args: unknown[]) => mockValidationErrors ?? actual.validate(...args),
  };
});

/**
 * Sprint 2 (US-14 to US-37) — the branches the running app cannot reach,
 * forced here so each still behaves as meant if its guarantee is lost:
 *  - a value that is not text reaching a trimming DTO field: the HTTP layer
 *    sends JSON numbers as numbers, so the field's own @IsString refuses it;
 *  - an event, venue or registration with no name, or an event with no dates:
 *    the database requires both on every non-draft event and published venue;
 *  - a booking created in a status other than REQUESTED, a queue read with no
 *    query, a notice with no suggestions, an approval with no history entry
 *    and an equipment change with no list: no caller passes them;
 *  - a database error other than the one-pending race, and a validation error
 *    without constraints (the candidate DTO is flat).
 * Everything reachable is proven against the test database in the venue,
 * booking, equipment, registration and change-request e2e specs.
 */
describe('Sprint 2 backstops', () => {
  const errorsFor = async <T extends object>(dto: ClassConstructor<T>, body: object) =>
    (await validate(plainToInstance(dto, body))).map((e) => e.property);

  afterEach(() => {
    mockValidationErrors = null;
    jest.restoreAllMocks();
  });

  // TC-S1-103, TC-S1-110, TC-S2-21, TC-S2-24, TC-S2-100, TC-S2-138, TC-S2-160, TC-S2-175 · US-14 AC-1, US-15 AC-3, US-18 AC-3/AC-5, US-28 AC-3, US-33 AC-2, US-36 AC-1, US-37 AC-3 · setup: none (unit) · fails if a value that is not text gets past a trimming field
  // Code: the @Transform trims on BrowseVenuesDto, VenueDraftDto, VenueSearchDto, BrowseEquipmentDto, RegisterDto, CreateChangeRequestDto, RejectChangeRequestDto
  it('trimming fields refuse a value that is not text', async () => {
    expect(await errorsFor(BrowseVenuesDto, { search: 5 })).toEqual(['search']);
    expect(await errorsFor(VenueDraftDto, { name: 5, location: 5, facilityNotes: 5, accessibilityNotes: 5 })).toEqual([
      'name',
      'location',
      'facilityNotes',
      'accessibilityNotes',
    ]);
    expect(await errorsFor(VenueSearchDto, { name: 5 })).toEqual(['name']);
    expect(await errorsFor(BrowseEquipmentDto, { search: 5 })).toEqual(['search']);
    expect(await errorsFor(RegisterDto, { eventId: 'EVT-001', phone: 6591234567, accessibilityNeeds: 5 })).toEqual([
      'phone',
      'accessibilityNeeds',
    ]);
    expect(await errorsFor(CreateChangeRequestDto, { reason: 5 })).toEqual(['reason']);
    expect(await errorsFor(RejectChangeRequestDto, { reason: 5 })).toEqual(['reason']);
  });

  // TC-S1-103, TC-S2-21 · US-14 AC-1, US-18 AC-3 · setup: none (unit) · fails if a blank venue name, location or notes are stored as spaces, or an empty list filter is applied
  // Code: VenueDraftDto (name, location and notes: trimmed, blank -> null); VenueSearchDto toList ('' -> no filter)
  it('blank venue notes become null, and an empty list filter is no filter', () => {
    const blank = plainToInstance(VenueDraftDto, { name: '  ', location: '  ', facilityNotes: '  ', accessibilityNotes: '   ' });
    const filled = plainToInstance(VenueDraftDto, { facilityNotes: '  Lift  ', accessibilityNotes: ' Ramp ' });
    expect(blank).toMatchObject({ name: null, location: null, facilityNotes: null, accessibilityNotes: null });
    expect(filled).toMatchObject({ facilityNotes: 'Lift', accessibilityNotes: 'Ramp' });
    expect(plainToInstance(VenueSearchDto, { accessibility: '' }).accessibility).toBeUndefined();
  });

  // TC-S2-29 · US-19 AC-1 · setup: none (unit) · fails if a nameless venue's capacity message cannot be worded
  // Code: capacityShortfall (name fallback)
  it('words a capacity shortfall for a venue with no name', () => {
    expect(capacityShortfall({ name: null, capacity: 10 }, 20)?.message).toBe(
      'This venue holds 10, but expected attendance is 20.',
    );
  });

  // TC-S2-35 · US-20 AC-3 · setup: none (unit) · fails if a booking could be created in any status but REQUESTED, or the refusal is unclear
  // Code: assertTransition (from null)
  it('refuses to create a booking in any status but REQUESTED', () => {
    expect(() => assertTransition(BookingAction.REQUEST, null, BookingStatus.APPROVED)).toThrow(
      'a booking cannot be created as approved',
    );
  });

  // TC-S3-119 · US-48 AC-7 · setup: none (unit) · fails if a moved booking at a nameless venue breaks the history line
  // Code: movedArrangementChanges (venue name fallback)
  it('names a nameless venue in the moved-arrangements history', () => {
    const window = (h: number) => ({ start: new Date(Date.UTC(2030, 0, 1, h)), end: new Date(Date.UTC(2030, 0, 1, h + 1)) });
    const [change] = movedArrangementChanges({
      venueBookings: [{ venueName: null, from: window(9), to: window(11) }],
      equipmentReservations: [],
    });

    expect((change.previous as string[])[0]).toMatch(/^Unnamed venue: /);
  });

  describe('VenuesService (US-14, US-19)', () => {
    const coordinator: AuthenticatedUser = { userId: 'USR-004', role: Role.EVENT_COORDINATOR, jti: 'j' };
    const build = () => {
      const venue = { capacity: 100, accessibilityFeatures: [], supportedLayouts: [], facilities: [] };
      const prisma = { venue: { findFirst: jest.fn().mockResolvedValue(venue) } };
      const events = {
        findSuitabilityRequirements: jest.fn().mockResolvedValue({
          id: 'EVT-001',
          expectedAttendance: 50,
          accessibilityRequirements: [],
          preferredLayout: null,
          requiredFacilities: [],
          proposedStart: null,
          proposedEnd: null,
        }),
      };
      const equipment = { freeUnitsForEventRequirements: jest.fn().mockResolvedValue([]) };
      const service = new VenuesService(
        prisma as unknown as PrismaService,
        { requireScope: jest.fn() } as unknown as AccessControlService,
        {} as never,
        {} as NotificationsService,
        {} as never,
        events as never,
        {} as never,
        equipment as never,
      );
      return { service, equipment };
    };

    // TC-S2-184 · US-19 AC-3 · setup: none (unit) · fails if an event with no dates asks for equipment over an invented window
    // Code: VenuesService.getSuitability (no dates -> no window)
    it('checks equipment with no window for an event with no dates', async () => {
      const { service, equipment } = build();

      await service.getSuitability(coordinator, 'VEN-001', 'EVT-001');

      expect(equipment.freeUnitsForEventRequirements).toHaveBeenCalledWith('EVT-001', null);
    });

    // TC-S1-106 · US-14 AC-4 · setup: none (unit) · fails if a validation error without constraints breaks the 400
    // Code: VenuesService.assertPublishable (constraints ?? {})
    it('a publish error without constraints is still a 400', async () => {
      const { service } = build();
      mockValidationErrors = [{ property: 'name', children: [] }];

      await expect(service['assertPublishable']({ name: null } as never)).rejects.toMatchObject({ status: 400 });
    });
  });

  describe('BookingsService (US-21, US-22, US-41)', () => {
    const staff: AuthenticatedUser = { userId: 'USR-010', role: Role.VENUE_STAFF, jti: 'j' };
    const nameless = {
      id: 'BKG-001',
      eventId: 'EVT-001',
      status: BookingStatus.REJECTED,
      decisionReason: 'Closed',
      requestedById: 'USR-004',
      venue: { name: null },
      event: { name: null, organiser: { id: 'USR-006' } },
    };
    const build = (decided: object = nameless) => {
      const prisma = {
        venueBooking: {
          findFirst: jest.fn().mockResolvedValue({ venueId: 'VEN-001', replacesBookingId: null }),
          findMany: jest.fn().mockResolvedValue([]),
        },
        $transaction: jest.fn().mockResolvedValue(decided),
      };
      const notifications = { notifySafely: jest.fn().mockResolvedValue(undefined) };
      const service = new BookingsService(
        prisma as unknown as PrismaService,
        { requireScope: jest.fn() } as unknown as AccessControlService,
        notifications as unknown as NotificationsService,
        {} as never,
        {} as never,
      );
      return { service, prisma, notifications };
    };

    // TC-S2-41 · US-21 AC-1 · setup: none (unit) · fails if the queue read with no query is not the pending view
    // Code: BookingsService.findQueue (query defaults to {})
    it('reads the pending queue when no query is given', async () => {
      const { service, prisma } = build();

      await service.findQueue(staff);

      expect(prisma.venueBooking.findMany.mock.calls[0][0].where.status).toEqual({ in: [BookingStatus.REQUESTED] });
    });

    // TC-S3-67, TC-S2-52 · US-41 AC-5, US-22 AC-5 · setup: none (unit) · fails if a rejection naming a nameless venue, event or suggestion cannot be worded
    // Code: BookingsService.recordDecision (suggestion names) -> notifyDecision (venue and event fallbacks)
    it('words a rejection with suggestions for nameless venues and events', async () => {
      const { service, notifications } = build({ ...nameless, decisions: [{ suggestions: [{ venue: { name: null } }] }] });

      await service.reject(staff, 'BKG-001', { reason: 'Closed', alternativeVenueIds: ['VEN-002'] });

      expect(notifications.notifySafely.mock.calls[0][0].message).toBe(
        'The booking of a venue for "your event" was rejected. Reason: Closed Alternative venues suggested: unnamed venue.',
      );
    });

    // TC-S3-67 · US-41 AC-5 · setup: none (unit) · fails if a rejection whose suggestions were not recorded breaks the notice
    // Code: BookingsService.recordDecision (no decision row -> no suggestions); notifyDecision (no suggestions given)
    it('sends a plain notice when no suggestions were recorded or given', async () => {
      const { service, notifications } = build({ ...nameless, decisions: [] });

      await service.reject(staff, 'BKG-001', { reason: 'Closed', alternativeVenueIds: ['VEN-002'] });
      await service['notifyDecision'](nameless as never, BookingDecisionKind.DECISION);

      for (const [{ message }] of notifications.notifySafely.mock.calls) {
        expect(message).toBe('The booking of a venue for "your event" was rejected. Reason: Closed');
      }
    });
  });

  // TC-S2-153 · US-35 AC-3 · setup: none (unit) · fails if a withdrawal from a nameless event cannot be worded
  // Code: RegistrationsService.withdraw (name fallback)
  it('words a withdrawal notice for an event with no name', async () => {
    const event = { id: 'EVT-001', name: null, status: EventStatus.CONFIRMED, proposedStart: null, proposedEnd: null, venueBookings: [] };
    const registration = {
      id: 'REG-001',
      status: RegistrationStatus.WITHDRAWN,
      createdAt: new Date(),
      withdrawnAt: new Date(),
      phone: '+6591234567',
      accessibilityFeature: null,
      accessibilityNeeds: null,
      event,
    };
    const notifications = { notifySafely: jest.fn().mockResolvedValue(undefined) };
    const service = new RegistrationsService(
      { $transaction: jest.fn().mockResolvedValue({ registration, eventId: 'EVT-001', eventName: null }) } as unknown as PrismaService,
      { requireScope: jest.fn() } as unknown as AccessControlService,
      notifications as unknown as NotificationsService,
    );

    await service.withdraw({ userId: 'USR-020', role: Role.ATTENDEE, jti: 'j' }, 'REG-001');

    expect(notifications.notifySafely.mock.calls[0][0].message).toBe('Your registration for "the event" has been withdrawn.');
  });

  describe('EventsChangeRequestService (US-36)', () => {
    const organiser: AuthenticatedUser = { userId: 'USR-006', role: Role.EVENT_ORGANISER, jti: 'j' };
    const start = new Date(Date.now() + 30 * 864e5);
    const build = () => {
      const prisma = {
        equipmentRequirement: { findMany: jest.fn().mockResolvedValue([]) },
        eventChangeRequest: { findFirst: jest.fn().mockResolvedValue(null), create: jest.fn().mockResolvedValue({}) },
      };
      const access = {
        assertEventAccess: jest.fn().mockResolvedValue({
          id: 'EVT-001',
          name: 'Gala',
          coordinatorId: null,
          status: EventStatus.SUBMITTED,
          proposedStart: start,
          proposedEnd: new Date(start.getTime() + 3_600_000),
          expectedAttendance: 50,
        }),
      };
      const service = new EventsChangeRequestService(prisma as unknown as PrismaService, access as unknown as AccessControlService);
      return { service, prisma };
    };

    // TC-S2-164 · US-36 AC-5 · setup: none (unit) · fails if an equipment change with no list is not stored as "remove everything"
    // Code: EventsChangeRequestService.request (dto.equipment ?? [])
    it('stores an equipment change with no list as an empty list', async () => {
      const { service, prisma } = build();
      jest.spyOn(changeRequestRules, 'evaluateChangeRequest').mockReturnValue({ errors: [], changed: ['equipment'] } as never);

      await service.request(organiser, 'EVT-001', { reason: 'Fewer mics' });

      expect(prisma.eventChangeRequest.create.mock.calls[0][0].data.equipment).toEqual({ create: [] });
    });

    // TC-S2-167 · US-36 AC-8 · setup: none (unit) · fails if a database error other than the one-pending race is swallowed or reworded
    // Code: EventsChangeRequestService.request (rethrows anything but P2002)
    it('passes on a database error other than the one-pending race', async () => {
      const { service, prisma } = build();
      prisma.eventChangeRequest.create.mockRejectedValue(new Error('connection lost'));

      await expect(service.request(organiser, 'EVT-001', { reason: 'Later', proposedAttendance: 80 })).rejects.toThrow(
        'connection lost',
      );
    });
  });

  describe('EventsChangeReviewService (US-37)', () => {
    const coordinator: AuthenticatedUser = { userId: 'USR-004', role: Role.EVENT_COORDINATOR, jti: 'j' };
    const event = {
      id: 'EVT-001',
      name: null,
      organiserId: 'USR-006',
      status: EventStatus.CONFIRMED,
      proposedStart: new Date(Date.now() + 30 * 864e5),
      proposedEnd: new Date(Date.now() + 30 * 864e5 + 3_600_000),
    };
    const build = () => {
      const notifications = { notifySafely: jest.fn().mockResolvedValue(undefined) };
      const attendeeChanges = { notifyRegisteredAttendees: jest.fn().mockResolvedValue(undefined) };
      const service = new EventsChangeReviewService(
        { $transaction: jest.fn().mockResolvedValue({ change: null }) } as unknown as PrismaService,
        {} as AccessControlService,
        { confirmedArrangements: jest.fn().mockResolvedValue([]) } as never,
        {} as never,
        {} as never,
        {} as never,
        notifications as unknown as NotificationsService,
        {} as never,
        attendeeChanges as never,
      );
      return { service, notifications, attendeeChanges };
    };

    // TC-S2-177, TC-S2-176 · US-37 AC-4, AC-5 · setup: none (unit) · fails if an approval with no history entry, or of a nameless event, breaks the notices
    // Code: EventsChangeReviewService.approve (change?.changes ?? []) -> notifyOrganiser (name fallback)
    it('notifies on an approval with no history entry for a nameless event', async () => {
      const { service, notifications, attendeeChanges } = build();
      jest.spyOn(service as never, 'load').mockResolvedValue({
        request: { status: ChangeRequestStatus.PENDING, proposedStart: null, proposedEnd: null },
        event,
      } as never);

      await service.approve(coordinator, 'CRQ-001');

      expect(notifications.notifySafely.mock.calls[0][0].message).toBe(
        'Your change request for "your event" was approved; the event has been updated.',
      );
      expect(attendeeChanges.notifyRegisteredAttendees).toHaveBeenCalledWith(event, []);
    });

    // TC-S2-177 · US-37 AC-4 · setup: none (unit) · fails if an event with no dates is treated as moved
    // Code: EventsChangeReviewService.newWindow (no dates -> null)
    it('an event with no dates has no window to move', () => {
      const { service } = build();

      expect(
        service['newWindow']({ proposedStart: event.proposedStart, proposedEnd: null }, { proposedStart: null, proposedEnd: null }),
      ).toBeNull();
    });
  });
});
