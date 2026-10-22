import {
  type AccessibilityFeature,
  type EventRequestPayload,
  type OrganiserRequestView,
  type RoomLayout,
} from '@/types/api';

/*
 * The event request form's state, prefill and payload. Shared by the New/Edit
 * request page and the clarification reply form (US-58), so the two cannot
 * drift: the same prefill and the same payload.
 */

/** Every field the server may return an error against (US-03 AC-3). */
export const EVENT_REQUEST_FIELDS = [
  'name',
  'purpose',
  'description',
  'category',
  'proposedStart',
  'proposedEnd',
  'expectedAttendance',
  'preferredLayout',
  'layoutNotes',
  'accessibilityRequirements',
  'accessibilityNotes',
  'equipmentNeeds',
] as const;

export interface EventRequestFormState {
  name: string;
  purpose: string;
  description: string;
  category: string;
  proposedStartDate: string;
  proposedStartTime: string;
  proposedEndDate: string;
  proposedEndTime: string;
  expectedAttendance: string;
  preferredLayout: string;
  layoutNotes: string;
  accessibilityRequirements: string;
  accessibilityNotes: string;
  equipmentNeeds: string;
  registrationEnabled: boolean;
}

/**
 * Bookable start/end times run 6:00 AM–11:30 PM in 30-minute blocks, matching
 * venue operating hours — there is no support for booking an event overnight.
 */
function buildTimeSlots(): { value: string; label: string }[] {
  const slots: { value: string; label: string }[] = [];
  for (let minutes = 6 * 60; minutes < 24 * 60; minutes += 30) {
    const hours24 = Math.floor(minutes / 60);
    const mins = minutes % 60;
    const value = `${String(hours24).padStart(2, '0')}:${String(mins).padStart(2, '0')}`;
    const period = hours24 < 12 ? 'AM' : 'PM';
    const hours12 = hours24 % 12 === 0 ? 12 : hours24 % 12;
    slots.push({ value, label: `${hours12}:${String(mins).padStart(2, '0')} ${period}` });
  }
  return slots;
}

export const TIME_SLOTS = buildTimeSlots();

/**
 * The start time list stops half an hour earlier than the end time list —
 * starting at 11:30 PM would leave no room for an event before the 12:00 AM
 * venue cutoff.
 */
export const START_TIME_SLOTS = TIME_SLOTS.slice(0, -1);

/**
 * Combines the separate date and time inputs into the "YYYY-MM-DDTHH:mm"
 * shape `iso()` expects. Date and time are kept as independent form fields
 * (rather than one merged string) so picking one doesn't get wiped out while
 * the other is still unset.
 */
function combineDateTime(date: string, time: string): string {
  return date && time ? `${date}T${time}` : '';
}

/** The inverse of combineDateTime — splits a stored ISO instant back into the
 * local date and time-of-day the two inputs show, for prefilling an edit. */
function isoToLocalParts(iso: string | null): { date: string; time: string } {
  if (!iso) return { date: '', time: '' };
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return {
    date: `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`,
    time: `${pad(d.getHours())}:${pad(d.getMinutes())}`,
  };
}

/**
 * UI-only sentinel for "none of the listed layouts fit" — not a RoomLayout
 * value the backend recognises (US-06 AC-2: the actual description belongs in
 * layoutNotes). Selecting it clears preferredLayout from the payload rather
 * than sending it, since @IsEnum(RoomLayout) would reject anything else.
 */
export const OTHER_LAYOUT = 'OTHER';

/** Same idea for accessibility: 'Other' is described in accessibilityNotes. */
export const OTHER_ACCESS = 'OTHER';

export const EMPTY_EVENT_REQUEST_FORM: EventRequestFormState = {
  name: '',
  purpose: '',
  description: '',
  category: '',
  proposedStartDate: '',
  proposedStartTime: '',
  proposedEndDate: '',
  proposedEndTime: '',
  expectedAttendance: '',
  preferredLayout: '',
  layoutNotes: '',
  accessibilityRequirements: '',
  accessibilityNotes: '',
  equipmentNeeds: '',
  registrationEnabled: false,
};

/** Prefills the form from a stored request, for editing a draft or a RETURNED request. */
export function mapExistingToForm(existing: OrganiserRequestView): EventRequestFormState {
  const start = isoToLocalParts(existing.proposedStart);
  const end = isoToLocalParts(existing.proposedEnd);

  return {
    name: existing.name ?? '',
    purpose: existing.purpose ?? '',
    description: existing.description ?? '',
    category: existing.category ?? '',
    proposedStartDate: start.date,
    proposedStartTime: start.time,
    proposedEndDate: end.date,
    proposedEndTime: end.time,
    expectedAttendance:
      existing.expectedAttendance != null ? String(existing.expectedAttendance) : '',
    preferredLayout: existing.preferredLayout ?? '',
    layoutNotes: existing.layoutNotes ?? '',
    accessibilityRequirements: existing.accessibilityRequirements[0] ?? '',
    accessibilityNotes: existing.accessibilityNotes ?? '',
    equipmentNeeds: existing.equipmentNeeds ?? '',
    registrationEnabled: existing.registrationEnabled,
  };
}

/**
 * Converts the form to the API payload.
 *
 * Empty strings are omitted rather than sent: a draft may legitimately leave a
 * field unset (US-04 AC-1), and sending "" would be a value rather than an
 * absence. `datetime-local` gives local wall-clock time, so it is converted to
 * ISO before sending.
 */
export function toPayload(form: EventRequestFormState): EventRequestPayload {
  const text = (value: string) => (value.trim() === '' ? undefined : value.trim());
  const iso = (value: string) =>
    value === '' ? undefined : new Date(value).toISOString();

  return {
    name: text(form.name),
    purpose: text(form.purpose),
    description: text(form.description),
    category: text(form.category),
    proposedStart: iso(combineDateTime(form.proposedStartDate, form.proposedStartTime)),
    proposedEnd: iso(combineDateTime(form.proposedEndDate, form.proposedEndTime)),
    expectedAttendance:
      form.expectedAttendance.trim() === ''
        ? undefined
        : Number(form.expectedAttendance),
    preferredLayout:
      form.preferredLayout === OTHER_LAYOUT
        ? undefined
        : ((text(form.preferredLayout) as RoomLayout) ?? undefined),
    layoutNotes: text(form.layoutNotes),
    accessibilityRequirements:
      form.accessibilityRequirements === '' ||
      form.accessibilityRequirements === OTHER_ACCESS
        ? undefined
        : [form.accessibilityRequirements as AccessibilityFeature],
    accessibilityNotes: text(form.accessibilityNotes),
    equipmentNeeds: text(form.equipmentNeeds),
    registrationEnabled: form.registrationEnabled,
  };
}

/** Sets one field of the form. */
export type SetEventRequestField = <K extends keyof EventRequestFormState>(
  key: K,
  value: EventRequestFormState[K],
) => void;
