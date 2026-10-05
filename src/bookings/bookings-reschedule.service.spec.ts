import { BookingStatus } from '@prisma/client';

import { AccessControlService } from '../common/access/access-control.service';
import { NotificationsService } from '../notifications/notifications.service';
import { PrismaService } from '../prisma/prisma.service';
import { BookingsService } from './bookings.service';

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
    venueBooking: { findMany: jest.Mock; update: jest.Mock };
    $executeRaw: jest.Mock;
  };
  let service: BookingsService;

  beforeEach(() => {
    tx = {
      venueBooking: {
        findMany: jest.fn().mockResolvedValue([row()]),
        update: jest.fn().mockResolvedValue({}),
      },
      $executeRaw: jest.fn().mockResolvedValue(1),
    };
    service = new BookingsService(
      {} as PrismaService,
      {} as AccessControlService,
      {} as NotificationsService,
    );
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
    tx.venueBooking.findMany.mockResolvedValue([
      row(),
      row({ id: 'booking-2', venueId: 'venue-2', status: BookingStatus.REQUESTED }),
    ]);

    const moved = await run();

    expect(moved.map((m) => m.bookingId)).toEqual(['booking-1', 'booking-2']);
    expect(tx.venueBooking.update).toHaveBeenCalledTimes(2);
  });

  it('does nothing when the event has no live bookings', async () => {
    tx.venueBooking.findMany.mockResolvedValue([]);

    await expect(run()).resolves.toEqual([]);
    expect(tx.venueBooking.update).not.toHaveBeenCalled();
  });
});
