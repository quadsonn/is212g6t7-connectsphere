/**
 * How booking times read in messages. Times are stored without a zone (UTC),
 * so the zone is always stated. Shared by US-51's review reasons and US-40's
 * venue activity notifications.
 */

/** "2030-10-01 12:30 UTC". */
export function momentLabel(at: Date): string {
  return `${at.toISOString().slice(0, 16).replace('T', ' ')} UTC`;
}

/** "2030-10-01 12:30–14:00 UTC", or both dates when it spans midnight. */
export function slot(start: Date, end: Date): string {
  const iso = (d: Date) => d.toISOString().slice(0, 16).replace('T', ' ');
  const sameDay = start.toISOString().slice(0, 10) === end.toISOString().slice(0, 10);
  return `${iso(start)}–${sameDay ? end.toISOString().slice(11, 16) : iso(end)} UTC`;
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** "23 Oct", with the year only when it is not this year's. */
function shortDay(d: Date, now: Date): string {
  const year = d.getUTCFullYear() === now.getUTCFullYear() ? '' : ` ${d.getUTCFullYear()}`;
  return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}${year}`;
}

const hhmm = (d: Date) => d.toISOString().slice(11, 16);

/**
 * Notifications' shorter form: "23 Oct, 06:00–08:00 UTC", or both days when it
 * spans midnight ("23 Oct, 22:00 – 24 Oct, 02:00 UTC").
 */
export function shortSlot(start: Date, end: Date, now: Date = new Date()): string {
  const sameDay = start.toISOString().slice(0, 10) === end.toISOString().slice(0, 10);
  return sameDay
    ? `${shortDay(start, now)}, ${hhmm(start)}–${hhmm(end)} UTC`
    : `${shortDay(start, now)}, ${hhmm(start)} – ${shortDay(end, now)}, ${hhmm(end)} UTC`;
}

/** Notifications' shorter form of a moment: "18 Oct, 16:18 UTC". */
export function shortMoment(at: Date, now: Date = new Date()): string {
  return `${shortDay(at, now)}, ${hhmm(at)} UTC`;
}
