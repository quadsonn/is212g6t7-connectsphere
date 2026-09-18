import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import type {
  EventRequest,
  EventRequestPayload,
  OrganiserRequestView,
  PublicEventView,
} from '@/types/api';
import { eventsApi } from '../api/events.api';

export const eventKeys = {
  all: ['events'] as const,
  mine: ['events', 'mine'] as const,
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

/**
 * US-05 — the Organiser's own requests. Same records as GET /events for this
 * role, plus the status view: decision reasons and outstanding clarifications.
 */
export function useMyRequests() {
  return useQuery<OrganiserRequestView[]>({
    queryKey: eventKeys.mine,
    queryFn: eventsApi.listMine,
  });
}

/**
 * US-03/US-04 — raise a request, either submitted outright or kept as a draft.
 *
 * Both invalidate the Organiser's list so the new request is there when the
 * form navigates back, rather than after a stale window.
 */
export function useCreateEventRequest() {
  const queryClient = useQueryClient();

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: eventKeys.all });
  };

  const submit = useMutation({
    mutationFn: (body: EventRequestPayload) => eventsApi.createAndSubmit(body),
    onSuccess: invalidate,
  });

  const saveDraft = useMutation({
    mutationFn: (body: EventRequestPayload) => eventsApi.saveDraft(body),
    onSuccess: invalidate,
  });

  return { submit, saveDraft };
}

/** Same endpoint, projected shape — an Attendee never receives internal fields. */
export function usePublicEvents() {
  return useQuery<PublicEventView[]>({
    queryKey: eventKeys.all,
    queryFn: eventsApi.listPublic,
  });
}
