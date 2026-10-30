import { Prisma } from '@prisma/client';

import { NotificationsService } from '../notifications/notifications.service';
import { VenueActivityNotifier } from './venue-activity-notifier';

/**
 * US-40 AC-1/AC-3 — what the venue manager is told when an approved booking's
 * attendance changes from nothing recorded. Every notice is otherwise proven
 * end to end in test/us40-venue-notifications.e2e-spec.ts.
 */
describe('US-40 VenueActivityNotifier', () => {
  // TC-S3-55 · US-40 AC-1 · setup: none (unit) · fails if an attendance change from no recorded number breaks the notice
  // Code: VenueActivityNotifier.approvedBookingChanged (attendance "not set")
  it('says "not set" when the booking had no attendance before', async () => {
    const tx = {
      venueBooking: {
        findUniqueOrThrow: jest.fn().mockResolvedValue({
          id: 'BKG-1',
          eventId: 'EVT-1',
          start: new Date('2030-10-01T10:00:00Z'),
          end: new Date('2030-10-01T12:00:00Z'),
          venue: { managedById: 'USR-010' },
        }),
      },
    };
    const notifications = { notify: jest.fn() };
    const notifier = new VenueActivityNotifier(notifications as unknown as NotificationsService);

    await notifier.approvedBookingChanged(tx as unknown as Prisma.TransactionClient, 'BKG-1', {
      attendance: { from: null, to: 120 },
    });

    expect(notifications.notify).toHaveBeenCalledWith(
      expect.objectContaining({ recipientId: 'USR-010', message: 'Attendance not set → 120.' }),
      tx,
    );
  });
});
