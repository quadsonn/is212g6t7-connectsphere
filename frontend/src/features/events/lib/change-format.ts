import {
  ACCESSIBILITY_FEATURE_LABELS,
  type AccessibilityFeature,
  type Facility,
  FACILITY_LABELS,
  type ConfirmedArrangement,
  type FieldChange,
} from '@/types/api';
import { formatDateTime, humanise } from '@/lib/utils';
import { instantToLocalString } from '@/lib/date-time';

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
  requiredFacilities: 'Required facilities',
  equipmentNeeds: 'Equipment needs',
  registrationEnabled: 'Registration',
  coordinator: 'Coordinator',
  equipmentRequirements: 'Equipment requirements',
  technicalSupportNeeds: 'Technical support',
  // US-61: the assigned Technical Support member.
  technicalSupport: 'Technical support staff',
  // US-48 AC-7: rebooked by an approved change request.
  venueBookings: 'Venue bookings',
  equipmentReservations: 'Equipment reservations',
  status: 'Status',
  cancellationReason: 'Cancellation reason',
  // US-45: why Technical Support reduced or released a reservation, or the
  // alternative the Coordinator accepted.
  equipmentReservationReason: 'Reason',
};

/** US-25 AC-2 — the arrangement a flagged change puts at risk. */
export const ARRANGEMENT_LABELS: Record<ConfirmedArrangement, string> = {
  VENUE_BOOKING: 'Confirmed venue booking',
  EQUIPMENT_RESERVATION: 'Confirmed equipment reservation',
};

/** Renders a stored before/after value the way the rest of the UI shows it. */
export function formatChangeValue(
  field: FieldChange['field'],
  value: FieldChange['previous'],
): string {
  if (value === null || value === '') return '—';

  switch (field) {
    case 'proposedStart':
    case 'proposedEnd':
      return formatDateTime(value as string);
    case 'registrationEnabled':
      return value ? 'Open to attendees' : 'Not open for registration';
    case 'preferredLayout':
    case 'status':
      return humanise(value as string);
    case 'accessibilityRequirements': {
      const list = value as AccessibilityFeature[];
      return list.length === 0
        ? 'None'
        : list.map((feature) => ACCESSIBILITY_FEATURE_LABELS[feature] ?? humanise(feature)).join(', ');
    }
    case 'requiredFacilities': {
      const list = value as Facility[];
      return list.length === 0
        ? 'None'
        : list.map((facility) => FACILITY_LABELS[facility] ?? humanise(facility)).join(', ');
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

/** ISO instant -> the Singapore wall-clock a date-time input shows (US timezone). */
export function toDateTimeLocal(iso: string | null): string {
  return instantToLocalString(iso);
}
