import { Role } from '@prisma/client';

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
 * Roles with no event page of their own (Attendee, Coordinator Lead, Safety
 * Officer) get no link, rather than one that would 404 or bounce them home.
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
