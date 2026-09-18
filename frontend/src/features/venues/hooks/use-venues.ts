import { useQuery } from '@tanstack/react-query';

import type { BrowseVenuesQuery, Venue } from '@/types/api';
import { venuesApi } from '../api/venues.api';

export const venueKeys = {
  all: ['venues'] as const,
  list: (query: BrowseVenuesQuery) => ['venues', 'list', query] as const,
};

/** US-15 — the catalogue, optionally searched and sorted server-side. */
export function useVenues(query: BrowseVenuesQuery = {}) {
  return useQuery<Venue[]>({
    queryKey: venueKeys.list(query),
    queryFn: () => venuesApi.list(query),
    // The catalogue changes whenever staff edit it, and the server sends
    // Cache-Control: no-store (US-15 AC-4). Don't hold a stale copy here either.
    staleTime: 0,
  });
}
