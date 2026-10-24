import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import type {
  TechnicalSupportAssignmentView,
  CancelEventPayload,
  CancellationResult,
  CatalogueOption,
  ConfirmationReadiness,
  ChangeRequest,
  ChangeRequestApproval,
  ChangeRequestPayload,
  ChangeRequestReview,
  PendingChangeRequestSummary,
  CoordinatorRequestView,
  EventRequest,
  EventRequestPayload,
  EventChangeHistory,
  OrganiserRequestView,
  PlanningUpdatePayload,
  PublicEventView,
  RelatedEventView,
  TechnicalRequirementsPayload,
  RejectUnfulfillablePayload,
  UnfulfillableRejection,
} from '@/types/api';
import { eventsApi } from '../api/events.api';

export const eventKeys = {
  all: ['events'] as const,
  mine: ['events', 'mine'] as const,
  detail: (id: string) => ['events', id] as const,
  publicDetail: (id: string) => ['events', 'public', id] as const,
  assigned: ['events', 'assigned'] as const,
  assignedDetail: (id: string) => ['events', 'assigned', id] as const,
  history: (id: string) => ['events', id, 'history'] as const,
  readiness: (id: string) => ['events', id, 'confirmation-readiness'] as const,
  related: ['events', 'related'] as const,
  equipmentCatalogue: ['events', 'equipment-catalogue'] as const,
  pendingChangeRequests: ['events', 'change-requests', 'pending'] as const,
  changeRequestReview: (id: string) => ['events', 'change-requests', id] as const,
  relatedDetail: (id: string) => ['events', 'related', id] as const,
  technicalSupport: (id: string) => ['events', id, 'technical-support'] as const,
};

/** US-61 — the event's Technical Support assignee and every member's availability. */
export function useTechnicalSupportAssignment(id: string) {
  return useQuery<TechnicalSupportAssignmentView>({
    queryKey: eventKeys.technicalSupport(id),
    queryFn: () => eventsApi.getTechnicalSupport(id),
    enabled: Boolean(id),
    staleTime: 0,
  });
}

/**
 * US-61 — assign, change or remove the member (staffId null removes).
 * Refreshes every event query: the availability and the history both change.
 */
export function useSetTechnicalSupport(id: string) {
  const queryClient = useQueryClient();
  return useMutation<TechnicalSupportAssignmentView, unknown, string | null>({
    mutationFn: (staffId) =>
      staffId ? eventsApi.assignTechnicalSupport(id, staffId) : eventsApi.unassignTechnicalSupport(id),
    onSuccess: (view) => {
      queryClient.setQueryData(eventKeys.technicalSupport(id), view);
      void queryClient.invalidateQueries({ queryKey: eventKeys.all });
    },
    // AC-2/AC-4: a refusal may mean someone else just took the member, so
    // reload who is free.
    onError: () => void queryClient.invalidateQueries({ queryKey: eventKeys.technicalSupport(id) }),
  });
}

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

/**
 * US-47 — reject an approved request that cannot be fulfilled. Refreshes the
 * event and every booking list, since its bookings are released with it.
 */
export function useRejectUnfulfillable(id: string) {
  const queryClient = useQueryClient();
  return useMutation<UnfulfillableRejection, unknown, RejectUnfulfillablePayload>({
    mutationFn: (payload) => eventsApi.rejectUnfulfillable(id, payload),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: eventKeys.all });
      void queryClient.invalidateQueries({ queryKey: ['bookings'] });
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

/**
 * US-02 — one event in the Attendee's public view, for the event detail
 * screen. A separate key from the Organiser/Coordinator detail reads so the
 * projected shape is never served to, or from, a full-record cache entry.
 */
export function usePublicEvent(id: string | undefined) {
  return useQuery<PublicEventView>({
    queryKey: eventKeys.publicDetail(id ?? ''),
    queryFn: () => eventsApi.getPublicById(id!),
    enabled: Boolean(id),
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

/** US-37 — the equipment catalogue the change request picker offers. */
export function useEquipmentCatalogueOptions() {
  return useQuery<CatalogueOption[]>({
    queryKey: eventKeys.equipmentCatalogue,
    queryFn: eventsApi.listEquipmentCatalogue,
  });
}

/**
 * US-37 — submit a change request. Refreshes the event so the pending request
 * appears beside the original details straight away.
 */
export function useRequestChange(id: string) {
  const queryClient = useQueryClient();

  return useMutation<ChangeRequest, unknown, ChangeRequestPayload>({
    mutationFn: (body) => eventsApi.requestChange(id, body),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: eventKeys.detail(id) });
      void queryClient.invalidateQueries({ queryKey: eventKeys.mine });
    },
  });
}

/**
 * US-43 — cancel an event. A cancellation touches the event, its bookings and
 * reservations, the calendars and other people's notifications, so every cached
 * query is refreshed rather than a hand-picked few.
 */
export function useCancelEvent(id: string) {
  const queryClient = useQueryClient();

  return useMutation<CancellationResult, unknown, CancelEventPayload>({
    mutationFn: (body) => eventsApi.cancel(id, body),
    onSuccess: () => {
      void queryClient.invalidateQueries();
    },
  });
}

/** US-38 AC-1 — pending change requests on the Coordinator's own events. */
export function usePendingChangeRequests() {
  return useQuery<PendingChangeRequestSummary[]>({
    queryKey: eventKeys.pendingChangeRequests,
    queryFn: eventsApi.listPendingChangeRequests,
  });
}

/** US-38 AC-2 / AC-6 — one request, beside the event, with any warnings. */
export function useChangeRequestReview(requestId: string | undefined) {
  return useQuery<ChangeRequestReview>({
    queryKey: eventKeys.changeRequestReview(requestId ?? ''),
    queryFn: () => eventsApi.getChangeRequestForReview(requestId!),
    enabled: Boolean(requestId),
    // US-48: every fetch re-runs the arrangement check, so it is never served
    // stale, and it runs again whenever the page regains focus — another
    // booking may have been made meanwhile. (The app turns focus refetching
    // off by default; this query opts back in.)
    staleTime: 0,
    refetchOnWindowFocus: 'always',
  });
}

/**
 * US-38 — approve or reject. Both refresh everything under 'events': the queue,
 * this request, and (for an approval) the event itself and its history.
 */
export function useDecideChangeRequest(requestId: string) {
  const queryClient = useQueryClient();

  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: eventKeys.all });
  };

  const approve = useMutation<ChangeRequestApproval>({
    mutationFn: () => eventsApi.approveChangeRequest(requestId),
    // US-48 AC-8: a refused approval (something changed after the page
    // loaded) must refresh the check too, so Approve becomes disabled.
    onSettled: refresh,
  });

  const reject = useMutation<ChangeRequest, unknown, string>({
    mutationFn: (reason) => eventsApi.rejectChangeRequest(requestId, reason),
    onSuccess: refresh,
  });

  return { approve, reject };
}

/** US-42 — the Coordinator's confirmation checklist. */
export function useConfirmationReadiness(id: string, enabled = true) {
  return useQuery<ConfirmationReadiness>({
    queryKey: eventKeys.readiness(id),
    queryFn: () => eventsApi.getConfirmationReadiness(id),
    enabled: enabled && Boolean(id),
  });
}

/**
 * US-42 — confirm the arrangements. Everything under 'events' is refreshed:
 * the status badge, the queue and the checklist all change.
 */
export function useConfirmArrangements(id: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: () => eventsApi.confirmArrangements(id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: eventKeys.all });
    },
  });
}

/** US-42 — tick or untick a free-text line; the checklist is refetched. */
export function useManualCheck(id: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ requirementId, checked }: { requirementId: string; checked: boolean }) =>
      eventsApi.setManualCheck(id, requirementId, checked),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: eventKeys.readiness(id) });
      void queryClient.invalidateQueries({ queryKey: eventKeys.assignedDetail(id) });
    },
  });
}
