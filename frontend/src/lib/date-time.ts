/**
 * Date + time-slot helpers for forms that pick a start and end, matching the
 * event request form (organiser-new-request.tsx): a native date picker beside
 * a dropdown of 30-minute slots.
 *
 * TODO: organiser-new-request.tsx still has its own copies of these. Point it
 * here once the sprint-2 branches are merged, to avoid a conflict meanwhile.
 */

export interface TimeSlot {
  value: string;
  label: string;
}

/**
 * Bookable times run 6:00 AM–11:30 PM in 30-minute blocks, matching venue
 * operating hours — the same range the event request form offers.
 */
function buildTimeSlots(fromHour = 6): TimeSlot[] {
  const slots: TimeSlot[] = [];
  for (let minutes = fromHour * 60; minutes < 24 * 60; minutes += 30) {
    const hours24 = Math.floor(minutes / 60);
    const mins = minutes % 60;
    const value = `${String(hours24).padStart(2, '0')}:${String(mins).padStart(2, '0')}`;
    slots.push({ value, label: formatSlotLabel(value) });
  }
  return slots;
}

/** "13:30" → "1:30 PM". */
export function formatSlotLabel(value: string): string {
  const [hours24, mins] = value.split(':').map(Number);
  const period = hours24 < 12 ? 'AM' : 'PM';
  const hours12 = hours24 % 12 === 0 ? 12 : hours24 % 12;
  return `${hours12}:${String(mins).padStart(2, '0')} ${period}`;
}

export const TIME_SLOTS = buildTimeSlots();

/** Start times stop half an hour before the last end time. */
export const START_TIME_SLOTS = TIME_SLOTS.slice(0, -1);

/**
 * The whole day, 12:00 AM–11:30 PM, for things that are not bound by venue
 * operating hours — e.g. a venue blocked out overnight for maintenance (US-16).
 */
export const FULL_DAY_TIME_SLOTS = buildTimeSlots(0);

/**
 * The slot list, plus `current` if it falls off the 30-minute grid (e.g. a
 * time prefilled from a stored event), so a prefilled value is never hidden.
 */
export function slotsIncluding(slots: TimeSlot[], current: string): TimeSlot[] {
  if (!current || slots.some((slot) => slot.value === current)) return slots;
  return [...slots, { value: current, label: formatSlotLabel(current) }].sort((a, b) =>
    a.value.localeCompare(b.value),
  );
}

/**
 * Event and booking times are authored in Singapore time (GMT+8) — the venue's
 * timezone — so a typed "9:00" means 9:00 at the venue, whoever enters it and
 * wherever their device clock is set. Singapore has a permanent +08:00 offset
 * with no daylight saving, so the conversion is exact without a date library.
 *
 * (Read-only displays of these instants are shown in each viewer's own
 * timezone — see formatDateTime in lib/utils.ts. This pair governs only the
 * entry/edit forms, whose canonical zone is the venue's.)
 */
export const APP_TIME_ZONE = 'Asia/Singapore';
const APP_UTC_OFFSET = '+08:00';

/** Joins the separate date and time inputs into "YYYY-MM-DDTHH:mm". */
export function combineDateTime(date: string, time: string): string {
  return date && time ? `${date}T${time}` : '';
}

/** A "YYYY-MM-DDTHH:mm" wall-clock (read as Singapore time) → the UTC instant. */
export function localStringToInstant(local: string): string {
  if (!local || local.length < 16) return '';
  const instant = new Date(`${local.slice(0, 16)}:00${APP_UTC_OFFSET}`);
  return Number.isNaN(instant.getTime()) ? '' : instant.toISOString();
}

/** A UTC instant → the "YYYY-MM-DDTHH:mm" wall-clock at the venue (Singapore). */
export function instantToLocalString(iso: string | null): string {
  if (!iso) return '';
  const instant = new Date(iso);
  if (Number.isNaN(instant.getTime())) return '';
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: APP_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(instant);
  const get = (type: string) => parts.find((part) => part.type === type)?.value ?? '';
  return `${get('year')}-${get('month')}-${get('day')}T${get('hour')}:${get('minute')}`;
}

/** Splits a stored instant into the Singapore date and time the inputs show. */
export function isoToLocalParts(iso: string | null): { date: string; time: string } {
  const local = instantToLocalString(iso);
  return local ? { date: local.slice(0, 10), time: local.slice(11, 16) } : { date: '', time: '' };
}

/** The two inputs → a UTC instant, reading the typed value as Singapore time. */
export function partsToInstant(date: string, time: string): string {
  return localStringToInstant(combineDateTime(date, time));
}
