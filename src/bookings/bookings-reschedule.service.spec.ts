import { BookingDecisionKind, BookingStatus } from '@prisma/client';

import { AccessControlService } from '../common/access/access-control.service';
import { NotificationsService } from '../notifications/notifications.service';
import { PrismaService } from '../prisma/prisma.service';
import { BookingsService } from './bookings.service';

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
    venue: { name: 'Main Hall' },
    decisions: [decision],
    ...overrides,
  });

  let tx: {
    venueBooking: { findMany: jest.Mock; create: jest.Mock; update: jest.Mock };
    bookingDecision: { createMany: jest.Mock };
    $executeRaw: jest.Mock;
  };
  let calls: string[];
  let service: BookingsService;

  beforeEach(() => {
    calls = [];
    let n = 0;
    tx = {
      venueBooking: {
        findMany: jest.fn().mockResolvedValue([row()]),
        create: jest.fn().mockImplementation(() => {
          calls.push('create');
          return Promise.resolve({ id: `new-${++n}` });
        }),
        update: jest.fn().mockImplementation(({ where, data }) => {
          calls.push(`update ${where.id} ${data.status}`);
          return Promise.resolve({});
        }),
      },
      bookingDecision: { createMany: jest.fn().mockResolvedValue({ count: 1 }) },
      $executeRaw: jest.fn().mockResolvedValue(1),
    };
    service = new BookingsService(
      {} as PrismaService,
      {} as AccessControlService,
      {} as NotificationsService,
    );
  });

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
      },
    });
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
        replacedByBookingId: 'new-1',
      },
    });
  });

  it('US-48 AC-7: releases every original before approving any replacement (no overlap with its own bookings)', async () => {
    tx.venueBooking.findMany.mockResolvedValue([
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
    tx.venueBooking.findMany.mockResolvedValue([row({ status: BookingStatus.REQUESTED, decisions: [] })]);

    const moved = await run();

    expect(calls).toEqual(['create', 'update booking-1 RELEASED']);
    expect(moved[0].status).toBe(BookingStatus.REQUESTED);
    expect(tx.bookingDecision.createMany).not.toHaveBeenCalled();
  });

  it('US-48 AC-7: locks each venue once, as every booking write does', async () => {
    tx.venueBooking.findMany.mockResolvedValue([
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
    tx.venueBooking.findMany.mockResolvedValue([]);

    await expect(run()).resolves.toEqual([]);
    expect(tx.venueBooking.create).not.toHaveBeenCalled();
    expect(tx.venueBooking.update).not.toHaveBeenCalled();
  });
});
