import { useQuery } from '@tanstack/react-query';

import type { BrowseVenuesQuery, Venue } from '@/types/api';
import { venuesApi } from '../api/venues.api';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { VenueDraftPayload } from '@/types/api';

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

// US-13 AC-1/AC-2: creating a venue (draft, complete, doesn't matter).
export function useCreateVenueDraft() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: VenueDraftPayload) => venuesApi.createDraft(payload),
    // Invalidates the US-15 catalogue query so a newly-created venue shows up
    // without a manual refresh — satisfies AC-4/AC-5 ("appears... the next
    // time it is loaded or refreshed") the moment React Query refetches.
    onSuccess: () => queryClient.invalidateQueries({ queryKey: venueKeys.all }),
  });
}

// US-14: editing an existing venue's details.
export function useUpdateVenue(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: VenueDraftPayload) => venuesApi.update(id, payload),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: venueKeys.all }),
  });
}

// US-13 AC-3/AC-5/AC-6: publish a draft into the catalogue.
export function usePublishVenue(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => venuesApi.publish(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: venueKeys.all }),
  });
}