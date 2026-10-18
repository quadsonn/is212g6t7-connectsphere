import { Role } from '@prisma/client';

import { linkFor, splitReason } from './notification-view';

/** Notifications page — how a stored notification is presented. */
describe('Notifications page: presenting a notification', () => {
  describe('links to the related event, on the reader’s own page for it', () => {
    it.each([
      [Role.EVENT_ORGANISER, '/organiser/e1'],
      [Role.EVENT_COORDINATOR, '/coordinator/events/e1'],
      [Role.VENUE_STAFF, '/venues/events/e1'],
      [Role.TECHNICAL_SUPPORT_STAFF, '/equipment/requirements/e1'],
    ])('%s → %s', (role, link) => {
      expect(linkFor(role, 'e1')).toBe(link);
    });

    it.each([Role.ATTENDEE, Role.EVENT_COORDINATOR_LEAD, Role.SAFETY_OFFICER])(
      'gives %s no link — it has no event page to go to',
      (role) => {
        expect(linkFor(role, 'e1')).toBeNull();
      },
    );

    it('US-40 AC-3: Venue Staff go to the booking request itself when there is one', () => {
      expect(linkFor(Role.VENUE_STAFF, 'e1', 'b1')).toBe('/venues/bookings/b1');
    });

    it('US-40: other roles keep the event link even when a booking is named', () => {
      expect(linkFor(Role.EVENT_COORDINATOR, 'e1', 'b1')).toBe('/coordinator/events/e1');
    });

    it('gives no link when the notification names no event', () => {
      expect(linkFor(Role.EVENT_COORDINATOR, null)).toBeNull();
    });
  });

  describe('separates the reason from the message', () => {
    it('US-47 AC-6: the rejection reason and comment', () => {
      expect(
        splitReason(
          'Your event request "Gala" has been rejected because it cannot be fulfilled. Reason: No suitable venue: All halls are full.',
        ),
      ).toEqual({
        summary: 'Your event request "Gala" has been rejected because it cannot be fulfilled.',
        reason: 'No suitable venue: All halls are full.',
      });
    });

    it('US-52 AC-1: keeps everything after the reason', () => {
      expect(
        splitReason(
          'Main Hall is unavailable from A to B, affecting the booking for "Gala" on C – D. Reason: Flood. The event has not been cancelled; request a replacement venue.',
        ).reason,
      ).toBe('Flood. The event has not been cancelled; request a replacement venue.');
    });

    it('US-41: keeps the suggested alternatives with the rejection reason', () => {
      expect(
        splitReason(
          'the booking of Main Hall for "Gala" was rejected. Reason: Closed. Alternative venues suggested: East Hall.',
        ),
      ).toEqual({
        summary: 'the booking of Main Hall for "Gala" was rejected.',
        reason: 'Closed. Alternative venues suggested: East Hall.',
      });
    });

    it('US-48 AC-9: an approval has no reason', () => {
      expect(
        splitReason('Your change request for "Gala" was approved; the event has been updated.'),
      ).toEqual({
        summary: 'Your change request for "Gala" was approved; the event has been updated.',
        reason: null,
      });
    });
  });
});
