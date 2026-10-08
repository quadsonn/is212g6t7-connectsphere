import { BookingStatus } from '@prisma/client';

/**
 * A booking that a venue change might invalidate.
 *
 * Deliberately a narrow projection rather than the whole VenueBooking record:
 * the venues module needs to know a booking exists and when, not how it was
 * decided.
 */
export interface VenueBookingImpact {
  bookingId: string;
  eventId: string;
  start: Date;
  end: Date;
  status: BookingStatus;
}

/**
 * US-17 — a booking reduced to when it is and whether it is settled.
 *
 * Deliberately carries no eventId or bookingId: the availability calendar is
 * shown to Coordinators who do not hold the booking, so the identifying
 * fields are dropped here, before they ever reach the venues module.
 */
export interface VenueBookingSlot {
  start: Date;
  end: Date;
  status: BookingStatus;
}

/**
 * E5 INTEGRATION POINT — the contract US-14 AC-3 depends on.
 *
 * The venues module consumes this interface rather than the bookings tables
 * directly, so when the bookings story (E5) builds out its own service it can
 * take this over without VenuesService changing.
 *
 * What exists today: a real query against VenueBooking, which is already in
 * the schema. What does not: any workflow for *acting* on an affected booking
 * — re-validating capacity, notifying the coordinator who holds it, or
 * re-opening a decision. US-14 only warns; E5 owns what happens next.
 */
export abstract class VenueBookingLookup {
  /**
   * Bookings on this venue that have not yet finished and are still live —
   * a rejected booking cannot be invalidated by a venue change.
   */
  abstract findLiveBookingsForVenue(
    venueId: string,
    now?: Date,
  ): Promise<VenueBookingImpact[]>;

  /**
   * US-17 — live bookings on this venue that overlap [from, to), as
   * anonymous slots. Past bookings are included: the calendar shows them.
   */
  abstract findBookingSlotsForVenue(
    venueId: string,
    from: Date,
    to: Date,
  ): Promise<VenueBookingSlot[]>;
}
