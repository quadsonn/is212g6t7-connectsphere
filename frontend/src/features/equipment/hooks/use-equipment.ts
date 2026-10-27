import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';

import { eventKeys } from '@/features/events/hooks/use-events';
import type {
  EquipmentAlternative,
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
  TechnicalSupportAssignment,
  UpcomingReservation,
} from '@/types/api';
import { equipmentApi } from '../api/equipment.api';

export const equipmentKeys = {
  all: ['equipment'] as const,
  catalogue: (query: BrowseEquipmentQuery) => ['equipment', 'catalogue', query] as const,
  detail: (id: string) => ['equipment', 'detail', id] as const,
  upcoming: (id: string) => ['equipment', 'detail', id, 'upcoming-reservations'] as const,
  requirements: ['equipment', 'requirements'] as const,
  eventRequirements: (eventId: string) => ['equipment', 'requirements', eventId] as const,
  eventDetails: (eventId: string) => ['equipment', 'requirements', eventId, 'details'] as const,
  released: ['equipment', 'released'] as const,
  alternatives: (reservationId: string) => ['equipment', 'alternatives', reservationId] as const,
  assignments: ['equipment', 'assignments'] as const,
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
 * US-45 AC-5 — the item's reservations that have not ended, fetched only
 * while a Damaged or Under Maintenance change is being prepared.
 */
export function useUpcomingReservations(id: string, enabled: boolean) {
  return useQuery<UpcomingReservation[]>({
    queryKey: equipmentKeys.upcoming(id),
    queryFn: () => equipmentApi.listUpcomingReservations(id),
    enabled: Boolean(id) && enabled,
    staleTime: 0,
  });
}

/**
 * US-45 — change an item's status. Invalidates every equipment query: the
 * item's detail, and any availability the status now changes (AC-4).
 */
export function useChangeEquipmentStatus(id: string) {
  const queryClient = useQueryClient();
  return useMutation<EquipmentStatusChangeResult, unknown, ChangeEquipmentStatusPayload>({
    mutationFn: (payload) => equipmentApi.changeStatus(id, payload),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: equipmentKeys.all }),
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
export function useEventRequirementsList(includeFinished = false) {
  return useQuery<EventRequirements[]>({
    // Under the shared key, so invalidating the requirements refreshes both lists.
    queryKey: [...equipmentKeys.requirements, { includeFinished }],
    queryFn: () => equipmentApi.listRequirements(includeFinished),
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

/** US-61 AC-3 — the events the caller is assigned to support. */
export function useMyTechnicalSupportAssignments() {
  return useQuery<TechnicalSupportAssignment[]>({
    queryKey: equipmentKeys.assignments,
    queryFn: equipmentApi.listMyAssignments,
    staleTime: 0,
  });
}

/** The dropdown for one reservation: items that could replace its equipment. */
export function useAlternatives(reservationId: string, enabled = true) {
  return useQuery<EquipmentAlternative[]>({
    queryKey: equipmentKeys.alternatives(reservationId),
    queryFn: () => equipmentApi.listAlternatives(reservationId),
    enabled: Boolean(reservationId) && enabled,
    staleTime: 0,
  });
}

/**
 * The Coordinator's answer to a proposal. Accepting moves a reservation and
 * declining clears the proposal, so the event, its flag and the equipment
 * queries are all refreshed.
 */
export function useDecideSubstitution() {
  const queryClient = useQueryClient();
  return useMutation<EquipmentSubstitution, unknown, { id: string; action: 'accept' | 'decline' }>({
    mutationFn: ({ id, action }) =>
      action === 'accept'
        ? equipmentApi.acceptSubstitution(id)
        : equipmentApi.declineSubstitution(id),
    onSuccess: (_result, { action }) =>
      toast.success(
        action === 'accept'
          ? 'Replacement accepted. The reservation and the required equipment now use it.'
          : 'Equipment problem acknowledged. The event goes ahead.',
      ),
    // A 409 means the world moved (the alternative filled up): show the
    // server's reason, but refresh so the flag reflects the truth.
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: eventKeys.all });
      void queryClient.invalidateQueries({ queryKey: equipmentKeys.all });
    },
  });
}
