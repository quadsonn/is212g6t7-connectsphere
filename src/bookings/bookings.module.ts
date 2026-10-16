import { Module } from '@nestjs/common';

import { NotificationsModule } from '../notifications/notifications.module';
import { BookingsController } from './bookings.controller';
import { BookingsService } from './bookings.service';
import { CalendarController } from './calendar.controller';
import { CalendarService } from './calendar.service';
import { VenueBookingLookup } from './booking-impact';
import { BookingReviewService } from './booking-review.service';
import { VenueActivityNotifier } from './venue-activity-notifier';

/**
 * E5 — venue booking requests, approval, conflict detection, and (US-16)
 * the Venue Staff availability calendar built on them.
 *
 * Exposes BookingsService under the VenueBookingLookup token so consumers
 * depend on the contract rather than the implementation (US-14 AC-3).
 */
@Module({
  imports: [NotificationsModule],
  controllers: [BookingsController, CalendarController],
  providers: [
    BookingsService,
    BookingReviewService,
    CalendarService,
    VenueActivityNotifier,
    { provide: VenueBookingLookup, useExisting: BookingsService },
  ],
  exports: [VenueBookingLookup, BookingsService, BookingReviewService, VenueActivityNotifier],
})
export class BookingsModule {}
