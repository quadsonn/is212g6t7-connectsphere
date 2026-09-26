import { apiClient } from '@/lib/api-client';
import type { BrowseVenuesQuery, Venue, VenueDraftPayload, VenueWithWarnings } from '@/types/api';

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
