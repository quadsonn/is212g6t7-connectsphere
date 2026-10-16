import { BookingStatus } from '@prisma/client';

import { AccessControlService } from '../common/access/access-control.service';
import { NotificationsService } from '../notifications/notifications.service';
import { PrismaService } from '../prisma/prisma.service';
import { BookingsService } from './bookings.service';
import { HoldNotifier } from './hold-notifier';
import { VenueActivityNotifier } from './venue-activity-notifier';

/** US-38 — an event's dates change, so its live bookings move with it. */
describe('BookingsService.rescheduleForEventChange (US-38)', () => {
  const at = (day: number, hour: number) => new Date(Date.UTC(2030, 9, day, hour, 0, 0));

  const from = { start: at(1, 9), end: at(1, 17) };
  const to = { start: at(8, 9), end: at(8, 17) };

  const row = (overrides: Record<string, unknown> = {}) => ({
    id: 'booking-1',
    venueId: 'venue-1',
    status: BookingStatus.APPROVED,
    start: at(1, 8),
    end: at(1, 18),
    venue: { name: 'Main Hall' },
    ...overrides,
  });

  let tx: {
    venueBooking: { findMany: jest.Mock; update: jest.Mock; updateMany: jest.Mock };
    venue: { findUniqueOrThrow: jest.Mock };
    $executeRaw: jest.Mock;
  };
  let service: BookingsService;
  // The event's live bookings; and (US-51) the venue's flagged bookings,
  // which the re-check after the move asks for separately.
  let liveRows: ReturnType<typeof row>[];
  let flaggedRows: { id: string; status: BookingStatus }[];
  // US-54: the event's live holds, which are released rather than moved.
  let heldRows: { id: string; venueId: string; status: BookingStatus }[];
  let holdNotifier: { released: jest.Mock };

  beforeEach(() => {
    liveRows = [row()];
    flaggedRows = [];
    heldRows = [];
    holdNotifier = { released: jest.fn() };
    tx = {
      venueBooking: {
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
        update: jest.fn().mockResolvedValue({}),
        updateMany: jest.fn().mockResolvedValue({ count: 0 }),
      },
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

  it('US-54: releases the event’s live holds instead of moving them, and tells the Coordinator', async () => {
    heldRows = [{ id: 'hold-1', venueId: 'venue-1', status: BookingStatus.HELD }];

    await run();

    expect(tx.venueBooking.update).toHaveBeenCalledWith({
      where: { id: 'hold-1' },
      data: expect.objectContaining({ status: BookingStatus.RELEASED, releaseReason: 'Event rescheduled' }),
    });
    expect(holdNotifier.released).toHaveBeenCalledWith(tx, 'hold-1', 'Event rescheduled');
  });

  const run = () => service.rescheduleForEventChange(tx as never, 'event-1', from, to);

  it('looks only at this event’s live bookings', async () => {
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

  it('moves the booking by the event’s offset, keeping setup and teardown time', async () => {
    await run();

    expect(tx.venueBooking.update).toHaveBeenCalledWith({
      where: { id: 'booking-1' },
      data: expect.objectContaining({ start: at(8, 8), end: at(8, 18) }),
    });
  });

  it('puts an approved booking back to REQUESTED so Venue Staff decide again', async () => {
    await run();

    expect(tx.venueBooking.update.mock.calls[0][0].data.status).toBe(BookingStatus.REQUESTED);
  });

  it('leaves a note saying why, where the decision reason is shown', async () => {
    await run();

    expect(tx.venueBooking.update.mock.calls[0][0].data.decisionReason).toMatch(
      /rescheduled.*approved again/,
    );
  });

  it('serialises writes on the venue, as every booking write does', async () => {
    await run();

    expect(tx.$executeRaw).toHaveBeenCalledTimes(1);
  });

  it('reports each booking, its previous status, and where it was and is now', async () => {
    const moved = await run();

    expect(moved).toEqual([
      {
        bookingId: 'booking-1',
        venueId: 'venue-1',
        venueName: 'Main Hall',
        previousStatus: BookingStatus.APPROVED,
        from: { start: at(1, 8), end: at(1, 18) },
        to: { start: at(8, 8), end: at(8, 18) },
      },
    ]);
  });

  it('moves every live booking, including a pending one', async () => {
    liveRows = [
      row(),
      row({ id: 'booking-2', venueId: 'venue-2', status: BookingStatus.REQUESTED }),
    ];

    const moved = await run();

    expect(moved.map((m) => m.bookingId)).toEqual(['booking-1', 'booking-2']);
    expect(tx.venueBooking.update).toHaveBeenCalledTimes(2);
  });

  it('does nothing when the event has no live bookings', async () => {
    liveRows = [];

    await expect(run()).resolves.toEqual([]);
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
});
