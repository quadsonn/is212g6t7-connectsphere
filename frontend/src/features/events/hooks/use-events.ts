import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import type {
  CoordinatorRequestView,
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
  assigned: ['events', 'assigned'] as const,
  assignedDetail: (id: string) => ['events', 'assigned', id] as const,
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

export function useEventDetail(id: string | null, assigned = true) {
  return useQuery<EventRequest>({
    queryKey: [...eventKeys.detail(id ?? ''), assigned ? 'assigned' : 'mine'],
    queryFn: () => (assigned ? eventsApi.getAssignedById(id!) : eventsApi.getMineById(id!)),
    enabled: id !== null,
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

export function useReviewEvent() {
  const queryClient = useQueryClient();

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: eventKeys.all });
  };

  const approve = useMutation({
    mutationFn: (id: string) => eventsApi.approve(id),
    onSuccess: invalidate,
  });

  const requestClarification = useMutation({
    mutationFn: ({ id, question }: { id: string; question: string }) =>
      eventsApi.requestClarification(id, question),
    onSuccess: invalidate,
  });

  const reject = useMutation({
    mutationFn: ({ id, reason }: { id: string; reason: string }) =>
      eventsApi.reject(id, reason),
    onSuccess: invalidate,
  });

  const returnForAmendment = useMutation({
    mutationFn: ({ id, reason }: { id: string; reason: string }) =>
      eventsApi.returnForAmendment(id, reason),
    onSuccess: invalidate,
  });

  return { approve, requestClarification, reject, returnForAmendment };
}

/** US-10 — link a Coordinator to a request as its main point of contact. */
export function useAssignCoordinator() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, coordinatorId }: { id: string; coordinatorId: string }) =>
      eventsApi.assignCoordinator(id, coordinatorId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: eventKeys.all });
    },
  });
}

export function useRespondToClarification() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, response }: { id: string; response: string }) =>
      eventsApi.respondToClarification(id, response),
    onSuccess: (_, variables) => {
      void queryClient.invalidateQueries({ queryKey: eventKeys.all });
      void queryClient.invalidateQueries({ queryKey: eventKeys.mine });
      void queryClient.invalidateQueries({ queryKey: eventKeys.detail(variables.id) });
    },
  });
}

/** Same endpoint, projected shape — an Attendee never receives internal fields. */
export function usePublicEvents() {
  return useQuery<PublicEventView[]>({
    queryKey: eventKeys.all,
    queryFn: eventsApi.listPublic,
  });
}

/** The Coordinator's queue, in full detail. */
export function useAssignedRequests() {
  return useQuery<CoordinatorRequestView[]>({
    queryKey: eventKeys.assigned,
    queryFn: eventsApi.listAssigned,
  });
}

/** One request from the Coordinator's queue, with every detail. */
export function useAssignedRequest(id: string) {
  return useQuery<CoordinatorRequestView>({
    queryKey: eventKeys.assignedDetail(id),
    queryFn: () => eventsApi.getAssignedById(id),
    enabled: Boolean(id),
  });
}
