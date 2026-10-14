import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import type {
  BookingConflictReport,
  BookingQueueEntry,
  BookingQueueQuery,
  BookingRequestPayload,
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
    mutationFn: ({ id, reason }: { id: string; reason: string }) => bookingsApi.reject(id, reason),
    onSuccess: invalidate,
  });
  const reverse = useMutation({
    mutationFn: ({ id, reason }: { id: string; reason: string }) => bookingsApi.reverse(id, reason),
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
