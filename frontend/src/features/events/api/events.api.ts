import { apiClient } from '@/lib/api-client';
import type {
  EventRequest,
  EventRequestPayload,
  OrganiserRequestView,
  PublicEventView,
} from '@/types/api';

/**
 * REAL — GET /events and GET /events/:id exist.
 *
 * The backend scopes the result to the caller (US-02): an Organiser gets their
 * own, a Coordinator gets assigned events, an Attendee gets the projected
 * public view. The client sends the same request for all three; the server
 * decides what comes back.
 */
export const eventsApi = {
  list: () => apiClient.get<EventRequest[]>('/events').then((r) => r.data),

  listPublic: () =>
    apiClient.get<PublicEventView[]>('/events').then((r) => r.data),

  getById: (id: string) =>
    apiClient.get<EventRequest>(`/events/${id}`).then((r) => r.data),

  /** US-05 — the Organiser's own requests, with status detail. */
  listMine: () =>
    apiClient.get<OrganiserRequestView[]>('/events/mine').then((r) => r.data),

  /** US-05 — one of the Organiser's own requests, with status detail. */
  getMine: (id: string) =>
    apiClient.get<OrganiserRequestView>(`/events/mine/${id}`).then((r) => r.data),

  /** US-03 — create and submit in one step. Returns the SUBMITTED record. */
  createAndSubmit: (body: EventRequestPayload) =>
    apiClient.post<EventRequest>('/events', body).then((r) => r.data),

  /** US-04 — save an incomplete draft. */
  saveDraft: (body: EventRequestPayload) =>
    apiClient.post<EventRequest>('/events/drafts', body).then((r) => r.data),

  /** US-04 AC-2 — continue editing a draft (or a RETURNED request, US-08). */
  updateDraft: (id: string, body: EventRequestPayload) =>
    apiClient.patch<EventRequest>(`/events/${id}`, body).then((r) => r.data),

  /** US-04 — submit a draft that is now complete. */
  submitDraft: (id: string) =>
    apiClient.post<EventRequest>(`/events/${id}/submit`).then((r) => r.data),
};
