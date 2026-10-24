import { ConfirmedArrangement, EventRequest } from '@prisma/client';

/**
 * US-25 / US-26 — the rules for what counts as a change to an event's
 * information, and which changes need review.
 *
 * Pure functions over plain values, so they are unit-tested without Prisma and
 * both write paths (the Coordinator's planning edit and the Organiser's
 * amendment of a returned request) apply the same definition.
 */

/** The event-information fields a history entry can record. */
export const TRACKED_FIELDS = [
  'name',
  'purpose',
  'description',
  'category',
  'programme',
  'proposedStart',
  'proposedEnd',
  'expectedAttendance',
  'preferredLayout',
  'layoutNotes',
  'accessibilityRequirements',
  'accessibilityNotes',
  'equipmentNeeds',
  'registrationEnabled',
] as const satisfies readonly (keyof EventRequest)[];

export type TrackedField = (typeof TRACKED_FIELDS)[number];

/** JSON-safe value as stored in EventChange.changes. Dates become ISO strings. */
export type ChangeValue = string | number | boolean | string[] | null;

/**
 * Everything a history entry can name: the editable fields, plus the assigned
 * Coordinator (US-27 AC-4). The Coordinator is recorded by name — the history
 * shows who held the event at the time, even if the account later changes.
 */
export type HistoryField =
  | TrackedField
  | 'coordinator'
  // US-28: recorded through the technical requirements edit, not the
  // planning edit, so they sit outside TRACKED_FIELDS.
  | 'equipmentRequirements'
  | 'technicalSupportNeeds'
  // US-61: the assigned Technical Support member, by name, like 'coordinator'.
  | 'technicalSupport'
  // US-48 AC-7: what an approved change request moved — each line says where
  // a venue booking or equipment reservation was, and where it is now.
  | 'venueBookings'
  | 'equipmentReservations'
  // US-43: a cancellation is recorded as the status move plus its reason.
  | 'status'
  | 'cancellationReason';

/** US-26 AC-2 — one field's previous and new value. */
export interface FieldChange {
  field: HistoryField;
  previous: ChangeValue;
  next: ChangeValue;
}

/** A change to one of the editable fields — what diffEventFields produces. */
export type EventFieldChange = FieldChange & { field: TrackedField };

/**
 * US-25 AC-2 — which already-confirmed arrangement each field feeds.
 *
 * A venue booking was approved against the event's times, headcount, layout
 * and accessibility needs; an equipment reservation against its times and the
 * equipment asked for. Changing anything else (name, programme, notes) does
 * not invalidate either, so it stays an ordinary edit.
 *
 * AMBIGUOUS: the AC gives "date, attendance, venue" as examples. Venue is not
 * a field on the event — it is the booking itself — so it has no entry here.
 * Layout and accessibility are included because a venue was approved as
 * suitable for them (US-06).
 */
export const ARRANGEMENT_SENSITIVE_FIELDS: Readonly<
  Record<ConfirmedArrangement, readonly HistoryField[]>
> = Object.freeze({
  [ConfirmedArrangement.VENUE_BOOKING]: [
    'proposedStart',
    'proposedEnd',
    'expectedAttendance',
    'preferredLayout',
    'accessibilityRequirements',
  ],
  [ConfirmedArrangement.EQUIPMENT_RESERVATION]: [
    'proposedStart',
    'proposedEnd',
    'equipmentNeeds',
    // US-28: the structured requirements an approved reservation was made
    // against, and the support that goes with it.
    'equipmentRequirements',
    'technicalSupportNeeds',
  ],
});

/**
 * US-28 — one equipment requirement as a history value, e.g.
 * "2 × Laser projector (ceiling-mounted)". Readable on its own, and stable
 * enough that comparing two lists of these tells whether anything changed.
 */
export function describeRequirement(requirement: {
  equipmentType: string;
  quantity: number;
  notes?: string | null;
}): string {
  const notes = requirement.notes ? ` (${requirement.notes})` : '';
  return `${requirement.quantity} × ${requirement.equipmentType}${notes}`;
}

/** Venue time (Singapore, as the calendars use) — history is read by people. */
const VENUE_TIME = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'Asia/Singapore',
  day: 'numeric',
  month: 'short',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
});

/** "1 Oct 2030, 09:00 – 1 Oct 2030, 12:00", in venue time. */
export function describeWindow(window: { start: Date; end: Date }): string {
  return `${VENUE_TIME.format(window.start)} – ${VENUE_TIME.format(window.end)}`;
}

/**
 * US-48 AC-7 — the history lines for what an approval moved: one entry per
 * kind of arrangement, previous = where each was, next = where it is now.
 */
export function movedArrangementChanges(moved: {
  venueBookings: { venueName: string | null; from: { start: Date; end: Date }; to: { start: Date; end: Date } }[];
  equipmentReservations: {
    equipmentType: string;
    quantity: number;
    from: { start: Date; end: Date };
    to: { start: Date; end: Date };
  }[];
}): FieldChange[] {
  const changes: FieldChange[] = [];
  if (moved.venueBookings.length > 0) {
    const name = (b: { venueName: string | null }) => b.venueName ?? 'Unnamed venue';
    changes.push({
      field: 'venueBookings',
      previous: moved.venueBookings.map((b) => `${name(b)}: ${describeWindow(b.from)}`),
      next: moved.venueBookings.map((b) => `${name(b)}: ${describeWindow(b.to)}`),
    });
  }
  if (moved.equipmentReservations.length > 0) {
    const item = (r: { quantity: number; equipmentType: string }) => `${r.quantity} × ${r.equipmentType}`;
    changes.push({
      field: 'equipmentReservations',
      previous: moved.equipmentReservations.map((r) => `${item(r)}: ${describeWindow(r.from)}`),
      next: moved.equipmentReservations.map((r) => `${item(r)}: ${describeWindow(r.to)}`),
    });
  }
  return changes;
}

function toChangeValue(value: unknown): ChangeValue {
  if (value === undefined || value === null) return null;
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map(String);
  return value as ChangeValue;
}

/**
 * Arrays are compared as sets: re-ordering the same accessibility
 * requirements is not a change anyone needs to see in the history.
 */
export function sameValue(a: ChangeValue, b: ChangeValue): boolean {
  if (Array.isArray(a) && Array.isArray(b)) {
    return a.length === b.length && [...a].sort().join('\u0000') === [...b].sort().join('\u0000');
  }
  return a === b;
}

/**
 * The fields in `incoming` whose value actually differs from `before`.
 *
 * Keys absent from `incoming` (undefined) are untouched and never reported;
 * an explicit null is a deliberate clear and is. Re-saving an unchanged value
 * produces no entry, so the history only ever shows real changes.
 */
export function diffEventFields(
  before: Partial<Record<TrackedField, unknown>>,
  incoming: Partial<Record<TrackedField, unknown>>,
): EventFieldChange[] {
  return TRACKED_FIELDS.flatMap((field) => {
    if (incoming[field] === undefined) return [];

    const previous = toChangeValue(before[field]);
    const next = toChangeValue(incoming[field]);

    return sameValue(previous, next) ? [] : [{ field, previous, next }];
  });
}

/**
 * US-25 AC-2 — the confirmed arrangements these changes put at risk.
 *
 * `confirmed` is what the event actually has approved; a field that would
 * affect a venue booking is harmless if no booking has been confirmed yet.
 */
export function affectedArrangements(
  changes: readonly FieldChange[],
  confirmed: readonly ConfirmedArrangement[],
): ConfirmedArrangement[] {
  const changed = new Set(changes.map((change) => change.field));

  return confirmed.filter((arrangement) =>
    ARRANGEMENT_SENSITIVE_FIELDS[arrangement].some((field) => changed.has(field)),
  );
}
