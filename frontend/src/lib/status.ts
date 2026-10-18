import type {
  BookingStatus,
  DayStatus,
  EquipmentStatus,
  EventStatus,
  VenueStatus,
} from '@/types/api';

/**
 * The status colour language, defined once.
 *
 * Colour alone never carries the meaning — every badge also shows its label,
 * so the vocabulary survives greyscale and colour-blindness. Tokens come from
 * the Tailwind theme; no raw hex here.
 */
export interface StatusStyle {
  label: string;
  className: string;
}

export const EVENT_STATUS_STYLES: Record<EventStatus, StatusStyle> = {
  DRAFT: { label: 'Draft', className: 'bg-ink-100 text-ink-700 ring-ink-300' },
  SUBMITTED: { label: 'Submitted', className: 'bg-blue-50 text-blue-800 ring-blue-300' },
  UNDER_REVIEW: { label: 'Under review', className: 'bg-amber-50 text-amber-900 ring-amber-400' },
  APPROVED: { label: 'Approved', className: 'bg-emerald-50 text-emerald-800 ring-emerald-300' },
  AWAITING_CLARIFICATION: {
    label: 'Awaiting clarification',
    className: 'bg-amber-50 text-amber-900 ring-amber-400',
  },
  // US-08: returned is a distinct outcome from rejected — amber signals
  // "action needed from you", red signals "declined".
  RETURNED: { label: 'Returned', className: 'bg-amber-50 text-amber-900 ring-amber-400' },
  REJECTED: { label: 'Rejected', className: 'bg-red-50 text-red-800 ring-red-300' },
  PLANNING: { label: 'Planning', className: 'bg-violet-50 text-violet-800 ring-violet-300' },
  AWAITING_ARRANGEMENTS: {
    label: 'Awaiting arrangements',
    className: 'bg-violet-50 text-violet-800 ring-violet-300',
  },
  // US-42 AC-5: the words the Organiser sees once the Coordinator confirms.
  AWAITING_SAFETY_CHECK: {
    label: 'Arrangements confirmed - awaiting safety review',
    className: 'bg-amber-50 text-amber-900 ring-amber-400',
  },
  SAFETY_REJECTED: {
    label: 'Safety rejected',
    className: 'bg-red-50 text-red-800 ring-red-300',
  },
  CONFIRMED: { label: 'Confirmed', className: 'bg-emerald-100 text-emerald-900 ring-emerald-400' },
  COMPLETED: { label: 'Completed', className: 'bg-ink-200 text-ink-800 ring-ink-400' },
  CANCELLED: { label: 'Cancelled', className: 'bg-rose-50 text-rose-800 ring-rose-300' },
};

export const VENUE_STATUS_STYLES: Record<VenueStatus, StatusStyle> = {
  DRAFT: { label: 'Draft', className: 'bg-ink-100 text-ink-700 ring-ink-300' },
  PUBLISHED: { label: 'Published', className: 'bg-emerald-50 text-emerald-800 ring-emerald-300' },
};

/**
 * US-29 AC-2 — an equipment item's operational status, in US-45's words:
 * OPERATIONAL is "Available" and OUT_OF_SERVICE is "Damaged".
 */
export const EQUIPMENT_STATUS_STYLES: Record<EquipmentStatus, StatusStyle> = {
  OPERATIONAL: { label: 'Available', className: 'bg-emerald-50 text-emerald-800 ring-emerald-300' },
  UNDER_MAINTENANCE: {
    label: 'Under maintenance',
    className: 'bg-amber-50 text-amber-900 ring-amber-400',
  },
  OUT_OF_SERVICE: { label: 'Damaged', className: 'bg-red-50 text-red-800 ring-red-300' },
};

/**
 * Venue booking requests. REQUESTED is presented as "Pending" — the word
 * US-21 AC-3 uses — while the API keeps the enum value.
 */
export const BOOKING_STATUS_STYLES: Record<BookingStatus, StatusStyle> = {
  REQUESTED: { label: 'Pending', className: 'bg-amber-50 text-amber-900 ring-amber-400' },
  APPROVED: { label: 'Approved', className: 'bg-emerald-50 text-emerald-800 ring-emerald-300' },
  REJECTED: { label: 'Rejected', className: 'bg-red-50 text-red-800 ring-red-300' },
  // US-54: the word the customer uses for a hold. RELEASED holds nothing:
  // a hold released or expired, (US-43/US-44) any booking of a cancelled
  // event, (US-48) the original of a rebooked booking, or (US-52 AC-5) one
  // replaced by a confirmed booking elsewhere — neutral, not a refusal. The
  // record is kept.
  HELD: { label: 'Tentative', className: 'bg-sky-50 text-sky-900 ring-sky-400' },
  RELEASED: { label: 'Released', className: 'bg-ink-100 text-ink-700 ring-ink-300' },
};

/** Statuses shown in the Coordinator's retained request list. */
export const COORDINATOR_QUEUE_STATUSES: EventStatus[] = [
  'DRAFT',
  'SUBMITTED',
  'UNDER_REVIEW',
  'AWAITING_CLARIFICATION',
  'APPROVED',
  'PLANNING',
  'AWAITING_ARRANGEMENTS',
  'AWAITING_SAFETY_CHECK',
  'SAFETY_REJECTED',
  'CONFIRMED',
  'COMPLETED',
  'CANCELLED',
  'REJECTED',
  'RETURNED',
];

/**
 * US-47 — statuses an event may be rejected from as unfulfillable. Mirrors
 * UNFULFILLABLE_REJECTION_STATUSES in the backend, which enforces it; this
 * only decides whether to offer the action.
 */
export const UNFULFILLABLE_REJECTION_STATUSES: EventStatus[] = [
  'APPROVED',
  'PLANNING',
  'AWAITING_ARRANGEMENTS',
];

/**
 * Statuses an Organiser can still edit as a draft (mirrors the backend's
 * EDITABLE_STATUSES in events.service.ts). RETURNED is included alongside
 * DRAFT — US-08 hands a request back precisely so it can be amended and
 * resubmitted without demoting it to DRAFT first.
 */
export const EDITABLE_EVENT_STATUSES: EventStatus[] = ['DRAFT', 'RETURNED'];

/**
 * US-37 — the statuses an Organiser may request a change in. Mirrors
 * CHANGEABLE_STATUSES in the backend (events/change-request.rules.ts), which
 * is what actually enforces it; this only decides whether to offer the button.
 */
export const CHANGEABLE_EVENT_STATUSES: EventStatus[] = [
  'SUBMITTED',
  'UNDER_REVIEW',
  'APPROVED',
  'RETURNED',
  'AWAITING_CLARIFICATION',
  'PLANNING',
  'AWAITING_ARRANGEMENTS',
  'AWAITING_SAFETY_CHECK',
  'SAFETY_REJECTED',
  'CONFIRMED',
];

/**
 * US-43 AC-1 — statuses in which an Organiser is offered "Cancel event": from
 * submission until the event is over. Mirrors CANCELLABLE_STATUSES in the
 * backend (events/event-cancellation.rules.ts), which is what enforces it,
 * along with the start-time check; this only decides whether to offer it.
 */
export const CANCELLABLE_EVENT_STATUSES: EventStatus[] = CHANGEABLE_EVENT_STATUSES;

/**
 * US-17 — availability calendar days. Each also carries an icon and label in
 * the calendar itself, so the three states survive greyscale.
 */
export const DAY_STATUS_STYLES: Record<DayStatus, StatusStyle> = {
  free: { label: 'Free', className: 'bg-ink-50 text-ink-800' },
  tentative: { label: 'Tentatively held', className: 'bg-amber-100 text-amber-900' },
  // Struck through as well as shaded, so "booked" survives greyscale.
  booked: { label: 'Booked', className: 'bg-ink-200 text-ink-500 line-through' },
};

/**
 * US-25 — statuses in which the Coordinator may update the event's
 * information. Mirrors PLANNING_STATUSES in event-status.machine.ts.
 */
export const PLANNING_EVENT_STATUSES: EventStatus[] = ['PLANNING', 'AWAITING_ARRANGEMENTS'];

/** US-42 — statuses the Coordinator may confirm from. Mirrors CONFIRMABLE_STATUSES. */
export const CONFIRMABLE_EVENT_STATUSES: EventStatus[] = ['PLANNING', 'AWAITING_ARRANGEMENTS'];
