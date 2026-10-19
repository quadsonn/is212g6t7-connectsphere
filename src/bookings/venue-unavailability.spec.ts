import { BookingStatus } from '@prisma/client';

import {
  AFFECTED_BOOKING_STATUSES,
  needsReplacement,
  unavailableMessage,
} from './venue-unavailability';

/** US-52 — the rules for a booked venue becoming unavailable. */
describe('US-52 venue unavailability rules', () => {
  it('US-52: only live bookings — requested or approved — can be affected', () => {
    expect(AFFECTED_BOOKING_STATUSES).toEqual([BookingStatus.REQUESTED, BookingStatus.APPROVED]);
    expect(AFFECTED_BOOKING_STATUSES).not.toContain(BookingStatus.REJECTED);
    expect(AFFECTED_BOOKING_STATUSES).not.toContain(BookingStatus.RELEASED);
  });

  describe('US-52 AC-2/AC-5: the "Venue unavailable" flag', () => {
    it('is up once a booking is marked and no replacement is confirmed', () => {
      expect(
        needsReplacement({ replacementNeededAt: new Date(), replacedByBookingId: null }),
      ).toBe(true);
    });

    it('clears when a replacement is confirmed', () => {
      expect(
        needsReplacement({ replacementNeededAt: new Date(), replacedByBookingId: 'b2' }),
      ).toBe(false);
    });

    it('is never up on a booking that was not marked', () => {
      expect(needsReplacement({ replacementNeededAt: null, replacedByBookingId: null })).toBe(
        false,
      );
    });
  });

  describe('US-52 AC-1: the notification', () => {
    it('names the event, the venue, the affected dates and the reason', () => {
      expect(
        unavailableMessage({
          eventName: 'Showcase',
          venueName: 'Main Hall',
          booking: {
            start: new Date('2030-10-01T09:00:00Z'),
            end: new Date('2030-10-01T12:00:00Z'),
          },
          period: {
            start: new Date('2030-09-28T00:00:00Z'),
            end: new Date('2030-10-03T00:00:00Z'),
          },
          reason: 'Flood damage',
        }),
      ).toBe(
        'Main Hall is unavailable from 2030-09-28T00:00:00.000Z to 2030-10-03T00:00:00.000Z, ' +
          'affecting the booking for "Showcase" on 2030-10-01T09:00:00.000Z – 2030-10-01T12:00:00.000Z. ' +
          'Reason: Flood damage. The event has not been cancelled; request a replacement venue.',
      );
    });

    it('still reads when the event or venue has no name recorded', () => {
      const message = unavailableMessage({
        eventName: null,
        venueName: null,
        booking: { start: new Date(0), end: new Date(1) },
        period: { start: new Date(0), end: new Date(1) },
        reason: 'Closed',
      });

      expect(message).toMatch(/^A booked venue is unavailable/);
      expect(message).toContain('"your event"');
    });
  });
});
