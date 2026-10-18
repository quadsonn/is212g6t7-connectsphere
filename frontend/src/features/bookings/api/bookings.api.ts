import { apiClient } from '@/lib/api-client';
import type {
  AlternativesReport,
  BookingConflictReport,
  BookingDecisionResult,
  BookingQueueEntry,
  BookingQueueQuery,
  BookingRequestPayload,
  BookingRequestResult,
  ReplacementNeeded,
  VenueArrangement,
  VenueBooking,
} from '@/types/api';

/** REAL — the venue booking endpoints (E5). */
export const bookingsApi = {
  // US-21 AC-1..AC-5: submit a request. 409 carries `conflicts` (AC-4).
  create: (payload: BookingRequestPayload) =>
    apiClient.post<BookingRequestResult>('/bookings', payload).then((r) => r.data),

  // US-52 AC-2: this Coordinator's bookings whose venue became unavailable.
  replacementsNeeded: () =>
    apiClient.get<ReplacementNeeded[]>('/bookings/replacements-needed').then((r) => r.data),

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

  // US-53 AC-5: whether the event's venues are arranged (all active approved).
  arrangement: (eventId: string) =>
    apiClient
      .get<VenueArrangement>(`/bookings/events/${eventId}/arrangement`)
      .then((r) => r.data),

  // US-53 AC-6: cancel or release one booking; the others are untouched.
  release: (id: string) =>
    apiClient.post<VenueBooking>(`/bookings/${id}/release`).then((r) => r.data),

  // US-24: hard/soft overlaps for one request (Venue Staff of its venue only).
  conflicts: (id: string) =>
    apiClient.get<BookingConflictReport>(`/bookings/${id}/conflicts`).then((r) => r.data),

  // US-23 AC-3: approve, note optional. US-24: 409 if a hard conflict exists
  // at the moment of approval; soft conflicts come back as `warnings`.
  approve: (id: string, note?: string) =>
    apiClient
      .post<BookingDecisionResult>(`/bookings/${id}/approve`, note ? { note } : {})
      .then((r) => r.data),

  // US-23 AC-2: reject, reason required. US-41 AC-1: optional alternatives.
  reject: (id: string, reason: string, alternativeVenueIds: string[] = []) =>
    apiClient
      .post<VenueBooking>(`/bookings/${id}/reject`, withAlternatives({ reason }, alternativeVenueIds))
      .then((r) => r.data),

  // US-23 AC-6: reverse a decision, recorded as a new action. US-41: a
  // reversal to rejected may carry alternatives too.
  reverse: (id: string, reason: string, alternativeVenueIds: string[] = []) =>
    apiClient
      .post<VenueBooking>(`/bookings/${id}/reverse`, withAlternatives({ reason }, alternativeVenueIds))
      .then((r) => r.data),

  // US-41 AC-2: venues that could stand in for this request, best match first.
  alternatives: (id: string) =>
    apiClient.get<AlternativesReport>(`/bookings/${id}/alternatives`).then((r) => r.data),

  // US-41 AC-6: accept a suggestion — a new request for that venue.
  acceptSuggestion: (id: string, suggestionId: string) =>
    apiClient
      .post<BookingRequestResult>(`/bookings/${id}/suggestions/${suggestionId}/accept`)
      .then((r) => r.data),

  // One request in full — requirements, organiser, decision.
  getById: (id: string) => apiClient.get<VenueBooking>(`/bookings/${id}`).then((r) => r.data),
};

/** Leaves the field out entirely when nothing is suggested, as before US-41. */
function withAlternatives(body: { reason: string }, alternativeVenueIds: string[]) {
  return alternativeVenueIds.length > 0 ? { ...body, alternativeVenueIds } : body;
}
