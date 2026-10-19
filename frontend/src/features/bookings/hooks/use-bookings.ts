import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import type {
  AlternativesReport,
  BookingConflictReport,
  BookingQueueEntry,
  BookingQueueQuery,
  BookingRequestPayload,
  ReplacementNeeded,
  VenueArrangement,
  HoldableEvent,
  PlaceHoldPayload,
  VenueBooking,
} from '@/types/api';
import { bookingsApi } from '../api/bookings.api';

export const bookingKeys = {
  all: ['bookings'] as const,
  mine: ['bookings', 'mine'] as const,
  detail: (id: string) => ['bookings', 'detail', id] as const,
  queue: (query: BookingQueueQuery) => ['bookings', 'queue', query] as const,
  forEvent: (eventId: string) => ['bookings', 'event', eventId] as const,
  conflicts: (id: string, start: string, end: string) =>
    ['bookings', 'conflicts', id, start, end] as const,
  alternatives: (id: string) => ['bookings', 'alternatives', id] as const,
  replacementsNeeded: ['bookings', 'replacements-needed'] as const,
  arrangement: (eventId: string) => ['bookings', 'arrangement', eventId] as const,
  holdable: (venueId: string) => ['bookings', 'holdable', venueId] as const,
};

/**
 * US-24 — the overlap report for one pending request. Never cached
 * (staleTime 0) and keyed on the request's times, so a change to the slot
 * (AC-7) is a different query and is fetched fresh. Refetched on window
 * focus, and explicitly by the decision panel just before an approval.
 */
export function useBookingConflicts(booking: { id: string; start: string; end: string }, enabled = true) {
  return useQuery<BookingConflictReport>({
    queryKey: bookingKeys.conflicts(booking.id, booking.start, booking.end),
    queryFn: () => bookingsApi.conflicts(booking.id),
    enabled,
    staleTime: 0,
  });
}

/** US-23 AC-5 — the booking requests on one event, with their decisions. */
export function useEventBookings(eventId: string | undefined) {
  return useQuery<VenueBooking[]>({
    queryKey: bookingKeys.forEvent(eventId ?? ''),
    queryFn: () => bookingsApi.listForEvent(eventId!),
    enabled: Boolean(eventId),
  });
}

/**
 * US-23 — approve, reject and reverse. Each invalidates every booking query,
 * so the request leaves the pending queue and the detail view hides the
 * actions as soon as the decision is recorded (US-22 AC-7, US-23 AC-7).
 */
export function useDecideBooking() {
  const queryClient = useQueryClient();
  const invalidate = () => queryClient.invalidateQueries({ queryKey: bookingKeys.all });

  const approve = useMutation({
    mutationFn: ({ id, note }: { id: string; note?: string }) => bookingsApi.approve(id, note),
    onSuccess: invalidate,
  });
  const reject = useMutation({
    mutationFn: ({
      id,
      reason,
      alternativeVenueIds = [],
    }: {
      id: string;
      reason: string;
      alternativeVenueIds?: string[];
    }) => bookingsApi.reject(id, reason, alternativeVenueIds),
    onSuccess: invalidate,
  });
  const reverse = useMutation({
    mutationFn: ({
      id,
      reason,
      alternativeVenueIds = [],
    }: {
      id: string;
      reason: string;
      alternativeVenueIds?: string[];
    }) => bookingsApi.reverse(id, reason, alternativeVenueIds),
    onSuccess: invalidate,
  });

  return { approve, reject, reverse };
}

/**
 * US-51 — clear a "Conflict - needs review" flag by hand. Refreshes bookings
 * and the calendar, where the flag is also shown.
 */
export function useResolveReview() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, note }: { id: string; note?: string }) => bookingsApi.resolveReview(id, note),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: bookingKeys.all });
      // calendarKeys.all — not imported, since use-calendar imports this file.
      void queryClient.invalidateQueries({ queryKey: ['calendar'] });
    },
  });
}

/**
 * US-22 — the Venue Staff queue. Refetches when the tab regains focus (React
 * Query's default), so a request decided elsewhere drops out of the pending view.
 */
export function useBookingQueue(query: BookingQueueQuery) {
  return useQuery<BookingQueueEntry[]>({
    queryKey: bookingKeys.queue(query),
    queryFn: () => bookingsApi.queue(query),
    staleTime: 0,
  });
}

/** US-21 AC-6 — requests this Coordinator has raised, newest first. */
export function useMyBookingRequests() {
  return useQuery<VenueBooking[]>({
    queryKey: bookingKeys.mine,
    queryFn: bookingsApi.listMine,
  });
}

/** One booking request in full. */
export function useBookingRequest(id: string) {
  return useQuery<VenueBooking>({
    queryKey: bookingKeys.detail(id),
    queryFn: () => bookingsApi.getById(id),
    enabled: Boolean(id),
  });
}

/** US-21 — submit a venue booking request. */
export function useCreateBookingRequest() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: BookingRequestPayload) => bookingsApi.create(payload),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: bookingKeys.all }),
  });
}

/**
 * US-41 AC-2 — the ranked candidates for one request, fetched only while
 * Venue Staff are preparing a rejection. Never cached: availability moves.
 */
export function useBookingAlternatives(id: string, enabled: boolean) {
  return useQuery<AlternativesReport>({
    queryKey: bookingKeys.alternatives(id),
    queryFn: () => bookingsApi.alternatives(id),
    enabled,
    staleTime: 0,
  });
}

/** US-41 AC-6 — accept a suggestion; the new request appears in every list. */
export function useAcceptSuggestion() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ bookingId, suggestionId }: { bookingId: string; suggestionId: string }) =>
      bookingsApi.acceptSuggestion(bookingId, suggestionId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: bookingKeys.all }),
  });
}

/**
 * US-52 AC-2 — the Coordinator's bookings whose venue became unavailable and
 * that still need a replacement. Under `bookings`, so any booking decision or
 * new request refreshes it — confirming a replacement clears the flag.
 */
export function useReplacementsNeeded() {
  return useQuery<ReplacementNeeded[]>({
    queryKey: bookingKeys.replacementsNeeded,
    queryFn: bookingsApi.replacementsNeeded,
    staleTime: 0,
  });
}

/**
 * US-53 AC-5 — whether the event's venues are arranged. Under `bookings`, so
 * any new request, decision or release refreshes it.
 */
export function useVenueArrangement(eventId: string | undefined, enabled = true) {
  return useQuery<VenueArrangement>({
    queryKey: bookingKeys.arrangement(eventId ?? ''),
    queryFn: () => bookingsApi.arrangement(eventId!),
    enabled: Boolean(eventId) && enabled,
    staleTime: 0,
  });
}

/** US-53 AC-6 — cancel or release one booking. */
export function useReleaseBooking() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => bookingsApi.release(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: bookingKeys.all }),
  });
}

/**
 * US-54 — place, convert, extend and release holds. Each refreshes every
 * booking query and the calendar, where holds show as Tentative.
 */
export function useHolds() {
  const queryClient = useQueryClient();
  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: bookingKeys.all });
    // calendarKeys.all — not imported, since use-calendar imports this file.
    void queryClient.invalidateQueries({ queryKey: ['calendar'] });
  };

  return {
    place: useMutation({
      mutationFn: ({ venueId, payload }: { venueId: string; payload: PlaceHoldPayload }) =>
        bookingsApi.placeHold(venueId, payload),
      onSuccess: invalidate,
    }),
    convert: useMutation({ mutationFn: (id: string) => bookingsApi.convertHold(id), onSuccess: invalidate }),
    extend: useMutation({
      mutationFn: ({ id, expiresAt }: { id: string; expiresAt: string }) => bookingsApi.extendHold(id, expiresAt),
      onSuccess: invalidate,
    }),
    release: useMutation({ mutationFn: (id: string) => bookingsApi.releaseHold(id), onSuccess: invalidate }),
  };
}

/** US-54 — the events a hold may be placed for on this venue. */
export function useHoldableEvents(venueId: string) {
  return useQuery<HoldableEvent[]>({
    queryKey: bookingKeys.holdable(venueId),
    queryFn: () => bookingsApi.holdableEvents(venueId),
    enabled: Boolean(venueId),
  });
}
