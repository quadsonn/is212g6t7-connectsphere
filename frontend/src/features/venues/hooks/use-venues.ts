import { useEffect } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { addMonths } from '@/lib/calendar';
import type {
  BrowseVenuesQuery,
  DayAvailability,
  Venue,
  VenueOccupancy,
  VenueBuffersPayload,
  VenueDraftPayload,
  VenueSearchQuery,
  VenueSuitability,
} from '@/types/api';
import { bookingKeys } from '@/features/bookings/hooks/use-bookings';
import { calendarKeys } from '@/features/calendar/hooks/use-calendar';
import { venuesApi } from '../api/venues.api';

export const venueKeys = {
  all: ['venues'] as const,
  list: (query: BrowseVenuesQuery) => ['venues', 'list', query] as const,
  search: (query: VenueSearchQuery) => ['venues', 'search', query] as const,
  suitability: (id: string, eventId: string) =>
    ['venues', 'suitability', id, eventId] as const,
  detail: (id: string) => ['venues', 'detail', id] as const,
  availability: (id: string, month: string) =>
    ['venues', 'availability', id, month] as const,
  occupancy: (id: string, day: string) => ['venues', 'occupancy', id, day] as const,
};

/** US-15 — the catalogue, optionally searched and sorted server-side. */
export function useVenues(query: BrowseVenuesQuery = {}) {
  return useQuery<Venue[]>({
    queryKey: venueKeys.list(query),
    queryFn: () => venuesApi.list(query),
    staleTime: 0,
  });
}

/**
 * US-18 — venue search. Takes the *applied* filters, not the ones being
 * edited, so a request goes out only when the Coordinator presses Search.
 */
export function useVenueSearch(query: VenueSearchQuery) {
  return useQuery<Venue[]>({
    queryKey: venueKeys.search(query),
    queryFn: () => venuesApi.search(query),
    staleTime: 0,
    placeholderData: (previous) => previous,
  });
}

/** US-20 — suitability of this venue for the selected event. */
export function useVenueSuitability(id: string, eventId: string) {
  return useQuery<VenueSuitability>({
    queryKey: venueKeys.suitability(id, eventId),
    queryFn: () => venuesApi.suitability(id, eventId),
    enabled: Boolean(id && eventId),
    staleTime: 0,
  });
}

/** US-14 — a single venue, for the edit screen. */
export function useVenue(id: string) {
  return useQuery<Venue>({
    queryKey: venueKeys.detail(id),
    queryFn: () => venuesApi.getById(id),
    enabled: Boolean(id),
  });
}

/**
 * US-50 AC-3 — what occupies a venue on one selected day, each booking split
 * into setup, event time and turnaround. Fetched only once a day is picked.
 */
export function useVenueOccupancy(id: string, day: string | null) {
  return useQuery<VenueOccupancy[]>({
    queryKey: venueKeys.occupancy(id, day ?? ''),
    queryFn: () => venuesApi.occupancy(id, day!),
    enabled: Boolean(id && day),
    staleTime: 30_000,
  });
}

/**
 * US-17 AC-2 — one month of a venue's availability.
 *
 * Each month is its own query so navigating loads only what is new. The
 * months either side of the visible pair are prefetched, so a prev/next click
 * is usually served from cache rather than waiting on the network.
 */
export function useVenueAvailability(id: string, month: string) {
  return useQuery<DayAvailability[]>({
    queryKey: venueKeys.availability(id, month),
    queryFn: () => venuesApi.availability(id, month),
    enabled: Boolean(id),
    // Short-lived: a day taken a minute ago must not still show as free.
    staleTime: 30_000,
  });
}

export function usePrefetchVenueAvailability(id: string, months: string[]) {
  const queryClient = useQueryClient();
  const key = months.join(',');

  useEffect(() => {
    if (!id) return;
    for (const month of key.split(',')) {
      void queryClient.prefetchQuery({
        queryKey: venueKeys.availability(id, month),
        queryFn: () => venuesApi.availability(id, month),
        staleTime: 30_000,
      });
    }
  }, [id, key, queryClient]);
}

/** The months just outside a visible window, for prefetching. */
export function adjacentMonths(first: string, visibleCount: number): string[] {
  return [addMonths(first, -1), addMonths(first, visibleCount)];
}

export function useDeleteVenue() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => venuesApi.delete(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: venueKeys.all }),
  });
}

export function useUploadVenueImage(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (file: File) => venuesApi.uploadImage(id, file),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: venueKeys.all }),
  });
}

export function useRemoveVenueImage(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (imageUrl: string) => venuesApi.removeImage(id, imageUrl),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: venueKeys.all }),
  });
}

// US-49: the venue's setup and turnaround time. US-51: saving may flag
// bookings, so the booking queue and calendar are refreshed too.
export function useUpdateVenueBuffers(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: VenueBuffersPayload) => venuesApi.updateBuffers(id, payload),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: venueKeys.all });
      void queryClient.invalidateQueries({ queryKey: bookingKeys.all });
      void queryClient.invalidateQueries({ queryKey: calendarKeys.all });
    },
  });
}

// US-51: which bookings the proposed buffers would flag, before saving.
export function usePreviewVenueBuffers(id: string) {
  return useMutation({
    mutationFn: (payload: VenueBuffersPayload) => venuesApi.previewBuffers(id, payload),
  });
}

// US-13 AC-1/AC-2: creating a venue (draft, complete, doesn't matter).
export function useCreateVenueDraft() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: VenueDraftPayload) => venuesApi.createDraft(payload),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: venueKeys.all }),
  });
}

// US-14: editing an existing venue's details. Takes the id at call time
// (not when the hook is first called) so it works correctly even if a
// venue was just created moments earlier in the same action.
export function useUpdateVenue() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: VenueDraftPayload }) =>
      venuesApi.update(id, payload),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: venueKeys.all }),
  });
}

// US-13 AC-3/AC-5/AC-6: publish a draft into the catalogue. Same reasoning
// as useUpdateVenue — id passed at call time, not baked into the hook.
export function usePublishVenue() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => venuesApi.publish(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: venueKeys.all }),
  });
}