import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import type {
  CoordinatorRequestView,
  EventRequest,
  EventRequestPayload,
  EventChangeHistory,
  OrganiserRequestView,
  PlanningUpdatePayload,
  PublicEventView,
  RelatedEventView,
  TechnicalRequirementsPayload,
} from '@/types/api';
import { eventsApi } from '../api/events.api';

export const eventKeys = {
  all: ['events'] as const,
  mine: ['events', 'mine'] as const,
  detail: (id: string) => ['events', id] as const,
  assigned: ['events', 'assigned'] as const,
  assignedDetail: (id: string) => ['events', 'assigned', id] as const,
  history: (id: string) => ['events', id, 'history'] as const,
  related: ['events', 'related'] as const,
  relatedDetail: (id: string) => ['events', 'related', id] as const,
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

/** US-05 — one of the Organiser's own requests, for the detail/edit views. */
export function useMyRequest(id: string | undefined) {
  return useQuery<OrganiserRequestView>({
    queryKey: eventKeys.detail(id ?? ''),
    queryFn: () => eventsApi.getMine(id!),
    enabled: Boolean(id),
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

/**
 * US-04 AC-2/AC-4 — continue editing a draft (or a RETURNED request, US-08)
 * and, separately, submit it once it is complete.
 *
 * `submit` PATCHes the latest edits before calling the submit endpoint, since
 * POST /events/:id/submit takes no body and validates the row already stored
 * — an edit made moments before clicking "Submit" must be saved first or it
 * would be silently lost.
 */
export function useUpdateEventRequest(id: string) {
  const queryClient = useQueryClient();

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: eventKeys.mine });
    void queryClient.invalidateQueries({ queryKey: eventKeys.detail(id) });
  };

  const saveChanges = useMutation({
    mutationFn: (body: EventRequestPayload) => eventsApi.updateDraft(id, body),
    onSuccess: invalidate,
  });

  const submit = useMutation({
    mutationFn: async (body: EventRequestPayload) => {
      await eventsApi.updateDraft(id, body);
      return eventsApi.submitDraft(id);
    },
    onSuccess: invalidate,
  });

  return { saveChanges, submit };
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

/** US-25 — move an approved event into planning. */
export function useStartPlanning() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => eventsApi.startPlanning(id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: eventKeys.all });
    },
  });
}

/**
 * US-25 — save planning edits. Invalidates everything under 'events' so the
 * detail view, the queue and the change history all show the saved values.
 */
export function useUpdatePlanning(id: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (body: PlanningUpdatePayload) => eventsApi.updatePlanning(id, body),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: eventKeys.all });
    },
  });
}

/** US-26 — the event's change history. */
export function useEventHistory(id: string) {
  return useQuery<EventChangeHistory>({
    queryKey: eventKeys.history(id),
    queryFn: () => eventsApi.getHistory(id),
    enabled: Boolean(id),
  });
}

/** US-25 AC-3 — events related to a Venue Staff / Technical Support user's work. */
export function useRelatedEvents() {
  return useQuery<RelatedEventView[]>({
    queryKey: eventKeys.related,
    queryFn: eventsApi.listRelated,
  });
}

export function useRelatedEvent(id: string) {
  return useQuery<RelatedEventView>({
    queryKey: eventKeys.relatedDetail(id),
    queryFn: () => eventsApi.getRelated(id),
    enabled: Boolean(id),
  });
}

/** US-27 AC-1 — only fetched once the Coordinator asks to reassign. */
export function useReassignmentCandidates(id: string, enabled: boolean) {
  return useQuery({
    queryKey: [...eventKeys.detail(id), 'reassignment-candidates'],
    queryFn: () => eventsApi.getReassignmentCandidates(id),
    enabled: enabled && Boolean(id),
  });
}

/**
 * US-27 — hand the event on. The caller loses access to it on success, so
 * only the lists are invalidated; refetching this event's detail would 404.
 */
export function useReassignEvent(id: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (coordinatorId: string) => eventsApi.reassign(id, coordinatorId),
    onSuccess: () => {
      queryClient.removeQueries({ queryKey: eventKeys.assignedDetail(id) });
      void queryClient.invalidateQueries({ queryKey: eventKeys.all, exact: true });
      void queryClient.invalidateQueries({ queryKey: eventKeys.assigned, exact: true });
    },
  });
}

/** US-28 — save equipment and technical requirements; refreshes detail and history. */
export function useSetTechnicalRequirements(id: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (body: TechnicalRequirementsPayload) =>
      eventsApi.setTechnicalRequirements(id, body),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: eventKeys.all });
    },
  });
}
