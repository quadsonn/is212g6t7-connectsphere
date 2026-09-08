import { Injectable } from '@nestjs/common';
import { BookingStatus } from '@prisma/client';

import { PrismaService } from '../prisma/prisma.service';
import { VenueBookingImpact, VenueBookingLookup } from './booking-impact';

/**
 * E5 — venue booking requests, approval, conflict detection.
 *
 * Only the lookup half exists, raised by US-14 AC-3. Everything else in the
 * booking workflow is still to be built.
 */
@Injectable()
export class BookingsService implements VenueBookingLookup {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * AMBIGUOUS: "active/upcoming" is read as "has not finished yet, and is
   * still live". REQUESTED and APPROVED both qualify — a pending request is
   * as much at risk from a capacity cut as an approved one. REJECTED bookings
   * are excluded: nothing depends on them.
   */
  async findLiveBookingsForVenue(
    venueId: string,
    now: Date = new Date(),
  ): Promise<VenueBookingImpact[]> {
    const bookings = await this.prisma.venueBooking.findMany({
      where: {
        venueId,
        end: { gte: now },
        status: { in: [BookingStatus.REQUESTED, BookingStatus.APPROVED] },
      },
      orderBy: { start: 'asc' },
    });

    return bookings.map((booking) => ({
      bookingId: booking.id,
      eventId: booking.eventId,
      start: booking.start,
      end: booking.end,
      status: booking.status,
    }));
  }
}
