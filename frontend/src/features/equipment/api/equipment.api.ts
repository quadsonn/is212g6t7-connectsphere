import { apiClient } from '@/lib/api-client';
import type {
  AvailabilityQuery,
  BrowseEquipmentQuery,
  CommitReservationPayload,
  CommittedReservation,
  Equipment,
  EquipmentListItem,
  EventRequirements,
  ItemAvailability,
  ReleasedReservation,
} from '@/types/api';

export const equipmentApi = {
  // US-29 AC-1/AC-3/AC-4: the catalogue, searchable and sortable.
  listCatalogue: (query: BrowseEquipmentQuery = {}) =>
    apiClient.get<EquipmentListItem[]>('/equipment', { params: query }).then((r) => r.data),

  // US-29 AC-2: one item's full detail, including operational status.
  getById: (id: string) =>
    apiClient.get<Equipment>(`/equipment/${id}`).then((r) => r.data),

  // US-30: free units of one item for a date and time.
  checkAvailability: (equipmentId: string, query: AvailabilityQuery) =>
    apiClient
      .get<ItemAvailability>(`/equipment/${equipmentId}/availability`, { params: query })
      .then((r) => r.data),

  // US-31 AC-4: submitted events that have equipment requirements.
  listRequirements: () =>
    apiClient.get<EventRequirements[]>('/equipment/requirements').then((r) => r.data),

  // US-31 AC-1/AC-2/AC-3: one event's requirements.
  getRequirements: (eventId: string) =>
    apiClient
      .get<EventRequirements>(`/equipment/requirements/${eventId}`)
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
};
