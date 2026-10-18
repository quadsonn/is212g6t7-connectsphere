import { Module } from '@nestjs/common';

import { NotificationsModule } from '../notifications/notifications.module';
import { BookingsController } from './bookings.controller';
import { BookingSuggestionsService } from './booking-suggestions.service';
import { BookingsService } from './bookings.service';
import { VenueUnavailabilityService } from './venue-unavailability.service';
import { CalendarController } from './calendar.controller';
import { CalendarService } from './calendar.service';
import { VenueBookingLookup } from './booking-impact';

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
    BookingSuggestionsService,
    CalendarService,
    VenueUnavailabilityService,
    { provide: VenueBookingLookup, useExisting: BookingsService },
  ],
  // VenueUnavailabilityService: the #57 hook (US-52) — exported for the
  // module that will mark venues unavailable.
  exports: [VenueBookingLookup, BookingsService, VenueUnavailabilityService],
})
export class BookingsModule {}
