import { apiClient } from '@/lib/api-client';
import type { BrowseVenuesQuery, Venue } from '@/types/api';

/**
 * REAL — GET /venues and GET /venues/:id exist (US-13, US-15).
 *
 * The backend scopes the result: published venues are visible to everyone with
 * a VENUE/READ grant, drafts only to the Venue Staff member managing them. The
 * client sends the same request regardless; the server decides.
 */
export const venuesApi = {
  list: (query: BrowseVenuesQuery = {}) =>
    apiClient
      .get<Venue[]>('/venues', { params: query })
      .then((r) => r.data),

  getById: (id: string) =>
    apiClient.get<Venue>(`/venues/${id}`).then((r) => r.data),
};

/** Kept so the dashboard's mock banner disappears rather than being deleted twice. */
export const VENUES_ENDPOINT_READY = true;
