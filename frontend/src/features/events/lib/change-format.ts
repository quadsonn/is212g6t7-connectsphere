import {
  ACCESSIBILITY_FEATURE_LABELS,
  type AccessibilityFeature,
  type ConfirmedArrangement,
  type FieldChange,
} from '@/types/api';
import { humanise } from '@/lib/utils';

/** US-26 — human labels for the fields a history entry can name. */
export const CHANGE_FIELD_LABELS: Record<FieldChange['field'], string> = {
  name: 'Event name',
  purpose: 'Purpose',
  description: 'Description',
  category: 'Category',
  programme: 'Programme',
  proposedStart: 'Start',
  proposedEnd: 'End',
  expectedAttendance: 'Expected attendance',
  preferredLayout: 'Preferred layout',
  layoutNotes: 'Layout notes',
  accessibilityRequirements: 'Accessibility requirements',
  accessibilityNotes: 'Accessibility notes',
  equipmentNeeds: 'Equipment needs',
  registrationEnabled: 'Registration',
  coordinator: 'Coordinator',
  equipmentRequirements: 'Equipment requirements',
  technicalSupportNeeds: 'Technical support',
  // US-48 AC-7: rebooked by an approved change request.
  venueBookings: 'Venue bookings',
  equipmentReservations: 'Equipment reservations',
};

/** US-25 AC-2 — the arrangement a flagged change puts at risk. */
export const ARRANGEMENT_LABELS: Record<ConfirmedArrangement, string> = {
  VENUE_BOOKING: 'Confirmed venue booking',
  EQUIPMENT_RESERVATION: 'Confirmed equipment reservation',
};

const dateTime = new Intl.DateTimeFormat('en-GB', {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
});

/** Renders a stored before/after value the way the rest of the UI shows it. */
export function formatChangeValue(
  field: FieldChange['field'],
  value: FieldChange['previous'],
): string {
  if (value === null || value === '') return '—';

  switch (field) {
    case 'proposedStart':
    case 'proposedEnd':
      return dateTime.format(new Date(value as string));
    case 'registrationEnabled':
      return value ? 'Open to attendees' : 'Not open for registration';
    case 'preferredLayout':
      return humanise(value as string);
    case 'accessibilityRequirements': {
      const list = value as AccessibilityFeature[];
      return list.length === 0
        ? 'None'
        : list.map((feature) => ACCESSIBILITY_FEATURE_LABELS[feature] ?? humanise(feature)).join(', ');
    }
    case 'equipmentRequirements':
    case 'venueBookings':
    case 'equipmentReservations': {
      const list = value as string[];
      return list.length === 0 ? 'None' : list.join('\n');
    }
    default:
      return String(value);
  }
}

/** ISO string -> the local wall-clock value a datetime-local input expects. */
export function toDateTimeLocal(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
