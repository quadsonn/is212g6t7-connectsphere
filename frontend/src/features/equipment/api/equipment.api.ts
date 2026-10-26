import { apiClient } from '@/lib/api-client';
import type {
  EquipmentAlternative,
  AvailabilityQuery,
  BrowseEquipmentQuery,
  ChangeEquipmentStatusPayload,
  CommitReservationPayload,
  CommittedReservation,
  Equipment,
  EquipmentListItem,
  EquipmentStatusChangeResult,
  EquipmentSubstitution,
  EventRequirementDetails,
  EventRequirements,
  ItemAvailability,
  ReleasedReservation,
  SubstitutionChoice,
  TechnicalSupportAssignment,
  UpcomingReservation,
} from '@/types/api';

export const equipmentApi = {
  // US-29 AC-1/AC-3/AC-4: the catalogue, searchable and sortable.
  listCatalogue: (query: BrowseEquipmentQuery = {}) =>
    apiClient.get<EquipmentListItem[]>('/equipment', { params: query }).then((r) => r.data),

  // US-29 AC-2: one item's full detail, including operational status.
  getById: (id: string) =>
    apiClient.get<Equipment>(`/equipment/${id}`).then((r) => r.data),

  // US-45 AC-5: reservations of the item that have not ended — the warning.
  listUpcomingReservations: (id: string) =>
    apiClient
      .get<UpcomingReservation[]>(`/equipment/${id}/upcoming-reservations`)
      .then((r) => r.data),

  // US-45 AC-1/AC-2/AC-3: change an item's status, with a reason.
  changeStatus: (id: string, payload: ChangeEquipmentStatusPayload) =>
    apiClient
      .patch<EquipmentStatusChangeResult>(`/equipment/${id}/status`, payload)
      .then((r) => r.data),

  // Items that could replace a reservation's equipment: in service, with the
  // reservation's full quantity free.
  listAlternatives: (reservationId: string) =>
    apiClient
      .get<EquipmentAlternative[]>(`/equipment/reservations/${reservationId}/alternatives`)
      .then((r) => r.data),

  // Answer for a reservation of an item that is already out of service.
  suggestSubstitution: (
    reservationId: string,
    payload: Omit<SubstitutionChoice, 'reservationId'>,
  ) =>
    apiClient
      .post<EquipmentSubstitution>(`/equipment/reservations/${reservationId}/substitution`, payload)
      .then((r) => r.data),

  // The Coordinator's answer to a proposal.
  acceptSubstitution: (id: string) =>
    apiClient.post<EquipmentSubstitution>(`/equipment-substitutions/${id}/accept`).then((r) => r.data),
  declineSubstitution: (id: string) =>
    apiClient.post<EquipmentSubstitution>(`/equipment-substitutions/${id}/decline`).then((r) => r.data),

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
