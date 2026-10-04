import type { DayStatus, EventStatus, VenueStatus } from '@/types/api';

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
  CONFIRMED: { label: 'Confirmed', className: 'bg-emerald-100 text-emerald-900 ring-emerald-400' },
  COMPLETED: { label: 'Completed', className: 'bg-ink-200 text-ink-800 ring-ink-400' },
  CANCELLED: { label: 'Cancelled', className: 'bg-rose-50 text-rose-800 ring-rose-300' },
};

export const VENUE_STATUS_STYLES: Record<VenueStatus, StatusStyle> = {
  DRAFT: { label: 'Draft', className: 'bg-ink-100 text-ink-700 ring-ink-300' },
  PUBLISHED: { label: 'Published', className: 'bg-emerald-50 text-emerald-800 ring-emerald-300' },
};

/** Statuses shown in the Coordinator's retained request list. */
export const COORDINATOR_QUEUE_STATUSES: EventStatus[] = [
  'DRAFT',
  'SUBMITTED',
  'UNDER_REVIEW',
  'AWAITING_CLARIFICATION',
  'APPROVED',
  'CONFIRMED',
  'COMPLETED',
  'CANCELLED',
  'REJECTED',
  'RETURNED',
];

/**
 * Statuses an Organiser can still edit as a draft (mirrors the backend's
 * EDITABLE_STATUSES in events.service.ts). RETURNED is included alongside
 * DRAFT — US-08 hands a request back precisely so it can be amended and
 * resubmitted without demoting it to DRAFT first.
 */
export const EDITABLE_EVENT_STATUSES: EventStatus[] = ['DRAFT', 'RETURNED'];

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
