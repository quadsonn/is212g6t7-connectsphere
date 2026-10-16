import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { bookingKeys } from '@/features/bookings/hooks/use-bookings';
import { POLL_MS } from '@/lib/polling';
import type { CalendarQuery, CalendarView, VenueBlockPayload } from '@/types/api';
import { calendarApi } from '../api/calendar.api';

export const calendarKeys = {
  all: ['calendar'] as const,
  window: (query: CalendarQuery) => ['calendar', query] as const,
};

/** How often the calendar re-reads while open (AC-5). */
export const CALENDAR_POLL_MS = POLL_MS;

/**
 * US-16 AC-5 — "updates in real time (or on refresh)". The calendar polls
 * every 30 seconds and re-reads whenever the tab regains focus, so a booking
 * confirmed, cancelled or changed elsewhere shows up without a manual reload.
 *
 * AMBIGUOUS: polling, not push. True real time would need websockets, which
 * nothing else in the app uses yet; the AC accepts "on refresh".
 */
export function useCalendar(query: CalendarQuery) {
  return useQuery<CalendarView>({
    queryKey: calendarKeys.window(query),
    queryFn: () => calendarApi.get(query),
    refetchInterval: CALENDAR_POLL_MS,
    refetchOnWindowFocus: true,
    staleTime: 0,
  });
}

/** AC-6 — block out and unblock time. Both refresh the calendar and the booking views. */
export function useVenueBlocks() {
  const queryClient = useQueryClient();
  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: calendarKeys.all });
    void queryClient.invalidateQueries({ queryKey: bookingKeys.all });
  };

  const create = useMutation({
    mutationFn: (payload: VenueBlockPayload) => calendarApi.createBlock(payload),
    onSuccess: invalidate,
  });
  const remove = useMutation({
    mutationFn: (id: string) => calendarApi.removeBlock(id),
    onSuccess: invalidate,
  });

  return { create, remove };
}
