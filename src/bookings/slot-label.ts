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
