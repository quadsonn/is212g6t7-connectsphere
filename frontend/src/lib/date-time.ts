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
function buildTimeSlots(): TimeSlot[] {
  const slots: TimeSlot[] = [];
  for (let minutes = 6 * 60; minutes < 24 * 60; minutes += 30) {
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
 * The slot list, plus `current` if it falls off the 30-minute grid (e.g. a
 * time prefilled from a stored event), so a prefilled value is never hidden.
 */
export function slotsIncluding(slots: TimeSlot[], current: string): TimeSlot[] {
  if (!current || slots.some((slot) => slot.value === current)) return slots;
  return [...slots, { value: current, label: formatSlotLabel(current) }].sort((a, b) =>
    a.value.localeCompare(b.value),
  );
}

/** Joins the separate date and time inputs into "YYYY-MM-DDTHH:mm" local time. */
export function combineDateTime(date: string, time: string): string {
  return date && time ? `${date}T${time}` : '';
}

/** Splits an ISO instant into the local date and time the two inputs show. */
export function isoToLocalParts(iso: string | null): { date: string; time: string } {
  if (!iso) return { date: '', time: '' };
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return { date: '', time: '' };
  const pad = (n: number) => String(n).padStart(2, '0');
  return {
    date: `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`,
    time: `${pad(d.getHours())}:${pad(d.getMinutes())}`,
  };
}
