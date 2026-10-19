import { BookingStatus } from '@prisma/client';

import { ACTIVE_BOOKING_STATUSES, venueArrangement } from './venue-arrangement';

const { REQUESTED, APPROVED, REJECTED, RELEASED } = BookingStatus;
const bookings = (...statuses: BookingStatus[]) => statuses.map((status) => ({ status }));

/** US-53 — "venue arranged", derived from the event's bookings. */
describe('US-53 venue arrangement', () => {
  it('US-53: active means still asking for or holding a venue', () => {
    expect(ACTIVE_BOOKING_STATUSES).toEqual([REQUESTED, APPROVED]);
  });

  describe('US-53 AC-5: arranged only when every required (active) venue is approved', () => {
    it('is not arranged with no bookings at all', () => {
      expect(venueArrangement([])).toEqual({
        arranged: false,
        activeBookings: 0,
        approvedBookings: 0,
        pendingBookings: 0,
      });
    });

    it('is not arranged while any active booking is pending', () => {
      expect(venueArrangement(bookings(APPROVED, REQUESTED, APPROVED))).toEqual({
        arranged: false,
        activeBookings: 3,
        approvedBookings: 2,
        pendingBookings: 1,
      });
    });

    it('is arranged once every active booking is approved', () => {
      expect(venueArrangement(bookings(APPROVED, APPROVED)).arranged).toBe(true);
    });

    it('is not arranged again once a new, unapproved booking is added', () => {
      expect(venueArrangement(bookings(APPROVED, APPROVED, REQUESTED)).arranged).toBe(false);
    });

    it('ignores rejected and released bookings — they are not required', () => {
      expect(venueArrangement(bookings(APPROVED, REJECTED, RELEASED))).toEqual({
        arranged: true,
        activeBookings: 1,
        approvedBookings: 1,
        pendingBookings: 0,
      });
    });

    it('is not arranged when nothing active remains', () => {
      expect(venueArrangement(bookings(REJECTED, RELEASED)).arranged).toBe(false);
    });
  });
});
