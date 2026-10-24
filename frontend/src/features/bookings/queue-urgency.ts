/**
 * US-22 AC-5 — how close a pending request's event is, graded so only what
 * is genuinely close draws the eye.
 *
 * Counted in the viewer's calendar days (as the times on screen are), not in
 * 24-hour periods: an event at 9am tomorrow is "tomorrow" even at 11pm today.
 */
export type UrgencyLevel = 'critical' | 'soon' | 'upcoming';

export interface Urgency {
  level: UrgencyLevel;
  label: string;
}

/** Up to this many days away, a request counts as due this week. */
export const DUE_THIS_WEEK_DAYS = 7;

function startOfDay(d: Date): number {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
}

/** Whole calendar days from `now` to `start`; 0 means today. */
export function calendarDaysUntil(start: Date, now: Date): number {
  return Math.round((startOfDay(start) - startOfDay(now)) / (24 * 60 * 60 * 1000));
}

/**
 * started or today → critical (red badge); tomorrow to 2 days → soon (amber
 * badge); 3–7 days → upcoming (muted text); later → null, nothing shown.
 */
export function urgencyFor(startIso: string, now: Date = new Date()): Urgency | null {
  const start = new Date(startIso);
  if (start.getTime() <= now.getTime()) return { level: 'critical', label: 'Event has started' };

  const days = calendarDaysUntil(start, now);
  if (days <= 0) return { level: 'critical', label: 'Event today' };
  if (days === 1) return { level: 'soon', label: 'Event tomorrow' };
  if (days === 2) return { level: 'soon', label: 'Event in 2 days' };
  if (days <= DUE_THIS_WEEK_DAYS) return { level: 'upcoming', label: `in ${days} days` };
  return null;
}
