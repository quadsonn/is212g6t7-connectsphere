import { apiClient } from '@/lib/api-client';
import type { EventRequest, PublicEventView } from '@/types/api';

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
};
