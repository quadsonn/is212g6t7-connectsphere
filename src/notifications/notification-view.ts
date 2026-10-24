import { EventStatus, Role } from '@prisma/client';

import { ATTENDEE_VISIBLE_STATUSES } from '../events/event-status.machine';

/**
 * Notifications page — how a stored notification is presented. Pure, so it is
 * unit-tested directly.
 *
 * Nothing about what other stories send is changed: their message, type and
 * related event are read as they are.
 */

/**
 * Where a notification leads: the related event's page for the reader's role.
 *
 * Every notification records its event (relatedEventId); none records a
 * booking or change request, and adding that would mean changing what the
 * sending stories store. The event pages reach both: the Coordinator's lists
 * its bookings and the Organiser's shows its change request.
 *
 * The Attendee goes to their own event page (/events/:id), the same one they
 * reach from Browse events and My registrations — but only when the event is
 * still one they may open. That page serves ATTENDEE_VISIBLE_STATUSES only, so
 * a notification about an event they can no longer view (a cancellation, say)
 * stays unlinked rather than leading to a 404. When the status is not supplied
 * the link is given anyway and the page handles an unreadable event itself.
 *
 * A Coordinator Lead goes to their incoming-work queue (where a just-submitted
 * request waits).
 *
 * US-64: a Safety Officer goes to the event's safety review. The packet opens
 * only while the event is in the Safety queue; afterwards the page shows its
 * error state rather than the review.
 *
 * US-40 AC-3: a venue activity notification names its booking request, and
 * Venue Staff go straight to that request in their queue.
 *
 * US-60: an equipment status-change notice names its item, and Technical
 * Support go straight to that item in the catalogue.
 */
export function linkFor(
  role: string,
  relatedEventId: string | null,
  relatedBookingId: string | null = null,
  relatedEquipmentId: string | null = null,
  relatedEventStatus: EventStatus | null = null,
): string | null {
  if (role === Role.VENUE_STAFF && relatedBookingId) {
    return `/venues/bookings/${relatedBookingId}`;
  }
  if (role === Role.TECHNICAL_SUPPORT_STAFF && relatedEquipmentId) {
    return `/equipment/inventory/${relatedEquipmentId}`;
  }
  if (!relatedEventId) return null;

  switch (role) {
    case Role.EVENT_ORGANISER:
      return `/organiser/${relatedEventId}`;
    case Role.EVENT_COORDINATOR:
      return `/coordinator/events/${relatedEventId}`;
    case Role.VENUE_STAFF:
      return `/venues/events/${relatedEventId}`;
    case Role.TECHNICAL_SUPPORT_STAFF:
      return `/equipment/requirements/${relatedEventId}`;
    case Role.SAFETY_OFFICER:
      return `/safety/checks/${relatedEventId}`;
    case Role.EVENT_COORDINATOR_LEAD:
      // The Lead's incoming-work queue. It lists unassigned requests, so the
      // link is live while a just-submitted request is waiting; once the
      // request is assigned it is no longer there (it moves to a Coordinator).
      return `/lead/unassigned/${relatedEventId}`;
    case Role.ATTENDEE:
      return relatedEventStatus === null ||
        ATTENDEE_VISIBLE_STATUSES.includes(relatedEventStatus)
        ? `/events/${relatedEventId}`
        : null;
    default:
      return null;
  }
}

/**
 * The reason, where the message carries one. Every sender that gives a reason
 * writes it as "… Reason: <reason>" (US-23, US-47, US-48, US-52). Everything
 * after "Reason: " is kept as the reason, including any sentences that follow
 * it (US-41's suggested alternatives, US-52's "request a replacement"), so
 * nothing in the message is lost.
 */
export function splitReason(message: string): { summary: string; reason: string | null } {
  const marker = message.indexOf(' Reason: ');
  if (marker === -1) return { summary: message, reason: null };

  const summary = message.slice(0, marker).trim();
  const rest = message.slice(marker + ' Reason: '.length).trim();
  return { summary, reason: rest.length > 0 ? rest : null };
}
