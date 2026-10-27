import { apiClient } from '@/lib/api-client';
import type {
  AlternativeItem,
  AvailabilityQuery,
  BrowseEquipmentQuery,
  ChangeEquipmentStatusPayload,
  CommitReservationPayload,
  CommittedReservation,
  Equipment,
  EquipmentCondition,
  EquipmentListItem,
  EquipmentStatusChangeResult,
  EquipmentStatusHistoryEntry,
  EquipmentStatus,
  EquipmentSuggestion,
  EventReservationShortage,
  EventRequirementDetails,
  EventRequirements,
  ItemAvailability,
  ReleasedReservation,
  TechnicalSupportAssignment,
  UpcomingReservation,
} from '@/types/api';

/** US-45 — a move to preview before it is saved. */
export interface ProposedStatusMove {
  from: EquipmentStatus;
  to: EquipmentStatus;
  quantity: number;
}

export const equipmentApi = {
  // US-29 AC-1/AC-3/AC-4: the catalogue, searchable and sortable.
  listCatalogue: (query: BrowseEquipmentQuery = {}) =>
    apiClient.get<EquipmentListItem[]>('/equipment', { params: query }).then((r) => r.data),

  // US-29 AC-2: one item's full detail, including operational status.
  getById: (id: string) =>
    apiClient.get<Equipment>(`/equipment/${id}`).then((r) => r.data),

  // US-45 AC-5: committed reservations of the item that have not ended, each
  // with its shortage now and under a proposed move — the warning.
  listUpcomingReservations: (id: string, proposal?: ProposedStatusMove) =>
    apiClient
      .get<UpcomingReservation[]>(`/equipment/${id}/upcoming-reservations`, { params: proposal })
      .then((r) => r.data),

  // US-45: units by condition, for every item and for one.
  listConditions: () =>
    apiClient.get<EquipmentCondition[]>('/equipment/condition').then((r) => r.data),
  getCondition: (id: string) =>
    apiClient.get<EquipmentCondition>(`/equipment/${id}/condition`).then((r) => r.data),

  // US-45 AC-2: the item's status history, with quantities.
  listStatusHistory: (id: string) =>
    apiClient
      .get<EquipmentStatusHistoryEntry[]>(`/equipment/${id}/status-history`)
      .then((r) => r.data),

  // US-45: an event's reservations with their shortage (Technical Support).
  listEventReservations: (eventId: string) =>
    apiClient
      .get<EventReservationShortage[]>(`/equipment/events/${eventId}/reservations`)
      .then((r) => r.data),

  // US-45: resolve a shortage by hand — reduce or release, with a reason.
  reduceReservation: (id: string, payload: { quantity: number; reason: string }) =>
    apiClient.patch(`/equipment/reservations/${id}`, payload).then((r) => r.data),
  releaseReservation: (id: string, payload: { reason: string }) =>
    apiClient.post(`/equipment/reservations/${id}/release`, payload).then((r) => r.data),

  // US-45: items free in the needed quantity, and suggesting one.
  listAlternatives: (id: string, quantity: number) =>
    apiClient
      .get<AlternativeItem[]>(`/equipment/reservations/${id}/alternatives`, { params: { quantity } })
      .then((r) => r.data),
  suggestAlternative: (
    id: string,
    payload: { alternativeEquipmentId: string; quantity: number; reason: string },
  ) =>
    apiClient
      .post<EquipmentSuggestion>(`/equipment/reservations/${id}/suggestions`, payload)
      .then((r) => r.data),

  // US-45: the Coordinator decides a suggestion.
  acceptSuggestion: (id: string) =>
    apiClient.post(`/equipment/suggestions/${id}/accept`).then((r) => r.data),
  declineSuggestion: (id: string) =>
    apiClient.post(`/equipment/suggestions/${id}/decline`).then((r) => r.data),

  // US-45 AC-1/AC-2/AC-3: move a quantity of units between statuses, with a reason.
  changeStatus: (id: string, payload: ChangeEquipmentStatusPayload) =>
    apiClient
      .patch<EquipmentStatusChangeResult>(`/equipment/${id}/status`, payload)
      .then((r) => r.data),

  // US-30: free units of one item for a date and time.
  checkAvailability: (equipmentId: string, query: AvailabilityQuery) =>
    apiClient
      .get<ItemAvailability>(`/equipment/${equipmentId}/availability`, { params: query })
      .then((r) => r.data),

  // US-31 AC-4: submitted events that have equipment requirements.
  // #30 AC-4: finished events only when asked for.
  listRequirements: (includeFinished = false) =>
    apiClient
      .get<EventRequirements[]>('/equipment/requirements', {
        params: includeFinished ? { includeFinished: true } : undefined,
      })
      .then((r) => r.data),

  // US-31 AC-1/AC-2/AC-3: one event's requirements.
  getRequirements: (eventId: string) =>
    apiClient
      .get<EventRequirements>(`/equipment/requirements/${eventId}`)
      .then((r) => r.data),

  // US-31: "View more details" — the full event, under the same rule.
  getRequirementDetails: (eventId: string) =>
    apiClient
      .get<EventRequirementDetails>(`/equipment/requirements/${eventId}/details`)
      .then((r) => r.data),

  // US-32: commit a quantity of an item to an event.
  commitReservation: (payload: CommitReservationPayload) =>
    apiClient
      .post<CommittedReservation>('/equipment/reservations', payload)
      .then((r) => r.data),

  // US-33 AC-3: reservations released because their event was cancelled.
  listReleased: () =>
    apiClient
      .get<ReleasedReservation[]>('/equipment/reservations/released')
      .then((r) => r.data),

  // US-61 AC-3: the events the caller is assigned to as Technical Support.
  listMyAssignments: () =>
    apiClient
      .get<TechnicalSupportAssignment[]>('/technical-support/assignments')
      .then((r) => r.data),
};
