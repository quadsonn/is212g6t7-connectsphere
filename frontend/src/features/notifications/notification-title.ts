/**
 * How a notification reads in the bell and on the Notifications page. Both use
 * these helpers, so the two never disagree.
 *
 * Every row has the same shape: a short title for its type (what happened), the
 * stored message as the detail, the reason on its own line, then the event and
 * time. Stored messages are shown as they are; only the title and the reason's
 * label come from here, so notifications recorded before this format read the
 * same way.
 *
 * Titles are per type, not per outcome: one type may carry an approval or a
 * rejection, and the message says which.
 */
const TITLES: Record<string, string> = {
  // Event review and status (US-07/US-08, US-42, US-47).
  EVENT_STATUS_CHANGED: 'Event status updated',
  EVENT_CHANGE_REQUESTED: 'Change requested',
  // US-09.
  CLARIFICATION_REQUESTED: 'Clarification requested',
  CLARIFICATION_ANSWERED: 'Clarification answered',
  // Venue changes and booking decisions (US-14, US-23, US-52).
  VENUE_CHANGED_BOOKINGS_AFFECTED: 'Venue changed',
  VENUE_BOOKING_DECIDED: 'Venue booking decision',
  VENUE_UNAVAILABLE: 'Venue unavailable',
  // US-40 venue activity, for the venue's manager.
  BOOKING_REQUEST_SUBMITTED: 'New booking request',
  BOOKING_DETAILS_CHANGED: 'Approved booking changed',
  BOOKING_EVENT_CANCELLED: 'Event cancelled',
  // US-54 holds.
  HOLD_PLACED: 'Venue held',
  HOLD_EXPIRING: 'Hold expiring soon',
  HOLD_EXPIRED: 'Hold expired',
  HOLD_RELEASED: 'Hold released',
  // US-32: what was reserved and when.
  EQUIPMENT_RESERVATION_DECIDED: 'Equipment reserved',
  // Coordinator assignment (Lead stories, US-27, US-65).
  EVENT_ASSIGNED: 'Event assigned to you',
  EVENT_REASSIGNED: 'Event reassigned',
  COORDINATOR_ASSIGNED: 'Coordinator assigned',
  // Registration (US-34/US-36).
  REGISTRATION_CONFIRMED: 'Registration confirmed',
  REGISTRATION_WITHDRAWN: 'Registration withdrawn',
  // US-48.
  CHANGE_REQUEST_DECIDED: 'Change request decision',
  // Requirement change 6 / US-64.
  SAFETY_CHECK_DECIDED: 'Safety check',
  SAFETY_CHECK_DUE: 'New safety check',
  // US-43, and changes to an event Attendees are registered for.
  EVENT_CANCELLED: 'Event cancelled',
  EVENT_SCHEDULE_CHANGED: 'Event details changed',
};

/**
 * The title for a type. A type added on the server before it is listed here
 * still reads as something, rather than showing an empty heading.
 */
export function notificationTitle(type: string): string {
  return TITLES[type] ?? 'Notification';
}

/**
 * What the line after " Reason: " is. A clarification request stores the
 * Coordinator's question there (US-09), which is not a reason.
 */
export function reasonLabel(type: string): string {
  return type === 'CLARIFICATION_REQUESTED' ? 'Question' : 'Reason';
}

/**
 * The detail, starting with a capital. Some notifications stored before a
 * sender was fixed begin in lower case ("the booking of …").
 */
export function notificationDetail(summary: string): string {
  return summary.charAt(0).toUpperCase() + summary.slice(1);
}
