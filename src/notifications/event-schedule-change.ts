/**
 * Attendee notice for a change of date, time or venue.
 *
 * Pure functions over plain values, so what the message says is unit-tested
 * without Prisma or Nest. Which fields count as "schedule" fields is decided
 * here and nowhere else: anything not named in SCHEDULE_FIELDS (a description
 * edit, the expected attendance, equipment) never reaches an Attendee.
 */

export type AttendeeChangeLabel = 'Start' | 'End' | 'Venue';

/** One changed field as the Attendee reads it: the old and the new value. */
export interface AttendeeChange {
  label: AttendeeChangeLabel;
  previous: string;
  next: string;
}

/** The event columns whose change is an Attendee's business, and their labels. */
const SCHEDULE_FIELDS: Readonly<Record<string, AttendeeChangeLabel>> = {
  proposedStart: 'Start',
  proposedEnd: 'End',
};

/**
 * The venues are in Singapore, and an Attendee reads a time as the clock on the
 * wall there — the same zone the calendar pages use (frontend/src/lib/calendar.ts).
 */
const DISPLAY_TIME_ZONE = 'Asia/Singapore';

const instantFormat = new Intl.DateTimeFormat('en-GB', {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
  timeZone: DISPLAY_TIME_ZONE,
});

const NOT_SET = 'not set';

function formatValue(value: unknown): string {
  if (value === null || value === undefined || value === '') return NOT_SET;

  const date = value instanceof Date ? value : new Date(String(value));
  return Number.isNaN(date.getTime()) ? String(value) : instantFormat.format(date);
}

/**
 * The date/time changes among an event's recorded field changes, in the order
 * Start then End. Everything else is dropped.
 */
export function scheduleChangesFrom(
  changes: readonly { field: string; previous: unknown; next: unknown }[],
): AttendeeChange[] {
  return (['proposedStart', 'proposedEnd'] as const).flatMap((field) => {
    const change = changes.find((entry) => entry.field === field);
    if (!change) return [];

    return [
      {
        label: SCHEDULE_FIELDS[field],
        previous: formatValue(change.previous),
        next: formatValue(change.next),
      },
    ];
  });
}

/** A venue replaced by another. Either side may be unnamed. */
export function venueChange(
  previousName: string | null,
  nextName: string | null,
): AttendeeChange {
  return {
    label: 'Venue',
    previous: previousName ?? 'a previous venue',
    next: nextName ?? 'a new venue',
  };
}

/**
 * One message for the whole update: the event, then every changed field with
 * its old and new value. Several fields changed together stay one message.
 */
export function buildScheduleChangeMessage(
  eventName: string | null,
  changes: readonly AttendeeChange[],
): string {
  const lines = changes
    .map((change) => `${change.label}: ${change.previous} → ${change.next}`)
    .join('; ');

  return `"${eventName ?? 'An event you are registered for'}" has changed. ${lines}.`;
}
