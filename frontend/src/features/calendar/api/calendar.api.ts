import { apiClient } from '@/lib/api-client';
import type { CalendarQuery, CalendarView, VenueBlockPayload, VenueBlockResult } from '@/types/api';

/** REAL — the Venue Staff availability calendar (US-16). */
export const calendarApi = {
  // AC-1..AC-5: venues, bookings and blocks in a window.
  get: (query: CalendarQuery) =>
    apiClient.get<CalendarView>('/calendar', { params: query }).then((r) => r.data),

  // AC-6: block out a period.
  createBlock: (payload: VenueBlockPayload) =>
    apiClient.post<VenueBlockResult>('/calendar/blocks', payload).then((r) => r.data),

  removeBlock: (id: string) => apiClient.delete(`/calendar/blocks/${id}`).then(() => undefined),
};
