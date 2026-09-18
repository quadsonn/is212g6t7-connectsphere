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

  listAssigned: () =>
    apiClient.get<EventRequest[]>('/events/assigned').then((r) => r.data),

  getAssignedById: (id: string) =>
    apiClient.get<EventRequest>(`/events/assigned/${id}`).then((r) => r.data),

  getMineById: (id: string) =>
    apiClient.get<OrganiserRequestView>(`/events/mine/${id}`).then((r) => r.data),

  listPublic: () =>
    apiClient.get<PublicEventView[]>('/events').then((r) => r.data),

  getById: (id: string) =>
    apiClient.get<EventRequest>(`/events/${id}`).then((r) => r.data),

  /** US-05 — the Organiser's own requests, with status detail. */
  listMine: () =>
    apiClient.get<OrganiserRequestView[]>('/events/mine').then((r) => r.data),

  /** US-03 — create and submit in one step. Returns the SUBMITTED record. */
  createAndSubmit: (body: EventRequestPayload) =>
    apiClient.post<EventRequest>('/events', body).then((r) => r.data),

  /** US-04 — save an incomplete draft. */
  saveDraft: (body: EventRequestPayload) =>
    apiClient.post<EventRequest>('/events/drafts', body).then((r) => r.data),

  /** US-04 — submit a draft that is now complete. */
  submitDraft: (id: string) =>
    apiClient.post<EventRequest>(`/events/${id}/submit`).then((r) => r.data),

  approve: (id: string) =>
    apiClient.post<EventRequest>(`/events/${id}/approve`).then((r) => r.data),

  requestClarification: (id: string, question: string) =>
    apiClient
      .post<EventRequest>(`/events/${id}/clarifications`, { question })
      .then((r) => r.data),

  reject: (id: string, reason: string) =>
    apiClient
      .post<EventRequest>(`/events/${id}/reject`, { reason })
      .then((r) => r.data),

  returnForAmendment: (id: string, reason: string) =>
    apiClient
      .post<EventRequest>(`/events/${id}/return`, { reason })
      .then((r) => r.data),

  respondToClarification: (id: string, response: string) =>
    apiClient
      .post<OrganiserRequestView>(`/events/${id}/clarifications/responses`, {
        response,
      })
      .then((r) => r.data),
};
