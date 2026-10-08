import { apiClient } from '@/lib/api-client';
import type {
  CatalogueOption,
  ChangeRequest,
  ChangeRequestApproval,
  ChangeRequestPayload,
  ChangeRequestReview,
  PendingChangeRequestSummary,
  ContactSummary,
  CoordinatorRequestView,
  EventRequest,
  EventRequestPayload,
  EventChangeHistory,
  OrganiserRequestView,
  PlanningUpdatePayload,
  PlanningUpdateResult,
  PublicEventView,
  TechnicalRequirementsPayload,
  RelatedEventView,
} from '@/types/api';

/**
 * REAL — GET /events and GET /events/:id exist.
 *
 * The backend scopes the result to the caller (US-02): an Organiser gets their
 * own, a Coordinator gets assigned events, an Attendee gets the projected
 * public view. The client sends the same request for all three; the server
 * decides what comes back.
 */
export const eventsApi = {
  list: () => apiClient.get<EventRequest[]>('/events').then((r) => r.data),

  getMineById: (id: string) =>
    apiClient.get<OrganiserRequestView>(`/events/mine/${id}`).then((r) => r.data),

  listPublic: () =>
    apiClient.get<PublicEventView[]>('/events').then((r) => r.data),

  getById: (id: string) =>
    apiClient.get<EventRequest>(`/events/${id}`).then((r) => r.data),

  /** US-05 — the Organiser's own requests, with status detail. */
  listMine: () =>
    apiClient.get<OrganiserRequestView[]>('/events/mine').then((r) => r.data),

  /** US-05 — one of the Organiser's own requests, with status detail. */
  getMine: (id: string) =>
    apiClient.get<OrganiserRequestView>(`/events/mine/${id}`).then((r) => r.data),

  /** US-03 — create and submit in one step. Returns the SUBMITTED record. */
  createAndSubmit: (body: EventRequestPayload) =>
    apiClient.post<EventRequest>('/events', body).then((r) => r.data),

  /** US-04 — save an incomplete draft. */
  saveDraft: (body: EventRequestPayload) =>
    apiClient.post<EventRequest>('/events/drafts', body).then((r) => r.data),

  /** US-04 AC-2 — continue editing a draft (or a RETURNED request, US-08). */
  updateDraft: (id: string, body: EventRequestPayload) =>
    apiClient.patch<EventRequest>(`/events/${id}`, body).then((r) => r.data),

  /** US-04 — submit a draft that is now complete. */
  submitDraft: (id: string) =>
    apiClient.post<EventRequest>(`/events/${id}/submit`).then((r) => r.data),

  /** US-37 — propose a change to one of the Organiser's submitted events. */
  requestChange: (id: string, body: ChangeRequestPayload) =>
    apiClient.post<ChangeRequest>(`/events/${id}/change-requests`, body).then((r) => r.data),

  /** US-38 AC-1 — pending change requests on the Coordinator's own events. */
  listPendingChangeRequests: () =>
    apiClient
      .get<PendingChangeRequestSummary[]>('/events/change-requests/pending')
      .then((r) => r.data),

  /** US-38 AC-2 / AC-6 — one request, beside the event, with any warnings. */
  getChangeRequestForReview: (requestId: string) =>
    apiClient
      .get<ChangeRequestReview>(`/events/change-requests/${requestId}`)
      .then((r) => r.data),

  /** US-38 AC-4 — approve: the event takes the proposed values. */
  approveChangeRequest: (requestId: string) =>
    apiClient
      .post<ChangeRequestApproval>(`/events/change-requests/${requestId}/approve`)
      .then((r) => r.data),

  /** US-38 AC-3 — reject, with a reason. */
  rejectChangeRequest: (requestId: string, reason: string) =>
    apiClient
      .post<ChangeRequest>(`/events/change-requests/${requestId}/reject`, { reason })
      .then((r) => r.data),

  /** US-37 — the equipment catalogue, for the change request picker. */
  listEquipmentCatalogue: () =>
    apiClient.get<CatalogueOption[]>('/events/equipment-catalogue').then((r) => r.data),

  /** The Coordinator's queue, in full detail. */
  listAssigned: () =>
    apiClient.get<CoordinatorRequestView[]>('/events/assigned').then((r) => r.data),

  /** One request from the Coordinator's queue, with every detail. */
  getAssignedById: (id: string) =>
    apiClient.get<CoordinatorRequestView>(`/events/assigned/${id}`).then((r) => r.data),

  /** US-10 — link a Coordinator to a request as its main point of contact. */
  assignCoordinator: (id: string, coordinatorId: string) =>
    apiClient
      .patch<CoordinatorRequestView>(`/events/${id}/coordinator`, { coordinatorId })
      .then((r) => r.data),

  approve: (id: string) =>
    apiClient.post<EventRequest>(`/events/${id}/approve`).then((r) => r.data),

  requestClarification: (id: string, question: string) =>
    apiClient
      .post<EventRequest>(`/events/${id}/clarifications`, { question })
      .then((r) => r.data),

  reject: (id: string, reason: string) =>
    apiClient
      .post<EventRequest>(`/events/${id}/reject`, { reason })
      .then((r) => r.data),

  returnForAmendment: (id: string, reason: string) =>
    apiClient
      .post<EventRequest>(`/events/${id}/return`, { reason })
      .then((r) => r.data),

  /** US-25 — APPROVED -> PLANNING. */
  startPlanning: (id: string) =>
    apiClient
      .post<CoordinatorRequestView>(`/events/${id}/start-planning`)
      .then((r) => r.data),

  /** US-25 — update an event's information during planning. */
  updatePlanning: (id: string, body: PlanningUpdatePayload) =>
    apiClient
      .patch<PlanningUpdateResult>(`/events/${id}/planning`, body)
      .then((r) => r.data),

  /** US-27 AC-1 — the Coordinators this event can be handed to. */
  getReassignmentCandidates: (id: string) =>
    apiClient
      .get<ContactSummary[]>(`/events/${id}/reassignment-candidates`)
      .then((r) => r.data),

  /** US-27 — hand the event to another Coordinator. */
  reassign: (id: string, coordinatorId: string) =>
    apiClient
      .post<CoordinatorRequestView>(`/events/${id}/reassign`, { coordinatorId })
      .then((r) => r.data),

  /** US-28 — record equipment and technical requirements during planning. */
  setTechnicalRequirements: (id: string, body: TechnicalRequirementsPayload) =>
    apiClient
      .patch<PlanningUpdateResult>(`/events/${id}/technical-requirements`, body)
      .then((r) => r.data),

  /** US-26 — the event's change history, oldest first. */
  getHistory: (id: string) =>
    apiClient.get<EventChangeHistory>(`/events/${id}/history`).then((r) => r.data),

  /** US-25 AC-3 — Venue Staff / Technical Support: events related to their work. */
  listRelated: () =>
    apiClient.get<RelatedEventView[]>('/events').then((r) => r.data),

  getRelated: (id: string) =>
    apiClient.get<RelatedEventView>(`/events/${id}`).then((r) => r.data),

  respondToClarification: (id: string, response: string) =>
    apiClient
      .post<OrganiserRequestView>(`/events/${id}/clarifications/responses`, {
        response,
      })
      .then((r) => r.data),
};
