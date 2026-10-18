/**
 * Short titles for the notification types whose messages leave out the venue
 * and event names (US-40 venue activity, US-54 holds, the safety check): the
 * title says what happened, the message gives the detail, and the venue and
 * event are shown beneath. Any other type has no title and shows its full message, as before.
 */
const TITLES: Record<string, string> = {
  BOOKING_REQUEST_SUBMITTED: 'New booking request',
  BOOKING_DETAILS_CHANGED: 'Approved booking changed',
  BOOKING_EVENT_CANCELLED: 'Event cancelled',
  HOLD_PLACED: 'Venue held',
  HOLD_EXPIRING: 'Hold expiring soon',
  HOLD_EXPIRED: 'Hold expired',
  HOLD_RELEASED: 'Hold released',
  // Requirement change 6: the message starts with the outcome.
  SAFETY_CHECK_DECIDED: 'Safety check',
};

export function notificationTitle(type: string): string | null {
  return TITLES[type] ?? null;
}
