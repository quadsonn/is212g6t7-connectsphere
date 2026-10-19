import { Module } from '@nestjs/common';

import { NotificationsModule } from '../notifications/notifications.module';
import { BookingsController } from './bookings.controller';
import { BookingSuggestionsService } from './booking-suggestions.service';
import { BookingsService } from './bookings.service';
import { VenueUnavailabilityService } from './venue-unavailability.service';
import { CalendarController } from './calendar.controller';
import { CalendarService } from './calendar.service';
import { VenueBookingLookup } from './booking-impact';
import { BookingReviewService } from './booking-review.service';
import { HoldExpiryScheduler } from './hold-expiry.scheduler';
import { HoldNotifier } from './hold-notifier';
import { HoldsController } from './holds.controller';
import { HoldsService } from './holds.service';
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
  controllers: [BookingsController, CalendarController, HoldsController],
  providers: [
    BookingsService,
    BookingSuggestionsService,
    BookingReviewService,
    CalendarService,
    VenueUnavailabilityService,
    VenueActivityNotifier,
    // US-54: tentative holds.
    HoldNotifier,
    HoldsService,
    HoldExpiryScheduler,
    { provide: VenueBookingLookup, useExisting: BookingsService },
  ],
  // VenueUnavailabilityService: the #57 hook (US-52) — exported for the
  // module that will mark venues unavailable.
  exports: [
    VenueBookingLookup,
    BookingsService,
    BookingReviewService,
    VenueActivityNotifier,
    VenueUnavailabilityService,
  ],
})
export class BookingsModule {}
