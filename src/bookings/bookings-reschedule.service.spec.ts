import { BookingDecisionKind, BookingStatus, Prisma } from '@prisma/client';

import { AccessControlService } from '../common/access/access-control.service';
import { NotificationsService } from '../notifications/notifications.service';
import { PrismaService } from '../prisma/prisma.service';
import { BookingsService } from './bookings.service';
import { HoldNotifier } from './hold-notifier';
import { VenueActivityNotifier } from './venue-activity-notifier';

/**
 * US-48 AC-7 — an approved change request moves the event, so each live booking
 * is rebooked for the new details and the original released afterwards.
 * Replaces US-38's move, which shifted the booking and sent it back to
 * REQUESTED.
 */
describe('BookingsService.rebookForEventChange (US-48 AC-7)', () => {
  const at = (day: number, hour: number) => new Date(Date.UTC(2030, 9, day, hour, 0, 0));

  const from = { start: at(1, 9), end: at(1, 17) };
  const to = { start: at(8, 9), end: at(8, 17) };

  const decision = {
    id: 'd-1',
    bookingId: 'booking-1',
    decidedById: 'staff-1',
    kind: BookingDecisionKind.DECISION,
    outcome: BookingStatus.APPROVED,
    reason: 'Confirmed.',
    createdAt: at(1, 0),
  };

  const row = (overrides: Record<string, unknown> = {}) => ({
    id: 'booking-1',
    venueId: 'venue-1',
    status: BookingStatus.APPROVED,
    start: at(1, 8),
    end: at(1, 18),
    requestedById: 'coord-1',
    expectedAttendance: 80,
    decisionReason: 'Confirmed.',
    preferredLayout: 'THEATRE',
    layoutNotes: 'Stage',
    accessibilityRequirements: ['STEP_FREE_ACCESS'],
    accessibilityNotes: null,
    equipmentNeeds: 'PA',
    requiredFacilities: ['STAGE'],
    equipmentRequirements: [{ equipmentType: 'Projector', quantity: 2, notes: null }],
    technicalSupportNeeds: 'Sound technician',
    venue: { name: 'Main Hall' },
    decisions: [decision],
    ...overrides,
  });

  let tx: {
    venueBooking: { findMany: jest.Mock; create: jest.Mock; update: jest.Mock; updateMany: jest.Mock };
    bookingDecision: { createMany: jest.Mock };
    venue: { findUniqueOrThrow: jest.Mock };
    $executeRaw: jest.Mock;
  };
  let calls: string[];
  let service: BookingsService;
  // The event's live bookings; and (US-51) the venue's flagged bookings,
  // which the re-check after the move asks for separately.
  let liveRows: ReturnType<typeof row>[];
  let flaggedRows: { id: string; status: BookingStatus }[];
  // US-54: the event's live holds, which are released rather than moved.
  let heldRows: { id: string; venueId: string; status: BookingStatus }[];
  let holdNotifier: { released: jest.Mock };

  beforeEach(() => {
    calls = [];
    let n = 0;
    liveRows = [row()];
    flaggedRows = [];
    heldRows = [];
    holdNotifier = { released: jest.fn() };
    tx = {
      venueBooking: {
        // The event's live bookings; (US-54) its live holds; (US-51) a venue's
        // flagged bookings, which the re-check after the rebook asks for.
        findMany: jest.fn().mockImplementation(({ where }) =>
          Promise.resolve(
            where.needsReview
              ? flaggedRows
              : where.status === BookingStatus.HELD
                ? heldRows
                : where.eventId
                  ? liveRows
                  : [],
          ),
        ),
        create: jest.fn().mockImplementation(() => {
          calls.push('create');
          return Promise.resolve({ id: `new-${++n}` });
        }),
        update: jest.fn().mockImplementation(({ where, data }) => {
          calls.push(`update ${where.id} ${data.status}`);
          return Promise.resolve({});
        }),
        updateMany: jest.fn().mockResolvedValue({ count: 0 }),
      },
      bookingDecision: { createMany: jest.fn().mockResolvedValue({ count: 1 }) },
      venue: { findUniqueOrThrow: jest.fn().mockResolvedValue({ setupMinutes: 0, turnaroundMinutes: 0 }) },
      $executeRaw: jest.fn().mockResolvedValue(1),
    };
    service = new BookingsService(
      {} as PrismaService,
      {} as AccessControlService,
      {} as NotificationsService,
      { requestSubmitted: jest.fn(), approvedBookingChanged: jest.fn(), eventCancelled: jest.fn() } as unknown as VenueActivityNotifier,
      holdNotifier as unknown as HoldNotifier,
    );
  });

  const setLiveRows = (rows: ReturnType<typeof row>[]) => {
    liveRows = rows;
  };

  const run = (attendance: number | null = null) =>
    service.rebookForEventChange(tx as never, 'event-1', from, to, attendance);

  it('US-48 AC-7: looks only at this event’s live bookings', async () => {
    await run();

    expect(tx.venueBooking.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          eventId: 'event-1',
          status: { in: [BookingStatus.REQUESTED, BookingStatus.APPROVED] },
        },
      }),
    );
  });

  it('US-48 AC-7: creates a new booking at the same venue, moved by the event’s offset, with its requirements', async () => {
    await run(120);

    expect(tx.venueBooking.create).toHaveBeenCalledWith({
      data: {
        eventId: 'event-1',
        venueId: 'venue-1',
        start: at(8, 8),
        end: at(8, 18),
        requestedById: 'coord-1',
        expectedAttendance: 120,
        decisionReason: 'Confirmed.',
        preferredLayout: 'THEATRE',
        layoutNotes: 'Stage',
        accessibilityRequirements: ['STEP_FREE_ACCESS'],
        accessibilityNotes: null,
        equipmentNeeds: 'PA',
        // Story 20 AC-2: what Venue Staff approved, carried over unchanged.
        requiredFacilities: ['STAGE'],
        equipmentRequirements: [{ equipmentType: 'Projector', quantity: 2, notes: null }],
        technicalSupportNeeds: 'Sound technician',
      },
    });
  });

  it('Story 20 AC-2: a booking made before the copy existed stays "not recorded" when rebooked', async () => {
    setLiveRows([row({ equipmentRequirements: null })]);

    await run();

    expect(tx.venueBooking.create.mock.calls[0][0].data.equipmentRequirements).toBe(Prisma.DbNull);
  });

  it('US-48 AC-7: keeps the original attendance when the request does not change it', async () => {
    await run(null);

    expect(tx.venueBooking.create.mock.calls[0][0].data.expectedAttendance).toBe(80);
  });

  it('US-48 AC-7: carries the approval history over — no re-approval by Venue Staff', async () => {
    await run();

    expect(tx.bookingDecision.createMany).toHaveBeenCalledWith({
      data: [
        {
          bookingId: 'new-1',
          decidedById: 'staff-1',
          kind: BookingDecisionKind.DECISION,
          outcome: BookingStatus.APPROVED,
          reason: 'Confirmed.',
          createdAt: at(1, 0),
        },
      ],
    });
  });

  it('US-48 AC-7: releases the original only after the new one exists, then restores APPROVED', async () => {
    await run();

    expect(calls).toEqual([
      'create',
      'update booking-1 RELEASED',
      'update new-1 APPROVED',
    ]);
    expect(tx.venueBooking.update).toHaveBeenCalledWith({
      where: { id: 'booking-1' },
      data: {
        status: BookingStatus.RELEASED,
        releasedAt: expect.any(Date),
        // US-54's field, filled in by the merged rebook.
        releaseReason: "Rebooked for the event's new details",
        replacedByBookingId: 'new-1',
      },
    });
  });

  it('US-48 AC-7: releases every original before approving any replacement (no overlap with its own bookings)', async () => {
    setLiveRows([
      row(),
      row({ id: 'booking-2', start: at(1, 18), end: at(1, 20), decisions: [] }),
    ]);

    await run();

    expect(calls).toEqual([
      'create',
      'create',
      'update booking-1 RELEASED',
      'update booking-2 RELEASED',
      'update new-1 APPROVED',
      'update new-2 APPROVED',
    ]);
  });

  it('US-48 AC-7: a pending booking stays pending', async () => {
    setLiveRows([row({ status: BookingStatus.REQUESTED, decisions: [] })]);

    const moved = await run();

    expect(calls).toEqual(['create', 'update booking-1 RELEASED']);
    expect(moved[0].status).toBe(BookingStatus.REQUESTED);
    expect(tx.bookingDecision.createMany).not.toHaveBeenCalled();
  });

  it('US-48 AC-7: locks each venue once, as every booking write does', async () => {
    setLiveRows([
      row(),
      row({ id: 'booking-2', venueId: 'venue-2' }),
      row({ id: 'booking-3' }),
    ]);

    await run();

    expect(tx.$executeRaw).toHaveBeenCalledTimes(2);
  });

  it('US-48 AC-7: reports each original, its replacement, and where it was and is now', async () => {
    await expect(run()).resolves.toEqual([
      {
        bookingId: 'booking-1',
        replacementId: 'new-1',
        venueId: 'venue-1',
        venueName: 'Main Hall',
        status: BookingStatus.APPROVED,
        from: { start: at(1, 8), end: at(1, 18) },
        to: { start: at(8, 8), end: at(8, 18) },
      },
    ]);
  });

  it('US-48: does nothing for an event with no live bookings', async () => {
    setLiveRows([]);

    await expect(run()).resolves.toEqual([]);
    expect(tx.venueBooking.create).not.toHaveBeenCalled();
    expect(tx.venueBooking.update).not.toHaveBeenCalled();
  });

  it('US-51: re-checks review flags on each venue a booking moved on', async () => {
    liveRows = [
      row(),
      row({ id: 'booking-2', venueId: 'venue-2', status: BookingStatus.REQUESTED }),
    ];

    await run();

    const flagQueries = tx.venueBooking.findMany.mock.calls.filter(([args]) => args.where.needsReview);
    expect(flagQueries.map(([args]) => args.where.venueId)).toEqual(['venue-1', 'venue-2']);
  });

  it('US-51: clears a flag the move resolved', async () => {
    flaggedRows = [{ id: 'other', status: BookingStatus.APPROVED }];

    await run();

    // Nothing is live on the venue any more in this mock, so nothing clashes.
    expect(tx.venueBooking.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: { in: ['other'] } } }),
    );
  });

  it('US-54: releases the event’s live holds instead of rebooking them, and tells the Coordinator', async () => {
    heldRows = [{ id: 'hold-1', venueId: 'venue-1', status: BookingStatus.HELD }];

    await run();

    expect(tx.venueBooking.update).toHaveBeenCalledWith({
      where: { id: 'hold-1' },
      data: expect.objectContaining({ status: BookingStatus.RELEASED, releaseReason: 'Event rescheduled' }),
    });
    expect(holdNotifier.released).toHaveBeenCalledWith(tx, 'hold-1', 'Event rescheduled');
    // Only the live booking is rebooked, not the hold.
    expect(tx.venueBooking.create).toHaveBeenCalledTimes(1);
  });

  it('US-48 AC-7: releases each original with why, through the REBOOK transition', async () => {
    await run();

    expect(tx.venueBooking.update).toHaveBeenCalledWith({
      where: { id: 'booking-1' },
      data: expect.objectContaining({
        status: BookingStatus.RELEASED,
        releaseReason: "Rebooked for the event's new details",
        replacedByBookingId: 'new-1',
      }),
    });
  });

  it('US-51: re-checks review flags on each venue a booking was rebooked on', async () => {
    setLiveRows([
      row(),
      row({ id: 'booking-2', venueId: 'venue-2', status: BookingStatus.REQUESTED }),
    ]);

    await run();

    const flagQueries = tx.venueBooking.findMany.mock.calls.filter(([args]) => args.where.needsReview);
    expect(flagQueries.map(([args]) => args.where.venueId)).toEqual(['venue-1', 'venue-2']);
  });

  it('US-51: clears a flag the rebook resolved', async () => {
    flaggedRows = [{ id: 'other', status: BookingStatus.APPROVED }];

    await run();

    // Nothing else is live on the venue in this mock, so nothing clashes.
    expect(tx.venueBooking.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: { in: ['other'] } } }),
    );
  });
});
