import { useQuery } from '@tanstack/react-query';

import type { EventRequest, PublicEventView } from '@/types/api';
import { eventsApi } from '../api/events.api';

export const eventKeys = {
  all: ['events'] as const,
  detail: (id: string) => ['events', id] as const,
};

/**
 * The caller's events, scoped by the server. Organiser and Coordinator both
 * use this — what comes back differs because the backend decides, not the UI.
 */
export function useEvents() {
  return useQuery<EventRequest[]>({
    queryKey: eventKeys.all,
    queryFn: eventsApi.list,
  });
}

/** Same endpoint, projected shape — an Attendee never receives internal fields. */
export function usePublicEvents() {
  return useQuery<PublicEventView[]>({
    queryKey: eventKeys.all,
    queryFn: eventsApi.listPublic,
  });
}
