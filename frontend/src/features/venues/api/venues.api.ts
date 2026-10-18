import { apiClient } from '@/lib/api-client';
import type {
  BrowseVenuesQuery,
  DayAvailability,
  Venue,
  VenueDraftPayload,
  VenueOccupancy,
  VenueSearchQuery,
  VenueSuitability,
  VenueWithWarnings,
} from '@/types/api';

/**
 * REAL — GET /venues and GET /venues/:id exist (US-13, US-15).
 *
 * The backend scopes the result: published venues are visible to everyone with
 * a VENUE/READ grant, drafts only to the Venue Staff member managing them. The
 * client sends the same request regardless; the server decides.
 */
export const venuesApi = {
  // US-15 (Browse the full catalogue) AC-1/AC-3: list + search/sort.
  list: (query: BrowseVenuesQuery = {}) =>
    apiClient.get<Venue[]>('/venues', { params: query }).then((r) => r.data),

  // US-15 AC-2: full detail view of one venue.
  getById: (id: string) =>
    apiClient.get<Venue>(`/venues/${id}`).then((r) => r.data),

  // US-18: published venues matching every active filter. Coordinators only.
  search: (query: VenueSearchQuery) =>
    apiClient.get<Venue[]>('/venues/search', { params: query }).then((r) => r.data),

  // US-20: advisory suitability flags against one of my events.
  suitability: (id: string, eventId: string) =>
    apiClient
      .get<VenueSuitability>(`/venues/${id}/suitability`, { params: { eventId } })
      .then((r) => r.data),

  // US-17 AC-1/AC-2: one month of free/tentative/booked days ("YYYY-MM").
  // Coordinators only — the server answers 403 for every other role.
  availability: (id: string, month: string) =>
    apiClient
      .get<DayAvailability[]>(`/venues/${id}/availability`, { params: { month } })
      .then((r) => r.data),

  // US-50 AC-3: what occupies the venue on one day, setup and turnaround
  // separate from the event time. Coordinators only, like availability.
  occupancy: (id: string, day: string) =>
    apiClient
      .get<VenueOccupancy[]>(`/venues/${id}/availability/slots`, {
        params: { from: day, to: day },
      })
      .then((r) => r.data),

  // US-13 AC-1/AC-2: save a new venue, complete or not.
  createDraft: (payload: VenueDraftPayload) =>
    apiClient.post<Venue>('/venues/drafts', payload).then((r) => r.data),

  // US-13 AC-2 (continuing a draft) and US-14 AC-1/AC-2/AC-4 (editing a live venue).
  update: (id: string, payload: VenueDraftPayload) =>
    apiClient.patch<VenueWithWarnings>(`/venues/${id}`, payload).then((r) => r.data),

  // US-13 AC-3/AC-5: publish once all required fields are complete.
  publish: (id: string) =>
    apiClient.post<Venue>(`/venues/${id}/publish`).then((r) => r.data),

  // US-13/US-14 — permanently remove a venue. The backend rejects this
  // (Restrict constraint) if any bookings still reference it.
  delete: (id: string) => apiClient.delete(`/venues/${id}`).then(() => undefined),

  uploadImage: (id: string, file: File) => {
    const formData = new FormData();
    formData.append('file', file);
    return apiClient
      .post<Venue>(`/venues/${id}/images`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      })
      .then((r) => r.data);
  },

  removeImage: (id: string, imageUrl: string) =>
    apiClient
      .delete<Venue>(`/venues/${id}/images`, { data: { imageUrl } })
      .then((r) => r.data),
};

/** Kept so the dashboard's mock banner disappears rather than being deleted twice. */
export const VENUES_ENDPOINT_READY = true;
