import { EventStatus, Role } from '@prisma/client';

import { linkFor, splitReason } from './notification-view';

/** Notifications page — how a stored notification is presented. */
describe('Notifications page: presenting a notification', () => {
  describe('links to the related event, on the reader’s own page for it', () => {
    it.each([
      [Role.EVENT_ORGANISER, '/organiser/e1'],
      [Role.EVENT_COORDINATOR, '/coordinator/events/e1'],
      [Role.VENUE_STAFF, '/venues/events/e1'],
      [Role.TECHNICAL_SUPPORT_STAFF, '/equipment/requirements/e1'],
      // US-64: the event's safety review.
      [Role.SAFETY_OFFICER, '/safety/checks/e1'],
      // A Coordinator Lead goes to their incoming-work queue.
      [Role.EVENT_COORDINATOR_LEAD, '/lead/unassigned/e1'],
    ])('%s → %s', (role, link) => {
      expect(linkFor(role, 'e1')).toBe(link);
    });

    it('sends an Attendee to their own event page', () => {
      expect(linkFor(Role.ATTENDEE, 'e1', null, null, EventStatus.CONFIRMED)).toBe('/events/e1');
    });

    it('links an Attendee even when the status is unknown — the page decides', () => {
      expect(linkFor(Role.ATTENDEE, 'e1')).toBe('/events/e1');
    });

    it('gives an Attendee no link for an event they can no longer open', () => {
      // A cancellation notification: CANCELLED is not attendee-visible, so the
      // link would 404. Better no link than a dead one.
      expect(linkFor(Role.ATTENDEE, 'e1', null, null, EventStatus.CANCELLED)).toBeNull();
    });

    it('US-40 AC-3: Venue Staff go to the booking request itself when there is one', () => {
      expect(linkFor(Role.VENUE_STAFF, 'e1', 'b1')).toBe('/venues/bookings/b1');
    });

    it('US-40: other roles keep the event link even when a booking is named', () => {
      expect(linkFor(Role.EVENT_COORDINATOR, 'e1', 'b1')).toBe('/coordinator/events/e1');
    });

    it('gives no link when the notification names no event', () => {
      expect(linkFor(Role.EVENT_COORDINATOR, null)).toBeNull();
    });

    // TC-S3-59 · US-40 AC-3 · setup: none (unit) · fails if Technical Support are not sent to the item a status notice names, or an unknown role gets a link
    // Code: linkFor (equipment link; default case)
    it('US-60: Technical Support go to the equipment item when one is named; an unknown role gets no link', () => {
      expect(linkFor(Role.TECHNICAL_SUPPORT_STAFF, 'e1', null, 'EQP-1')).toBe('/equipment/inventory/EQP-1');
      expect(linkFor('SOMEONE_ELSE', 'e1')).toBeNull();
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

    // TC-S3-59 · US-40 AC-3 · setup: none (unit) · fails if an empty reason after "Reason: " is shown as a blank reason
    // Code: splitReason (nothing after the marker)
    it('treats an empty reason as none', () => {
      expect(splitReason('Rejected. Reason:  ')).toEqual({ summary: 'Rejected.', reason: null });
    });
  });
});
