/**
 * How often views that must stay current re-read from the server: the venue
 * calendar (US-16 AC-5) and notifications (US-40 AC-6, "within 1 minute").
 * Polling, not push — nothing in the app uses websockets.
 */
export const POLL_MS = 30_000;
