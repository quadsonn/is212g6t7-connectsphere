import { Module } from '@nestjs/common';

import { BookingsService } from './bookings.service';
import { VenueBookingLookup } from './booking-impact';

/**
 * E5 — venue booking requests, approval, conflict detection.
 *
 * Exposes BookingsService under the VenueBookingLookup token so consumers
 * depend on the contract rather than the implementation (US-14 AC-3).
 */
@Module({
  providers: [
    BookingsService,
    { provide: VenueBookingLookup, useExisting: BookingsService },
  ],
  exports: [VenueBookingLookup, BookingsService],
})
export class BookingsModule {}
