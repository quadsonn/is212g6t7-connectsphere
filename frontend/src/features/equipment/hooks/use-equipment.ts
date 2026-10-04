import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import type {
  BrowseEquipmentQuery,
  CommitReservationPayload,
  CommittedReservation,
  Equipment,
  EquipmentListItem,
  EventRequirementDetails,
  EventRequirements,
  ItemAvailability,
  ReleasedReservation,
} from '@/types/api';
import { equipmentApi } from '../api/equipment.api';

export const equipmentKeys = {
  all: ['equipment'] as const,
  catalogue: (query: BrowseEquipmentQuery) => ['equipment', 'catalogue', query] as const,
  detail: (id: string) => ['equipment', 'detail', id] as const,
  requirements: ['equipment', 'requirements'] as const,
  eventRequirements: (eventId: string) => ['equipment', 'requirements', eventId] as const,
  eventDetails: (eventId: string) => ['equipment', 'requirements', eventId, 'details'] as const,
  released: ['equipment', 'released'] as const,
};

/** US-29 — the catalogue, optionally searched and sorted server-side. */
export function useEquipmentCatalogue(query: BrowseEquipmentQuery = {}) {
  return useQuery<EquipmentListItem[]>({
    queryKey: equipmentKeys.catalogue(query),
    queryFn: () => equipmentApi.listCatalogue(query),
    staleTime: 0,
  });
}

/** US-29 AC-2 — one item's full detail. */
export function useEquipmentItem(id: string) {
  return useQuery<Equipment>({
    queryKey: equipmentKeys.detail(id),
    queryFn: () => equipmentApi.getById(id),
    enabled: Boolean(id),
  });
}

/**
 * US-30 — run on demand from the form, hence a mutation rather than a query.
 *
 * Checks several equipment types for the same window at once by calling the
 * single-item endpoint once per type, in parallel. Results come back in the
 * order the types were listed.
 */
export function useCheckAvailability() {
  return useMutation<
    ItemAvailability[],
    unknown,
    { start: string; end: string; items: { equipmentId: string; quantity: number }[] }
  >({
    mutationFn: ({ start, end, items }) =>
      Promise.all(
        items.map(({ equipmentId, quantity }) =>
          equipmentApi.checkAvailability(equipmentId, { start, end, quantity }),
        ),
      ),
  });
}

/** US-31 — events with equipment requirements. */
export function useEventRequirementsList() {
  return useQuery<EventRequirements[]>({
    queryKey: equipmentKeys.requirements,
    queryFn: equipmentApi.listRequirements,
    staleTime: 0,
  });
}

/** US-31 — one event's requirements. */
export function useEventRequirements(eventId: string) {
  return useQuery<EventRequirements>({
    queryKey: equipmentKeys.eventRequirements(eventId),
    queryFn: () => equipmentApi.getRequirements(eventId),
    enabled: Boolean(eventId),
    staleTime: 0,
  });
}

/** US-31 — "View more details": the full event. */
export function useEventRequirementDetails(eventId: string) {
  return useQuery<EventRequirementDetails>({
    queryKey: equipmentKeys.eventDetails(eventId),
    queryFn: () => equipmentApi.getRequirementDetails(eventId),
    enabled: Boolean(eventId),
    staleTime: 0,
  });
}

/** US-32 — commit equipment to an event. */
export function useCommitReservation() {
  const queryClient = useQueryClient();
  return useMutation<CommittedReservation, unknown, CommitReservationPayload>({
    mutationFn: equipmentApi.commitReservation,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: equipmentKeys.all }),
  });
}

/** US-33 AC-3 — released reservations. */
export function useReleasedReservations() {
  return useQuery<ReleasedReservation[]>({
    queryKey: equipmentKeys.released,
    queryFn: equipmentApi.listReleased,
    staleTime: 0,
  });
}
