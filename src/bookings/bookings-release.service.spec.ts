import { BookingStatus } from '@prisma/client';

import { AccessControlService } from '../common/access/access-control.service';
import { NotificationsService } from '../notifications/notifications.service';
import { PrismaService } from '../prisma/prisma.service';
import { BookingsService } from './bookings.service';
import { HoldNotifier } from './hold-notifier';
import { VenueActivityNotifier } from './venue-activity-notifier';

/**
 * US-43 AC-4/AC-5 — what a cancellation will give back, for the Organiser's
 * summary. The release itself is US-44's releaseForCancelledEvent, run by
 * EventsService.setStatus(CANCELLED); see test/us44-release-on-cancel.e2e-spec.ts.
 */
describe('BookingsService.countReleasableForEvent (US-43)', () => {
  let tx: { venueBooking: { count: jest.Mock } };
  let service: BookingsService;

  beforeEach(() => {
    tx = { venueBooking: { count: jest.fn().mockResolvedValue(3) } };
    service = new BookingsService(
      {} as PrismaService,
      {} as AccessControlService,
      {} as NotificationsService,
      {} as VenueActivityNotifier,
      {} as HoldNotifier,
    );
  });

  it('counts the pending, approved and held bookings of the event, across every venue', async () => {
    await expect(service.countReleasableForEvent('event-1', tx as never)).resolves.toBe(3);

    expect(tx.venueBooking.count).toHaveBeenCalledWith({
      where: {
        eventId: 'event-1',
        status: { in: [BookingStatus.REQUESTED, BookingStatus.APPROVED, BookingStatus.HELD] },
      },
    });
  });

  it('leaves rejected and already-released bookings out', async () => {
    await service.countReleasableForEvent('event-1', tx as never);

    const statuses = tx.venueBooking.count.mock.calls[0][0].where.status.in;
    expect(statuses).not.toContain(BookingStatus.REJECTED);
    expect(statuses).not.toContain(BookingStatus.RELEASED);
  });
});
