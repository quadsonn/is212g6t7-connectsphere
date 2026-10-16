import { apiClient } from '@/lib/api-client';
import type {
  BookingConflictReport,
  BookingDecisionResult,
  BookingQueueEntry,
  BookingQueueQuery,
  BookingRequestPayload,
  BookingRequestResult,
  HoldableEvent,
  PlaceHoldPayload,
  VenueBooking,
} from '@/types/api';

/** REAL — the venue booking endpoints (E5). */
export const bookingsApi = {
  // US-21 AC-1..AC-5: submit a request. 409 carries `conflicts` (AC-4).
  create: (payload: BookingRequestPayload) =>
    apiClient.post<BookingRequestResult>('/bookings', payload).then((r) => r.data),

  // US-21 AC-6: the Coordinator's own request history.
  listMine: () => apiClient.get<VenueBooking[]>('/bookings/mine').then((r) => r.data),

  // US-22: the Venue Staff queue, filtered and sorted server-side.
  queue: (query: BookingQueueQuery = {}) =>
    apiClient
      .get<BookingQueueEntry[]>('/bookings/queue', { params: query })
      .then((r) => r.data),

  // US-23 AC-5: every request on one event the caller may see.
  listForEvent: (eventId: string) =>
    apiClient.get<VenueBooking[]>(`/bookings/events/${eventId}`).then((r) => r.data),

  // US-24: hard/soft overlaps for one request (Venue Staff of its venue only).
  conflicts: (id: string) =>
    apiClient.get<BookingConflictReport>(`/bookings/${id}/conflicts`).then((r) => r.data),

  // US-23 AC-3: approve, note optional. US-24: 409 if a hard conflict exists
  // at the moment of approval; soft conflicts come back as `warnings`.
  approve: (id: string, note?: string) =>
    apiClient
      .post<BookingDecisionResult>(`/bookings/${id}/approve`, note ? { note } : {})
      .then((r) => r.data),

  // US-23 AC-2: reject, reason required.
  reject: (id: string, reason: string) =>
    apiClient.post<VenueBooking>(`/bookings/${id}/reject`, { reason }).then((r) => r.data),

  // US-51: clear a "Conflict - needs review" flag, with an optional note.
  resolveReview: (id: string, note?: string) =>
    apiClient
      .post<VenueBooking>(`/bookings/${id}/resolve-review`, note ? { note } : {})
      .then((r) => r.data),

  // US-23 AC-6: reverse a decision, recorded as a new action.
  reverse: (id: string, reason: string) =>
    apiClient.post<VenueBooking>(`/bookings/${id}/reverse`, { reason }).then((r) => r.data),

  // US-54: the events a hold may be placed for (the venue's manager only).
  holdableEvents: (venueId: string) =>
    apiClient.get<HoldableEvent[]>(`/venues/${venueId}/holdable-events`).then((r) => r.data),

  // US-54 AC-1: place a hold. 409 carries `conflicts`; pending overlaps come back as `warnings`.
  placeHold: (venueId: string, payload: PlaceHoldPayload) =>
    apiClient.post<BookingRequestResult>(`/venues/${venueId}/holds`, payload).then((r) => r.data),

  // US-54 AC-5: convert, extend or release a live hold (409 once it has expired).
  convertHold: (id: string) =>
    apiClient.post<BookingDecisionResult>(`/bookings/${id}/hold/convert`).then((r) => r.data),
  extendHold: (id: string, expiresAt: string) =>
    apiClient.post<VenueBooking>(`/bookings/${id}/hold/extend`, { expiresAt }).then((r) => r.data),
  releaseHold: (id: string) =>
    apiClient.post<VenueBooking>(`/bookings/${id}/hold/release`).then((r) => r.data),

  // One request in full — requirements, organiser, decision.
  getById: (id: string) => apiClient.get<VenueBooking>(`/bookings/${id}`).then((r) => r.data),
};
