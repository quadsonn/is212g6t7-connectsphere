import { Injectable } from '@nestjs/common';
import { BookingStatus } from '@prisma/client';

import { PrismaService } from '../prisma/prisma.service';
import {
  VenueBookingImpact,
  VenueBookingLookup,
  VenueBookingSlot,
} from './booking-impact';

/**
 * Statuses that still hold a venue. REJECTED bookings hold nothing — nothing
 * depends on them (US-14) and they block no date (US-17).
 */
const LIVE_STATUSES: BookingStatus[] = [
  BookingStatus.REQUESTED,
  BookingStatus.APPROVED,
];

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
        status: { in: LIVE_STATUSES },
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

  /**
   * US-17 — the slots behind a venue's availability calendar.
   *
   * Overlap is half-open: a booking ending exactly at `from` does not touch
   * the range. Selects only the three columns the calendar needs, so the
   * identifying fields are never loaded, let alone returned.
   */
  async findBookingSlotsForVenue(
    venueId: string,
    from: Date,
    to: Date,
  ): Promise<VenueBookingSlot[]> {
    return this.prisma.venueBooking.findMany({
      where: {
        venueId,
        start: { lt: to },
        end: { gt: from },
        status: { in: LIVE_STATUSES },
      },
      select: { start: true, end: true, status: true },
      orderBy: { start: 'asc' },
    });
  }
}
