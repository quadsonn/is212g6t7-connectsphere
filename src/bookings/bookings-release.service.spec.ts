import { ConflictException } from '@nestjs/common';
import { BookingStatus } from '@prisma/client';

import { AccessControlService } from '../common/access/access-control.service';
import { NotificationsService } from '../notifications/notifications.service';
import { PrismaService } from '../prisma/prisma.service';
import { BookingsService } from './bookings.service';

/** US-43 AC-4/AC-5 — a cancelled event gives back every venue it held. */
describe('BookingsService.releaseForCancelledEvent (US-43)', () => {
  let tx: {
    eventRequest: { findUnique: jest.Mock };
    venueBooking: { updateMany: jest.Mock };
  };
  let service: BookingsService;

  beforeEach(() => {
    tx = {
      eventRequest: {
        findUnique: jest.fn().mockResolvedValue({ status: 'CANCELLED' }),
      },
      venueBooking: { updateMany: jest.fn().mockResolvedValue({ count: 3 }) },
    };
    service = new BookingsService(
      {} as PrismaService,
      {} as AccessControlService,
      {} as NotificationsService,
    );
  });

  it('releases every tentative and approved booking of the event in one update', async () => {
    const released = await service.releaseForCancelledEvent('event-1', tx as never);

    expect(released).toBe(3);
    expect(tx.venueBooking.updateMany).toHaveBeenCalledTimes(1);
    expect(tx.venueBooking.updateMany).toHaveBeenCalledWith({
      where: {
        eventId: 'event-1',
        status: { in: [BookingStatus.REQUESTED, BookingStatus.APPROVED] },
      },
      data: { status: BookingStatus.RELEASED, releasedAt: expect.any(Date) },
    });
  });

  it('is scoped to the event, not to one venue, so multi-venue events release in full', async () => {
    await service.releaseForCancelledEvent('event-1', tx as never);

    const { where } = tx.venueBooking.updateMany.mock.calls[0][0];
    expect(where).not.toHaveProperty('venueId');
  });

  it('leaves rejected and already-released bookings alone', async () => {
    await service.releaseForCancelledEvent('event-1', tx as never);

    const { where } = tx.venueBooking.updateMany.mock.calls[0][0];
    expect(where.status.in).not.toContain(BookingStatus.REJECTED);
    expect(where.status.in).not.toContain(BookingStatus.RELEASED);
  });

  it('is a no-op the second time', async () => {
    tx.venueBooking.updateMany.mockResolvedValue({ count: 0 });

    await expect(
      service.releaseForCancelledEvent('event-1', tx as never),
    ).resolves.toBe(0);
  });

  it('refuses to release the venues of an event that is still live', async () => {
    tx.eventRequest.findUnique.mockResolvedValue({ status: 'CONFIRMED' });

    await expect(
      service.releaseForCancelledEvent('event-1', tx as never),
    ).rejects.toThrow(ConflictException);
    expect(tx.venueBooking.updateMany).not.toHaveBeenCalled();
  });
});
